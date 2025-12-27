import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { createHmac } from "crypto";
import { db } from "../lib/db";
import { requireAuth, requireAdmin, requireServerAccess } from "../middleware/auth";
import type { Variables } from "../types";

const servers = new Hono<{ Variables: Variables }>();

// Download token secret - should be set in environment
const DOWNLOAD_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET || "stellarstack-download-secret";
// Token expiration time in seconds (5 minutes)
const DOWNLOAD_TOKEN_EXPIRY = 300;

// Generate a signed download token
function generateDownloadToken(userId: string, serverId: string, resource: string): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_EXPIRY;
  const payload = `${userId}:${serverId}:${resource}:${expiresAt}`;
  const signature = createHmac("sha256", DOWNLOAD_SECRET).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${signature}`).toString("base64url");
  return { token, expiresAt };
}

// Verify a download token and return the parsed data
function verifyDownloadToken(token: string): { valid: boolean; userId?: string; serverId?: string; resource?: string } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");

    // The signature is the last 64 characters (SHA256 hex), preceded by expiration timestamp
    // Format: userId:serverId:resource:expiresAt:signature
    // Since resource can contain colons, we parse from the end
    const lastColonIndex = decoded.lastIndexOf(":");
    if (lastColonIndex === -1) return { valid: false };

    const signature = decoded.slice(lastColonIndex + 1);
    const withoutSignature = decoded.slice(0, lastColonIndex);

    const secondLastColonIndex = withoutSignature.lastIndexOf(":");
    if (secondLastColonIndex === -1) return { valid: false };

    const expiresAtStr = withoutSignature.slice(secondLastColonIndex + 1);
    const expiresAt = parseInt(expiresAtStr, 10);

    // Now parse userId and serverId from the beginning
    const payloadWithoutExpiry = withoutSignature.slice(0, secondLastColonIndex);
    const firstColonIndex = payloadWithoutExpiry.indexOf(":");
    if (firstColonIndex === -1) return { valid: false };

    const userId = payloadWithoutExpiry.slice(0, firstColonIndex);
    const rest = payloadWithoutExpiry.slice(firstColonIndex + 1);

    // serverId is a UUID (36 chars) followed by colon and resource
    const secondColonIndex = rest.indexOf(":");
    if (secondColonIndex === -1) return { valid: false };

    const serverId = rest.slice(0, secondColonIndex);
    const resource = rest.slice(secondColonIndex + 1);

    // Check expiration
    if (Date.now() / 1000 > expiresAt) {
      return { valid: false };
    }

    // Verify signature
    const payload = `${userId}:${serverId}:${resource}:${expiresAt}`;
    const expectedSignature = createHmac("sha256", DOWNLOAD_SECRET).update(payload).digest("hex");
    if (signature !== expectedSignature) {
      return { valid: false };
    }

    return { valid: true, userId, serverId, resource };
  } catch {
    return { valid: false };
  }
}

// Helper to convert BigInt fields to Number for JSON serialization
function serializeServer(server: any) {
  return {
    ...server,
    memory: Number(server.memory),
    disk: Number(server.disk),
    swap: Number(server.swap),
  };
}

// Validation schemas
const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  nodeId: z.string(),
  blueprintId: z.string(),
  ownerId: z.string().optional(), // Admin can assign to any user
  memory: z.number().int().positive(), // Memory in MiB
  disk: z.number().int().positive(), // Disk in MiB
  cpu: z.number().positive(), // CPU as percentage (100 = 1 thread)
  cpuPinning: z.string().optional(), // CPU pinning (e.g., "0,1,2,3" or "0-4")
  swap: z.number().int().default(-1), // Swap in MiB: -1 = unlimited, 0 = disabled, >0 = limited
  oomKillDisable: z.boolean().default(false), // Disable OOM killer
  backupLimit: z.number().int().min(0).default(3), // Backup limit
  allocationIds: z.array(z.string()).min(1), // At least one allocation
  config: z.record(z.any()).optional(), // Override blueprint config
  variables: z.record(z.string()).optional(), // Override blueprint variables
  dockerImage: z.string().optional(), // Selected docker image from blueprint
});

const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  memory: z.number().int().positive().optional(), // MiB
  disk: z.number().int().positive().optional(), // MiB
  cpu: z.number().positive().optional(), // Percentage
  cpuPinning: z.string().nullable().optional(),
  swap: z.number().int().optional(), // MiB
  oomKillDisable: z.boolean().optional(),
  backupLimit: z.number().int().min(0).optional(),
  config: z.record(z.any()).optional(),
});

const updateStartupSchema = z.object({
  variables: z.record(z.string()).optional(), // { "MINECRAFT_VERSION": "1.20.4", ... }
  dockerImage: z.string().optional(), // Selected docker image from blueprint
});

// Helper to communicate with daemon
async function daemonRequest(
  node: { host: string; port: number; protocol: string; token: string },
  method: string,
  path: string,
  body?: any,
  options?: { responseType?: "json" | "text" }
) {
  const protocol = node.protocol === "HTTPS" || node.protocol === "HTTPS_PROXY" ? "https" : "http";
  const url = `${protocol}://${node.host}:${node.port}${path}`;

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${node.token}`,
    };

    // Only set Content-Type if there's a body
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Daemon error: ${error}`);
    }

    // Return text or JSON based on options
    if (options?.responseType === "text") {
      return response.text();
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) return {};

    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to communicate with daemon: ${error}`);
  }
}

// List servers (users see their own, admins see all)
servers.get("/", requireAuth, async (c) => {
  const user = c.get("user");

  const where = user.role === "admin" ? {} : { ownerId: user.id };

  const allServers = await db.server.findMany({
    where,
    include: {
      node: {
        select: {
          id: true,
          displayName: true,
          isOnline: true,
          location: {
            select: {
              id: true,
              name: true,
              country: true,
              city: true,
            },
          },
        },
      },
      blueprint: {
        select: { id: true, name: true, imageName: true },
      },
      owner: {
        select: { id: true, name: true, email: true },
      },
      allocations: {
        select: { id: true, ip: true, port: true, alias: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json(allServers.map(serializeServer));
});

// Get single server
servers.get("/:serverId", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: {
      node: {
        select: {
          id: true,
          displayName: true,
          host: true,
          port: true,
          protocol: true,
          isOnline: true,
          location: {
            select: {
              id: true,
              name: true,
              country: true,
              city: true,
            },
          },
        },
      },
      blueprint: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
      allocations: true,
    },
  });

  return c.json(fullServer ? serializeServer(fullServer) : null);
});

// Create server (admin only for now, could allow users with quotas later)
servers.post("/", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = createServerSchema.safeParse(body);
  const user = c.get("user");

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  // Verify node exists and get its details
  const node = await db.node.findUnique({
    where: { id: parsed.data.nodeId },
  });

  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  if (!node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  // Verify blueprint exists
  const blueprint = await db.blueprint.findUnique({
    where: { id: parsed.data.blueprintId },
  });

  if (!blueprint) {
    return c.json({ error: "Blueprint not found" }, 404);
  }

  // Verify allocations exist and are available
  const allocations = await db.allocation.findMany({
    where: {
      id: { in: parsed.data.allocationIds },
      nodeId: parsed.data.nodeId,
      assigned: false,
    },
  });

  if (allocations.length !== parsed.data.allocationIds.length) {
    return c.json({ error: "Some allocations are invalid or already assigned" }, 400);
  }

  // Check resource limits
  const existingServers = await db.server.aggregate({
    where: { nodeId: parsed.data.nodeId },
    _sum: {
      memory: true,
      disk: true,
      cpu: true,
    },
  });

  // Memory and disk are stored in MB in the database, node limits are in bytes
  const usedMemoryMB = Number(existingServers._sum.memory || 0);
  const usedDiskMB = Number(existingServers._sum.disk || 0);
  // CPU is stored as percentage (100 = 1 core), convert to cores for comparison
  const usedCpuCores = (existingServers._sum.cpu || 0) / 100;
  const requestedCpuCores = parsed.data.cpu / 100;

  // Convert node limits from bytes to MB for comparison
  const nodeMemoryLimitMB = Number(node.memoryLimit) / (1024 * 1024);
  const nodeDiskLimitMB = Number(node.diskLimit) / (1024 * 1024);

  if (usedMemoryMB + parsed.data.memory > nodeMemoryLimitMB) {
    return c.json({ error: "Insufficient memory on node" }, 400);
  }

  if (usedDiskMB + parsed.data.disk > nodeDiskLimitMB) {
    return c.json({ error: "Insufficient disk space on node" }, 400);
  }

  if (usedCpuCores + requestedCpuCores > node.cpuLimit) {
    return c.json({ error: "Insufficient CPU on node" }, 400);
  }

  // Determine owner
  const ownerId = parsed.data.ownerId || user.id;

  // Verify owner exists
  const owner = await db.user.findUnique({ where: { id: ownerId } });
  if (!owner) {
    return c.json({ error: "Owner not found" }, 404);
  }

  // Create server
  let server = await db.server.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      nodeId: parsed.data.nodeId,
      blueprintId: parsed.data.blueprintId,
      ownerId,
      memory: parsed.data.memory,
      disk: parsed.data.disk,
      cpu: parsed.data.cpu,
      cpuPinning: parsed.data.cpuPinning,
      swap: parsed.data.swap,
      oomKillDisable: parsed.data.oomKillDisable,
      backupLimit: parsed.data.backupLimit,
      config: parsed.data.config as any,
      variables: parsed.data.variables as any,
      dockerImage: parsed.data.dockerImage,
      status: "INSTALLING",
    },
  });

  // Set shortId (first section of UUID)
  server = await db.server.update({
    where: { id: server.id },
    data: { shortId: server.id.split("-")[0] },
  });

  // Assign allocations to server
  await db.allocation.updateMany({
    where: { id: { in: parsed.data.allocationIds } },
    data: {
      assigned: true,
      serverId: server.id,
    },
  });

  // Build daemon blueprint
  const blueprintConfig = blueprint.config as any;
  const serverConfig = parsed.data.config || {};

  // Calculate swap limit for Docker
  // Docker memory_swap is the TOTAL (memory + swap), not just swap
  // -1 = unlimited swap, 0 = same as memory (disable swap), >0 = memory + swap
  const swapValue = parsed.data.swap;
  let memorySwapBytes: number | undefined;
  if (swapValue === -1) {
    memorySwapBytes = -1; // Unlimited
  } else if (swapValue === 0) {
    memorySwapBytes = parsed.data.memory * 1024 * 1024; // Same as memory = no swap
  } else {
    memorySwapBytes = (parsed.data.memory + swapValue) * 1024 * 1024; // memory + swap
  }

  // Build environment from blueprint variables + server overrides
  const blueprintVariables = (blueprint.variables as any[]) || [];
  const serverVariables = (parsed.data.variables as Record<string, string>) || {};
  const variablesEnvironment: Record<string, string> = {};

  for (const v of blueprintVariables) {
    // Use server override if available, otherwise use default
    variablesEnvironment[v.env_variable] = serverVariables[v.env_variable] ?? v.default_value ?? "";
  }

  // Determine which docker image to use
  let imageName = blueprint.imageName;
  let imageTag = blueprint.imageTag;
  let imageRegistry = blueprint.registry;

  if (parsed.data.dockerImage) {
    // Parse the selected docker image
    const selectedImage = parsed.data.dockerImage;
    const parts = selectedImage.split('/');

    if (parts.length >= 2 && (parts[0].includes('.') || parts[0].includes(':'))) {
      // Has registry
      imageRegistry = parts[0];
      const nameWithTag = parts.slice(1).join('/');
      const [name, tag = 'latest'] = nameWithTag.split(':');
      imageName = name;
      imageTag = tag;
    } else {
      // No registry
      const [name, tag = 'latest'] = selectedImage.split(':');
      imageName = name;
      imageTag = tag;
      imageRegistry = null;
    }
  }

  // Build installation config if available
  // Only set installConfig if there's a non-empty install script
  const installConfig = blueprint.installScript && blueprint.installScript.trim().length > 0
    ? {
        script: blueprint.installScript,
        container: blueprint.installContainer || "ghcr.io/ptero-eggs/installers:alpine",
        entrypoint: blueprint.installEntrypoint || "ash",
      }
    : null;

  // Merge configs - variables take precedence over blueprint config environment
  const daemonBlueprint = {
    name: server.name,
    description: server.description,
    image: {
      name: imageName,
      tag: imageTag,
      registry: imageRegistry,
    },
    stdin_open: blueprintConfig.stdin_open ?? true,
    tty: blueprintConfig.tty ?? true,
    // Set working directory for Pterodactyl eggs (default: /home/container)
    working_dir: blueprintConfig.working_dir || "/home/container",
    // Set user (Pterodactyl uses container user)
    user: blueprintConfig.user || "container",
    ports: allocations.map((a) => ({
      container_port: a.port,
      host_port: a.port,
      host_ip: a.ip,
    })),
    environment: {
      ...blueprintConfig.environment,
      ...variablesEnvironment,
      ...serverConfig.environment,
      // Add SERVER_MEMORY for startup command substitution
      SERVER_MEMORY: String(parsed.data.memory),
    },
    resources: {
      memory: parsed.data.memory * 1024 * 1024, // Convert MiB to bytes
      memory_swap: memorySwapBytes,
      cpus: parsed.data.cpu / 100, // Convert percentage to cores (100% = 1 thread)
      cpuset_cpus: parsed.data.cpuPinning || undefined,
      oom_kill_disable: parsed.data.oomKillDisable,
    },
    volumes: blueprintConfig.volumes,
    mounts: blueprintConfig.mounts,
    restart_policy: blueprintConfig.restart_policy || "unlessstopped",
    // Installation configuration
    install: installConfig,
    // Startup command template
    startup: blueprint.startup,
    // Stop command
    stop_command: blueprint.stopCommand,
    // Build the startup command with variable substitution
    command: blueprint.startup
      ? (() => {
          // Convert Windows line endings to Unix and substitute variables
          let cmd = blueprint.startup.replace(/\r\n/g, "\n").replace(/\r/g, "");
          // Substitute variables
          for (const [key, value] of Object.entries(variablesEnvironment)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
            cmd = cmd.replace(regex, value);
          }
          // Substitute SERVER_MEMORY
          cmd = cmd.replace(/\{\{SERVER_MEMORY\}\}/g, String(parsed.data.memory));
          // Return as array for Docker command
          return ["sh", "-c", cmd];
        })()
      : undefined,
  };

  // Send to daemon
  try {
    const result = await daemonRequest(node, "POST", `/containers?name=${server.id}`, daemonBlueprint);

    // If there's an install script, keep status as INSTALLING and let daemon report status changes
    // Otherwise, the container starts immediately so we can set RUNNING
    const newStatus = installConfig ? "INSTALLING" : "RUNNING";

    await db.server.update({
      where: { id: server.id },
      data: {
        containerId: result.id,
        status: newStatus,
      },
    });

    return c.json(
      serializeServer({
        ...server,
        containerId: result.id,
        status: newStatus,
      }),
      201
    );
  } catch (error: any) {
    // Rollback: release allocations and delete server if daemon fails
    await db.allocation.updateMany({
      where: { serverId: server.id },
      data: {
        assigned: false,
        serverId: null,
      },
    });

    await db.server.delete({
      where: { id: server.id },
    });

    return c.json({ error: error.message }, 500);
  }
});

// Update server
servers.patch("/:serverId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = updateServerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  // Only admins can change resources
  if (user.role !== "admin") {
    delete parsed.data.memory;
    delete parsed.data.disk;
    delete parsed.data.cpu;
  }

  const updated = await db.server.update({
    where: { id: server.id },
    data: parsed.data as any,
  });

  // If resources were updated and server has a container, sync to daemon
  if ((parsed.data.memory || parsed.data.cpu) && server.containerId) {
    const fullServer = await db.server.findUnique({
      where: { id: server.id },
      include: { node: true },
    });

    if (fullServer?.node.isOnline) {
      try {
        await daemonRequest(fullServer.node, "PATCH", `/containers/${server.containerId}/update`, {
          memory: parsed.data.memory ? parsed.data.memory * 1024 * 1024 : undefined, // MB to bytes
          cpus: parsed.data.cpu ? parsed.data.cpu / 100 : undefined, // percentage to cores
        });
      } catch (error) {
        // Log but don't fail - database is updated, container update is best-effort
        console.error("Failed to update container resources:", error);
      }
    }
  }

  return c.json(serializeServer(updated));
});

// Delete server (admin only)
servers.delete("/:serverId", requireAdmin, async (c) => {
  const { serverId } = c.req.param();

  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Stop and remove from daemon
  if (server.containerId && server.node.isOnline) {
    try {
      await daemonRequest(server.node, "DELETE", `/containers/${server.containerId}?force=true`);
    } catch {
      // Continue with deletion even if daemon fails
    }
  }

  // Release allocations
  await db.allocation.updateMany({
    where: { serverId },
    data: {
      assigned: false,
      serverId: null,
    },
  });

  // Delete server
  await db.server.delete({ where: { id: serverId } });

  return c.json({ success: true });
});

// === Server actions ===

// Start server
servers.post("/:serverId/start", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/containers/${fullServer.containerId}/start`);

    await db.server.update({
      where: { id: server.id },
      data: { status: "RUNNING" },
    });

    return c.json({ success: true, status: "RUNNING" });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Stop server
servers.post("/:serverId/stop", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/containers/${fullServer.containerId}/stop`);

    await db.server.update({
      where: { id: server.id },
      data: { status: "STOPPED" },
    });

    return c.json({ success: true, status: "STOPPED" });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Restart server
servers.post("/:serverId/restart", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/containers/${fullServer.containerId}/restart`);

    await db.server.update({
      where: { id: server.id },
      data: { status: "RUNNING" },
    });

    return c.json({ success: true, status: "RUNNING" });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Kill server
servers.post("/:serverId/kill", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/containers/${fullServer.containerId}/kill`);

    await db.server.update({
      where: { id: server.id },
      data: { status: "STOPPED" },
    });

    return c.json({ success: true, status: "STOPPED" });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Sync server resources to container (admin only)
servers.post("/:serverId/sync", requireAdmin, async (c) => {
  const { serverId } = c.req.param();

  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  if (!server.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!server.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(server.node, "PATCH", `/containers/${server.containerId}/update`, {
      memory: Number(server.memory) * 1024 * 1024, // MB to bytes
      cpus: server.cpu / 100, // percentage to cores
    });

    return c.json({
      success: true,
      message: "Container resources synced",
      resources: {
        memory: Number(server.memory),
        cpu: server.cpu,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Reinstall server (recreate container with current variables/image)
servers.post("/:serverId/reinstall", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: {
      node: true,
      blueprint: true,
      allocations: true,
    },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  // Delete old container if exists
  if (fullServer.containerId) {
    try {
      await daemonRequest(fullServer.node, "DELETE", `/containers/${fullServer.containerId}?force=true`);
    } catch {
      // Ignore errors if container doesn't exist
    }
  }

  // Build new container with current settings
  const blueprintConfig = fullServer.blueprint.config as any;
  const serverConfig = (fullServer.config as any) || {};

  // Calculate swap
  const swapValue = Number(fullServer.swap);
  let memorySwapBytes: number | undefined;
  if (swapValue === -1) {
    memorySwapBytes = -1;
  } else if (swapValue === 0) {
    memorySwapBytes = Number(fullServer.memory) * 1024 * 1024;
  } else {
    memorySwapBytes = (Number(fullServer.memory) + swapValue) * 1024 * 1024;
  }

  // Build environment from blueprint variables + server overrides
  const blueprintVariables = (fullServer.blueprint.variables as any[]) || [];
  const serverVariables = (fullServer.variables as Record<string, string>) || {};
  const variablesEnvironment: Record<string, string> = {};

  for (const v of blueprintVariables) {
    variablesEnvironment[v.env_variable] = serverVariables[v.env_variable] ?? v.default_value ?? "";
  }

  // Determine which docker image to use
  let imageName = fullServer.blueprint.imageName;
  let imageTag = fullServer.blueprint.imageTag;
  let imageRegistry = fullServer.blueprint.registry;

  if (fullServer.dockerImage) {
    const selectedImage = fullServer.dockerImage;
    const parts = selectedImage.split('/');

    if (parts.length >= 2 && (parts[0].includes('.') || parts[0].includes(':'))) {
      imageRegistry = parts[0];
      const nameWithTag = parts.slice(1).join('/');
      const [name, tag = 'latest'] = nameWithTag.split(':');
      imageName = name;
      imageTag = tag;
    } else {
      const [name, tag = 'latest'] = selectedImage.split(':');
      imageName = name;
      imageTag = tag;
      imageRegistry = null;
    }
  }

  // Build installation config if available
  // Only set installConfig if there's a non-empty install script
  const installConfig = fullServer.blueprint.installScript && fullServer.blueprint.installScript.trim().length > 0
    ? {
        script: fullServer.blueprint.installScript,
        container: fullServer.blueprint.installContainer || "ghcr.io/ptero-eggs/installers:alpine",
        entrypoint: fullServer.blueprint.installEntrypoint || "ash",
      }
    : null;

  const daemonBlueprint = {
    name: fullServer.name,
    description: fullServer.description,
    image: {
      name: imageName,
      tag: imageTag,
      registry: imageRegistry,
    },
    stdin_open: blueprintConfig.stdin_open ?? true,
    tty: blueprintConfig.tty ?? true,
    working_dir: blueprintConfig.working_dir || "/home/container",
    user: blueprintConfig.user || "container",
    ports: fullServer.allocations.map((a) => ({
      container_port: a.port,
      host_port: a.port,
      host_ip: a.ip,
    })),
    environment: {
      ...blueprintConfig.environment,
      ...variablesEnvironment,
      ...serverConfig.environment,
      SERVER_MEMORY: String(fullServer.memory),
    },
    resources: {
      memory: Number(fullServer.memory) * 1024 * 1024,
      memory_swap: memorySwapBytes,
      cpus: fullServer.cpu / 100,
      cpuset_cpus: fullServer.cpuPinning || undefined,
      oom_kill_disable: fullServer.oomKillDisable,
    },
    volumes: blueprintConfig.volumes,
    mounts: blueprintConfig.mounts,
    restart_policy: blueprintConfig.restart_policy || "unlessstopped",
    install: installConfig,
    startup: fullServer.blueprint.startup,
    stop_command: fullServer.blueprint.stopCommand,
    command: fullServer.blueprint.startup
      ? (() => {
          // Convert Windows line endings to Unix and substitute variables
          let cmd = fullServer.blueprint.startup.replace(/\r\n/g, "\n").replace(/\r/g, "");
          for (const [key, value] of Object.entries(variablesEnvironment)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
            cmd = cmd.replace(regex, value);
          }
          cmd = cmd.replace(/\{\{SERVER_MEMORY\}\}/g, String(fullServer.memory));
          return ["sh", "-c", cmd];
        })()
      : undefined,
  };

  try {
    const result = await daemonRequest(fullServer.node, "POST", `/containers?name=${fullServer.id}`, daemonBlueprint);

    // If there's an install script, keep status as INSTALLING and let daemon report status changes
    // Otherwise, the container starts immediately so we can set RUNNING
    const newStatus = installConfig ? "INSTALLING" : "RUNNING";

    await db.server.update({
      where: { id: fullServer.id },
      data: {
        containerId: result.id,
        status: newStatus,
      },
    });

    return c.json({
      success: true,
      message: installConfig ? "Server reinstalling..." : "Server reinstalled successfully",
      containerId: result.id,
      status: newStatus,
    });
  } catch (error: any) {
    await db.server.update({
      where: { id: fullServer.id },
      data: { status: "ERROR" },
    });
    return c.json({ error: error.message }, 500);
  }
});

// Get server stats
servers.get("/:serverId/stats", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    const stats = await daemonRequest(fullServer.node, "GET", `/containers/${fullServer.containerId}/stats`);
    return c.json(stats);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get server logs
servers.get("/:serverId/logs", requireServerAccess, async (c) => {
  const server = c.get("server");
  const tail = c.req.query("tail") || "100";

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    const logs = await daemonRequest(fullServer.node, "GET", `/containers/${fullServer.containerId}/logs?tail=${tail}`);
    return c.json(logs);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get WebSocket connection info for console
servers.get("/:serverId/console", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  const protocol = fullServer.node.protocol === "HTTP" ? "ws" : "wss";

  return c.json({
    websocketUrl: `${protocol}://${fullServer.node.host}:${fullServer.node.port}/containers/${fullServer.containerId}/console`,
    token: fullServer.node.token,
  });
});

// Send command to server (for non-WebSocket fallback)
servers.post("/:serverId/command", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { command } = await c.req.json();

  if (!command) {
    return c.json({ error: "Command required" }, 400);
  }

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.containerId) {
    return c.json({ error: "Server has no container" }, 400);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/containers/${fullServer.containerId}/stdin`, { data: command + "\n" });
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// === Startup Configuration ===

// Get startup configuration (variables, docker images, startup command)
servers.get("/:serverId/startup", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { blueprint: true },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  const blueprint = fullServer.blueprint;
  const blueprintVariables = (blueprint.variables as any[]) || [];
  const serverVariables = (fullServer.variables as Record<string, string>) || {};

  // Merge blueprint variables with server overrides
  const variables = blueprintVariables.map((v) => ({
    name: v.name,
    description: v.description,
    envVariable: v.env_variable,
    defaultValue: v.default_value || "",
    value: serverVariables[v.env_variable] ?? v.default_value ?? "",
    rules: v.rules || "",
    fieldType: v.field_type || "text",
    userViewable: v.user_viewable ?? true,
    userEditable: v.user_editable ?? true,
  }));

  // Get docker images from blueprint
  const dockerImages = (blueprint.dockerImages as Record<string, string>) || {};
  const dockerImageOptions = Object.entries(dockerImages).map(([label, image]) => ({
    label,
    image,
  }));

  // Get selected docker image (or first available)
  let selectedDockerImage = fullServer.dockerImage;
  if (!selectedDockerImage && dockerImageOptions.length > 0) {
    selectedDockerImage = dockerImageOptions[0].image;
  } else if (!selectedDockerImage) {
    // Fall back to blueprint's primary image
    selectedDockerImage = blueprint.imageName + ":" + blueprint.imageTag;
  }

  // Build startup command with variable substitution
  let startupCommand = blueprint.startup || "";
  variables.forEach((v) => {
    const regex = new RegExp(`\\{\\{${v.envVariable}\\}\\}`, 'g');
    startupCommand = startupCommand.replace(regex, v.value);
  });
  // Replace SERVER_MEMORY placeholder with memory limit
  startupCommand = startupCommand.replace(/\{\{SERVER_MEMORY\}\}/g, String(fullServer.memory));

  return c.json({
    variables: variables.filter((v) => v.userViewable),
    dockerImages: dockerImageOptions,
    selectedDockerImage,
    startupCommand,
    features: (blueprint.features as string[]) || [],
    stopCommand: blueprint.stopCommand || "stop",
  });
});

// Update startup configuration
servers.patch("/:serverId/startup", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();
  const parsed = updateStartupSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { blueprint: true },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  const updateData: any = {};

  // Validate and update variables
  if (parsed.data.variables) {
    const blueprintVariables = (fullServer.blueprint.variables as any[]) || [];
    const currentVariables = (fullServer.variables as Record<string, string>) || {};

    // Only allow updating user-editable variables
    const newVariables = { ...currentVariables };
    for (const [key, value] of Object.entries(parsed.data.variables)) {
      const blueprintVar = blueprintVariables.find((v) => v.env_variable === key);
      if (blueprintVar && blueprintVar.user_editable !== false) {
        newVariables[key] = value;
      }
    }
    updateData.variables = newVariables;
  }

  // Validate and update docker image
  if (parsed.data.dockerImage) {
    const dockerImages = (fullServer.blueprint.dockerImages as Record<string, string>) || {};
    const validImages = Object.values(dockerImages);

    // Also allow the primary blueprint image
    const primaryImage = fullServer.blueprint.imageName + ":" + fullServer.blueprint.imageTag;
    validImages.push(primaryImage);

    if (validImages.includes(parsed.data.dockerImage)) {
      updateData.dockerImage = parsed.data.dockerImage;
    } else {
      return c.json({ error: "Invalid docker image" }, 400);
    }
  }

  const updated = await db.server.update({
    where: { id: server.id },
    data: updateData,
  });

  return c.json({
    success: true,
    variables: updated.variables,
    dockerImage: updated.dockerImage,
  });
});

// === File Management ===

// Helper to get server with node for daemon communication
async function getServerWithNode(serverId: string) {
  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });

  if (!server) {
    throw new Error("Server not found");
  }

  if (!server.containerId) {
    throw new Error("Server has no container");
  }

  if (!server.node.isOnline) {
    throw new Error("Node is offline");
  }

  return server;
}

// Helper to normalize file paths (convert backslashes to forward slashes)
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

// Get disk usage
servers.get("/:serverId/files/disk-usage", requireServerAccess, async (c) => {
  const server = c.get("server");

  try {
    const fullServer = await getServerWithNode(server.id);
    const usage = await daemonRequest(
      fullServer.node,
      "GET",
      `/containers/${fullServer.containerId}/files/disk-usage`
    );
    return c.json(usage);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// List files
servers.get("/:serverId/files", requireServerAccess, async (c) => {
  const server = c.get("server");
  const path = normalizePath(c.req.query("path") || "/");

  try {
    const fullServer = await getServerWithNode(server.id);
    const files = await daemonRequest(
      fullServer.node,
      "GET",
      `/containers/${fullServer.containerId}/files?path=${encodeURIComponent(path)}`
    );
    return c.json(files);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Read file
servers.get("/:serverId/files/read", requireServerAccess, async (c) => {
  const server = c.get("server");
  const rawPath = c.req.query("path");

  if (!rawPath) {
    return c.json({ error: "Path required" }, 400);
  }

  const path = normalizePath(rawPath);

  try {
    const fullServer = await getServerWithNode(server.id);
    // Daemon returns plain text for file content
    const content = await daemonRequest(
      fullServer.node,
      "GET",
      `/containers/${fullServer.containerId}/files/read?path=${encodeURIComponent(path)}`,
      undefined,
      { responseType: "text" }
    );
    return c.json({ content });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Generate download token for file (requires authentication)
servers.post("/:serverId/files/download-token", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");
  const body = await c.req.json();
  const rawPath = body.path;

  if (!rawPath) {
    return c.json({ error: "Path required" }, 400);
  }

  const path = normalizePath(rawPath);
  const { token, expiresAt } = generateDownloadToken(user.id, server.id, `file:${path}`);

  return c.json({
    token,
    expiresAt,
    downloadUrl: `/api/servers/${server.id}/files/download?token=${token}`,
  });
});

// Download file (uses signed token for authentication)
servers.get("/:serverId/files/download", async (c) => {
  const { serverId } = c.req.param();
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Download token required" }, 401);
  }

  // Verify the token
  const verification = verifyDownloadToken(token);
  if (!verification.valid) {
    return c.json({ error: "Invalid or expired download token" }, 401);
  }

  // Verify the token is for this server
  if (verification.serverId !== serverId) {
    return c.json({ error: "Token not valid for this server" }, 403);
  }

  // Extract the path from the resource
  if (!verification.resource?.startsWith("file:")) {
    return c.json({ error: "Invalid token type" }, 400);
  }

  const path = verification.resource.slice(5); // Remove "file:" prefix
  const filename = path.split("/").pop() || "download";

  try {
    const fullServer = await getServerWithNode(serverId);
    const protocol = fullServer.node.protocol === "HTTPS" || fullServer.node.protocol === "HTTPS_PROXY" ? "https" : "http";
    const url = `${protocol}://${fullServer.node.host}:${fullServer.node.port}/containers/${fullServer.containerId}/files/download?path=${encodeURIComponent(path)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${fullServer.node.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({ error: `Daemon error: ${error}` }, 500);
    }

    // Stream the response directly
    const data = await response.arrayBuffer();

    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Write file
servers.post("/:serverId/files/write", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.path || body.content === undefined) {
    return c.json({ error: "Path and content required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/files/write`,
      { ...body, path: normalizePath(body.path) }
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create file or directory
servers.post("/:serverId/files/create", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.path || !body.type) {
    return c.json({ error: "Path and type required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/files/create`,
      { ...body, path: normalizePath(body.path) }
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete file or directory
servers.delete("/:serverId/files/delete", requireServerAccess, async (c) => {
  const server = c.get("server");
  const rawPath = c.req.query("path");

  if (!rawPath) {
    return c.json({ error: "Path required" }, 400);
  }

  const path = normalizePath(rawPath);

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "DELETE",
      `/containers/${fullServer.containerId}/files/delete?path=${encodeURIComponent(path)}`
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Rename file or directory
servers.post("/:serverId/files/rename", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.from || !body.to) {
    return c.json({ error: "From and to paths required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/files/rename`,
      { from: normalizePath(body.from), to: normalizePath(body.to) }
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create archive
servers.post("/:serverId/files/archive", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/files/archive`,
      body
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Extract archive
servers.post("/:serverId/files/extract", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/files/extract`,
      body
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// === Backups ===

// List backups
servers.get("/:serverId/backups", requireServerAccess, async (c) => {
  const server = c.get("server");

  try {
    const fullServer = await getServerWithNode(server.id);
    const backups = await daemonRequest(
      fullServer.node,
      "GET",
      `/containers/${fullServer.containerId}/backups`
    );
    return c.json(backups);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create backup
servers.post("/:serverId/backups", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json().catch(() => ({}));

  try {
    const fullServer = await getServerWithNode(server.id);
    const backup = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/backups`,
      body
    );
    return c.json(backup);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Restore backup
servers.post("/:serverId/backups/restore", requireServerAccess, async (c) => {
  const server = c.get("server");
  const id = c.req.query("id");

  if (!id) {
    return c.json({ error: "Backup ID required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/backups/restore?id=${encodeURIComponent(id)}`
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Generate download token for backup (requires authentication)
servers.post("/:serverId/backups/download-token", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");
  const body = await c.req.json();
  const backupId = body.id;

  if (!backupId) {
    return c.json({ error: "Backup ID required" }, 400);
  }

  const { token, expiresAt } = generateDownloadToken(user.id, server.id, `backup:${backupId}`);

  return c.json({
    token,
    expiresAt,
    downloadUrl: `/api/servers/${server.id}/backups/download?token=${token}`,
  });
});

// Download backup (uses signed token for authentication)
servers.get("/:serverId/backups/download", async (c) => {
  const { serverId } = c.req.param();
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Download token required" }, 401);
  }

  // Verify the token
  const verification = verifyDownloadToken(token);
  if (!verification.valid) {
    return c.json({ error: "Invalid or expired download token" }, 401);
  }

  // Verify the token is for this server
  if (verification.serverId !== serverId) {
    return c.json({ error: "Token not valid for this server" }, 403);
  }

  // Extract the backup ID from the resource
  if (!verification.resource?.startsWith("backup:")) {
    return c.json({ error: "Invalid token type" }, 400);
  }

  const backupId = verification.resource.slice(7); // Remove "backup:" prefix

  try {
    const fullServer = await getServerWithNode(serverId);
    const protocol = fullServer.node.protocol === "HTTPS" || fullServer.node.protocol === "HTTPS_PROXY" ? "https" : "http";
    const url = `${protocol}://${fullServer.node.host}:${fullServer.node.port}/containers/${fullServer.containerId}/backups/download?id=${encodeURIComponent(backupId)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${fullServer.node.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({ error: `Daemon error: ${error}` }, 500);
    }

    // Stream the response directly
    const data = await response.arrayBuffer();
    const filename = `${backupId}.tar.gz`;

    return new Response(data, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete backup
servers.delete("/:serverId/backups/delete", requireServerAccess, async (c) => {
  const server = c.get("server");
  const id = c.req.query("id");

  if (!id) {
    return c.json({ error: "Backup ID required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "DELETE",
      `/containers/${fullServer.containerId}/backups/delete?id=${encodeURIComponent(id)}`
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Lock/unlock backup
servers.patch("/:serverId/backups/lock", requireServerAccess, async (c) => {
  const server = c.get("server");
  const id = c.req.query("id");
  const body = await c.req.json();

  if (!id) {
    return c.json({ error: "Backup ID required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "PATCH",
      `/containers/${fullServer.containerId}/backups/lock?id=${encodeURIComponent(id)}`,
      body
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// === Schedules ===

// List schedules
servers.get("/:serverId/schedules", requireServerAccess, async (c) => {
  const server = c.get("server");

  try {
    const fullServer = await getServerWithNode(server.id);
    const schedules = await daemonRequest(
      fullServer.node,
      "GET",
      `/containers/${fullServer.containerId}/schedules`
    );
    // Transform daemon format to frontend format
    const transformed = (schedules || []).map((schedule: any) => ({
      ...schedule,
      tasks: schedule.action?.tasks || [],
    }));
    return c.json(transformed);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get schedule
servers.get("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { scheduleId } = c.req.param();

  try {
    const fullServer = await getServerWithNode(server.id);
    const schedule = await daemonRequest(
      fullServer.node,
      "GET",
      `/containers/${fullServer.containerId}/schedules/${scheduleId}`
    );
    // Transform daemon format to frontend format
    return c.json({
      ...schedule,
      tasks: schedule.action?.tasks || [],
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create schedule
servers.post("/:serverId/schedules", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.name || !body.cron || !body.tasks) {
    return c.json({ error: "Name, cron, and tasks required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    // Transform tasks array to daemon format
    const daemonBody = {
      name: body.name,
      cron: body.cron,
      enabled: body.enabled ?? true,
      action: {
        type: "sequence",
        tasks: body.tasks,
      },
    };
    const schedule = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/schedules`,
      daemonBody
    );
    // Transform response back to frontend format
    return c.json({
      ...schedule,
      tasks: schedule.action?.tasks || body.tasks,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Update schedule
servers.patch("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { scheduleId } = c.req.param();
  const body = await c.req.json();

  try {
    const fullServer = await getServerWithNode(server.id);
    // Transform tasks to daemon format if present
    const daemonBody: any = { ...body };
    if (body.tasks) {
      daemonBody.action = {
        type: "sequence",
        tasks: body.tasks,
      };
      delete daemonBody.tasks;
    }
    const schedule = await daemonRequest(
      fullServer.node,
      "PATCH",
      `/containers/${fullServer.containerId}/schedules/${scheduleId}`,
      daemonBody
    );
    // Transform response back to frontend format
    return c.json({
      ...schedule,
      tasks: schedule.action?.tasks || body.tasks || [],
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete schedule
servers.delete("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { scheduleId } = c.req.param();

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "DELETE",
      `/containers/${fullServer.containerId}/schedules/${scheduleId}`
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Run schedule now
servers.post("/:serverId/schedules/:scheduleId/run", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { scheduleId } = c.req.param();

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/schedules/${scheduleId}/run`
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export { servers };
