import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "../lib/db";
import {
  requireAuth,
  requireAdmin,
  requireServerAccess,
  requireNotSuspended,
} from "../middleware/auth";
import type { Variables } from "../types";
import { logActivityFromContext, ActivityEvents } from "../lib/activity";
import { dispatchWebhook, WebhookEvents } from "../lib/webhooks";
import { emitServerEvent, emitGlobalEvent } from "../lib/ws";
import { getRequiredEnv, validateNodeConfig } from "../middleware/security";
import {
  CATEGORY_DEFINITIONS,
  getAllCategories,
  getPermissionsByCategory,
} from "../lib/permissions";

const servers = new Hono<{ Variables: Variables }>();

// Download token secret - requires environment variable in production
const DOWNLOAD_SECRET = getRequiredEnv(
  "DOWNLOAD_TOKEN_SECRET",
  process.env.BETTER_AUTH_SECRET || "dev-only-secret"
);
// Token expiration time in seconds (5 minutes)
const DOWNLOAD_TOKEN_EXPIRY = 300;

// Generate a signed download token
const generateDownloadToken = (
  userId: string,
  serverId: string,
  resource: string
): { token: string; expiresAt: number } => {
  const expiresAt = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_EXPIRY;
  const payload = `${userId}:${serverId}:${resource}:${expiresAt}`;
  const signature = createHmac("sha256", DOWNLOAD_SECRET).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${signature}`).toString("base64url");
  return { token, expiresAt };
};

// Verify a download token and return the parsed data
const verifyDownloadToken = (
  token: string
): { valid: boolean; userId?: string; serverId?: string; resource?: string } => {
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

    // Verify signature using timing-safe comparison to prevent timing attacks
    const payload = `${userId}:${serverId}:${resource}:${expiresAt}`;
    const expectedSignature = createHmac("sha256", DOWNLOAD_SECRET).update(payload).digest("hex");

    // Use timing-safe comparison
    if (signature.length !== expectedSignature.length) {
      return { valid: false };
    }
    const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    if (!isValid) {
      return { valid: false };
    }

    return { valid: true, userId, serverId, resource };
  } catch {
    return { valid: false };
  }
};

// Helper to convert BigInt fields to string for JSON serialization
// BigInt values can lose precision when converted to Number for large values
const serializeServer = (server: any) => {
  return {
    ...server,
    memory: server.memory != null ? server.memory.toString() : null,
    disk: server.disk != null ? server.disk.toString() : null,
    swap: server.swap != null ? server.swap.toString() : null,
  };
};

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
  allocationLimit: z.number().int().min(1).default(1), // Allocation limit
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
  allocationLimit: z.number().int().min(1).optional(), // Allocation limit
  config: z.record(z.any()).optional(),
  status: z
    .enum([
      "INSTALLING",
      "STARTING",
      "RUNNING",
      "STOPPING",
      "STOPPED",
      "SUSPENDED",
      "MAINTENANCE",
      "RESTORING",
      "ERROR",
    ])
    .optional(), // Admin only
});

const updateStartupSchema = z.object({
  variables: z.record(z.string()).optional(), // { "MINECRAFT_VERSION": "1.20.4", ... }
  dockerImage: z.string().optional(), // Selected docker image from blueprint
  customStartupCommands: z.string().optional(), // Custom commands to append
});

// Helper to communicate with daemon
const daemonRequest = async (
  node: { id: string; host: string; port: number; protocol: string; token: string },
  method: string,
  path: string,
  body?: any,
  options?: { responseType?: "json" | "text" }
) => {
  // Validate node configuration for SSRF protection
  validateNodeConfig(node);

  const protocol = node.protocol === "HTTPS" || node.protocol === "HTTPS_PROXY" ? "https" : "http";
  const url = `${protocol}://${node.host}:${node.port}${path}`;

  try {
    // Daemon expects token format: {token_id}.{token}
    const headers: Record<string, string> = {
      Authorization: `Bearer ${node.id}.${node.token}`,
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
};

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

// Get permission definitions (public endpoint for UI)
// Must be defined BEFORE /:serverId to avoid route conflict
servers.get("/permissions", async (c) => {
  const categories = getAllCategories().map((category) => ({
    ...CATEGORY_DEFINITIONS[category],
    id: category,
    permissions: getPermissionsByCategory(category),
  }));

  return c.json({ categories });
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
          sftpPort: true,
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
  const primaryAllocationPort = allocations[0]?.port;
  const variablesData = (parsed.data.variables as Record<string, string>) || {};
  const variablesWithPort = { ...variablesData };
  if (primaryAllocationPort && !variablesWithPort.SERVER_PORT) {
    variablesWithPort.SERVER_PORT = String(primaryAllocationPort);
  }

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
      allocationLimit: parsed.data.allocationLimit,
      config: parsed.data.config as any,
      variables: variablesWithPort as any,
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

  // Set primary allocation to the first one
  server = await db.server.update({
    where: { id: server.id },
    data: { primaryAllocationId: parsed.data.allocationIds[0] },
  });

  // Build environment from blueprint variables + server overrides
  const blueprintVariables = (blueprint.variables as any[]) || [];
  const variablesEnvironment: Record<string, string> = {};

  for (const v of blueprintVariables) {
    variablesEnvironment[v.env_variable] =
      variablesWithPort[v.env_variable] ?? v.default_value ?? "";
  }

  // Determine which docker image to use
  const dockerImage = parsed.data.dockerImage || `${blueprint.imageName}:${blueprint.imageTag}`;

  // Build startup command with variable substitution
  let invocation = blueprint.startup || "";
  for (const [key, value] of Object.entries(variablesEnvironment)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    invocation = invocation.replace(regex, value);
  }
  invocation = invocation.replace(/\{\{SERVER_MEMORY\}\}/g, String(parsed.data.memory));

  // Get primary allocation
  const primaryAllocation = allocations[0];

  // Parse startup detection from blueprint
  const startupDetection = (blueprint.startupDetection as any) || {};
  const startupDonePatterns: string[] = [];

  // Handle various formats of startupDetection
  if (typeof startupDetection.done === "string") {
    startupDonePatterns.push(startupDetection.done);
  } else if (Array.isArray(startupDetection.done)) {
    startupDonePatterns.push(...startupDetection.done);
  } else if (typeof startupDetection === "string") {
    // Simple string format
    startupDonePatterns.push(startupDetection);
  }

  // Build daemon request in the format the Rust daemon expects
  const daemonRequest_body = {
    uuid: server.id,
    name: server.name,
    suspended: false,
    invocation: invocation,
    skip_egg_scripts: !blueprint.installScript,
    build: {
      memory_limit: parsed.data.memory * 1024 * 1024, // MiB to bytes
      swap: parsed.data.swap === -1 ? -1 : parsed.data.swap * 1024 * 1024, // MiB to bytes
      io_weight: 500, // Default IO weight
      cpu_limit: parsed.data.cpu, // Percentage (100 = 1 core)
      disk_space: parsed.data.disk * 1024 * 1024, // MiB to bytes
      oom_disabled: parsed.data.oomKillDisable,
    },
    container: {
      image: dockerImage,
      oom_disabled: parsed.data.oomKillDisable,
    },
    allocations: {
      default: {
        ip: primaryAllocation.ip,
        port: primaryAllocation.port,
      },
      mappings: allocations.reduce(
        (acc, a) => {
          if (!acc[a.ip]) acc[a.ip] = [];
          acc[a.ip].push(a.port);
          return acc;
        },
        {} as Record<string, number[]>
      ),
    },
    egg: {
      id: blueprint.id,
      file_denylist: [],
    },
    mounts: [],
    // Process configuration for startup detection and stop handling
    process_configuration: {
      startup: {
        done: startupDonePatterns,
        user_interaction: [],
        strip_ansi: false,
      },
      stop: blueprint.stopCommand
        ? { type: "command", value: blueprint.stopCommand }
        : { type: "signal", value: "SIGTERM" },
      configs: [],
    },
  };

  // Send to daemon
  try {
    const result = await daemonRequest(node, "POST", `/api/servers`, daemonRequest_body);

    // Update server status based on whether installation is needed
    const hasInstallScript = blueprint.installScript && blueprint.installScript.trim().length > 0;
    const newStatus = hasInstallScript ? "INSTALLING" : "STOPPED";

    await db.server.update({
      where: { id: server.id },
      data: {
        status: newStatus,
      },
    });

    // If there's an install script, trigger installation
    if (hasInstallScript) {
      try {
        await daemonRequest(node, "POST", `/api/servers/${server.id}/install`);
      } catch (installError) {
        console.error("Failed to trigger installation:", installError);
      }
    }

    return c.json(
      serializeServer({
        ...server,
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

  // Only admins can change resources and status
  if (user.role !== "admin") {
    delete parsed.data.memory;
    delete parsed.data.disk;
    delete parsed.data.cpu;
    delete parsed.data.status;
  }

  // Check if we're suspending the server - need to get child servers
  const isSuspending = parsed.data.status === "SUSPENDED" && server.status !== "SUSPENDED";
  let childServers: { id: string; status: string }[] = [];

  if (isSuspending) {
    const serverWithChildren = await db.server.findUnique({
      where: { id: server.id },
      include: { childServers: { select: { id: true, status: true } } },
    });
    childServers = serverWithChildren?.childServers || [];
  }

  const updated = await db.server.update({
    where: { id: server.id },
    data: parsed.data as any,
  });

  // If resources were updated, sync to daemon
  if (parsed.data.memory || parsed.data.cpu) {
    const fullServer = await db.server.findUnique({
      where: { id: server.id },
      include: { node: true },
    });

    if (fullServer?.node.isOnline) {
      try {
        // Sync server to update resources in the daemon
        await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/sync`);
      } catch (error) {
        // Log but don't fail - database is updated, container update is best-effort
        console.error("Failed to sync server resources:", error);
      }
    }
  }

  // Cascading suspension: if parent is suspended, also suspend all child servers
  if (isSuspending && childServers.length > 0) {
    const childUpdates = await Promise.all(
      childServers
        .filter((child) => child.status !== "SUSPENDED")
        .map(async (child) => {
          await db.server.update({
            where: { id: child.id },
            data: { status: "SUSPENDED" },
          });
          emitServerEvent("server:status", child.id, { id: child.id, status: "SUSPENDED" });
          return child.id;
        })
    );

    if (childUpdates.length > 0) {
      await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
        serverId: server.id,
        metadata: {
          changes: Object.keys(parsed.data),
          cascadingSuspension: { childServerIds: childUpdates },
        },
      });
    }
  } else {
    await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
      serverId: server.id,
      metadata: { changes: Object.keys(parsed.data) },
    });
  }

  // Emit WebSocket event for real-time updates
  emitServerEvent("server:updated", server.id, serializeServer(updated), user.id);

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

  // Log activity before deletion (since we need the server to exist)
  await logActivityFromContext(c, ActivityEvents.SERVER_DELETE, {
    metadata: { serverId, serverName: server.name },
  });

  // Remove from daemon
  if (server.node.isOnline) {
    try {
      await daemonRequest(server.node, "DELETE", `/api/servers/${serverId}`);
    } catch {
      // Continue with deletion even if daemon fails
    }
  }

  // If this is a child server, return resources to the parent
  if (server.parentServerId) {
    const parentServer = await db.server.findUnique({
      where: { id: server.parentServerId },
    });

    if (parentServer) {
      await db.server.update({
        where: { id: server.parentServerId },
        data: {
          memory: parentServer.memory + server.memory,
          disk: parentServer.disk + server.disk,
          cpu: parentServer.cpu + server.cpu,
        },
      });

      // Emit update event for parent server
      const updatedParent = await db.server.findUnique({
        where: { id: server.parentServerId },
      });
      if (updatedParent) {
        emitServerEvent("server:updated", server.parentServerId, serializeServer(updatedParent));
      }
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

  // Emit WebSocket event for real-time updates
  emitGlobalEvent("server:deleted", { id: serverId });

  return c.json({ success: true });
});

// === Server actions ===

// Start server
servers.post("/:serverId/start", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/power`, {
      action: "start",
    });

    await db.server.update({
      where: { id: server.id },
      data: { status: "STARTING" },
    });

    await logActivityFromContext(c, ActivityEvents.SERVER_START, { serverId: server.id });

    // Dispatch webhook (fire and forget)
    dispatchWebhook(WebhookEvents.SERVER_STARTED, {
      serverId: server.id,
      userId: c.get("user").id,
    }).catch(() => {});

    // Emit WebSocket event for real-time updates
    emitServerEvent("server:status", server.id, { id: server.id, status: "STARTING" });

    return c.json({ success: true, status: "STARTING" });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Stop server
servers.post("/:serverId/stop", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/power`, {
      action: "stop",
    });

    await db.server.update({
      where: { id: server.id },
      data: { status: "STOPPING" },
    });

    await logActivityFromContext(c, ActivityEvents.SERVER_STOP, { serverId: server.id });

    // Dispatch webhook (fire and forget)
    dispatchWebhook(WebhookEvents.SERVER_STOPPED, {
      serverId: server.id,
      userId: c.get("user").id,
    }).catch(() => {});

    // Emit WebSocket event for real-time updates
    emitServerEvent("server:status", server.id, { id: server.id, status: "STOPPING" });

    return c.json({ success: true, status: "STOPPING" });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Restart server
servers.post("/:serverId/restart", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/power`, {
      action: "restart",
    });

    await db.server.update({
      where: { id: server.id },
      data: { status: "STARTING" },
    });

    await logActivityFromContext(c, ActivityEvents.SERVER_RESTART, { serverId: server.id });

    // Dispatch webhook (fire and forget)
    dispatchWebhook(WebhookEvents.SERVER_RESTARTED, {
      serverId: server.id,
      userId: c.get("user").id,
    }).catch(() => {});

    // Emit WebSocket event for real-time updates
    emitServerEvent("server:status", server.id, { id: server.id, status: "STARTING" });

    return c.json({ success: true, status: "STARTING" });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Kill server
servers.post("/:serverId/kill", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/power`, {
      action: "kill",
    });

    await db.server.update({
      where: { id: server.id },
      data: { status: "STOPPED" },
    });

    await logActivityFromContext(c, ActivityEvents.SERVER_KILL, { serverId: server.id });

    return c.json({ success: true, status: "STOPPED" });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Sync server with panel configuration
servers.post("/:serverId/sync", requireAdmin, async (c) => {
  const { serverId } = c.req.param();

  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  if (!server.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(server.node, "POST", `/api/servers/${serverId}/sync`);

    return c.json({
      success: true,
      message: "Server synced with panel",
      resources: {
        memory: Number(server.memory),
        cpu: server.cpu,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Update server status (admin only)
const statusUpdateSchema = z.object({
  status: z.enum([
    "INSTALLING",
    "STARTING",
    "RUNNING",
    "STOPPING",
    "STOPPED",
    "SUSPENDED",
    "ERROR",
  ]),
});

servers.patch("/:serverId/status", requireAdmin, async (c) => {
  const { serverId } = c.req.param();
  const body = await c.req.json();
  const parsed = statusUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const server = await db.server.findUnique({
    where: { id: serverId },
    include: {
      childServers: {
        select: { id: true, status: true },
      },
    },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  const updated = await db.server.update({
    where: { id: serverId },
    data: { status: parsed.data.status },
  });

  // Emit WebSocket event for real-time updates
  emitServerEvent("server:status", serverId, { id: serverId, status: parsed.data.status });

  // Cascading suspension: if parent is suspended, also suspend all child servers
  if (parsed.data.status === "SUSPENDED" && server.childServers.length > 0) {
    const childUpdates = await Promise.all(
      server.childServers
        .filter((child) => child.status !== "SUSPENDED") // Only suspend non-suspended children
        .map(async (child) => {
          await db.server.update({
            where: { id: child.id },
            data: { status: "SUSPENDED" },
          });
          // Emit WebSocket event for each child server
          emitServerEvent("server:status", child.id, { id: child.id, status: "SUSPENDED" });
          return child.id;
        })
    );

    if (childUpdates.length > 0) {
      await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
        serverId,
        metadata: {
          statusChange: { from: server.status, to: parsed.data.status },
          cascadingSuspension: { childServerIds: childUpdates },
        },
      });
    }
  } else {
    await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
      serverId,
      metadata: { statusChange: { from: server.status, to: parsed.data.status } },
    });
  }

  return c.json(serializeServer(updated));
});

// Reinstall server (run installation script again)
servers.post("/:serverId/reinstall", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: {
      node: true,
      blueprint: true,
    },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    // Call the daemon's reinstall endpoint
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/reinstall`);

    // Update status to INSTALLING
    await db.server.update({
      where: { id: fullServer.id },
      data: {
        status: "INSTALLING",
      },
    });

    await logActivityFromContext(c, ActivityEvents.SERVER_REINSTALL, { serverId: server.id });

    return c.json({
      success: true,
      message: "Server reinstalling...",
      status: "INSTALLING",
    });
  } catch (error: any) {
    await db.server.update({
      where: { id: fullServer.id },
      data: { status: "ERROR" },
    });
    return c.json({ error: error.message }, 500);
  }
});

// Change server blueprint (game type)
servers.post("/:serverId/change-blueprint", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  // Validation
  const schema = z.object({
    blueprintId: z.string(),
    dockerImage: z.string().optional(),
    variables: z.record(z.string()).optional(),
    reinstall: z.boolean().default(false),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  // Check if blueprint exists
  const blueprint = await db.blueprint.findUnique({
    where: { id: parsed.data.blueprintId },
  });

  if (!blueprint) {
    return c.json({ error: "Blueprint not found" }, 404);
  }

  // Check if blueprint is public or user is admin
  const user = c.get("user");
  if (!blueprint.isPublic && user.role !== "admin") {
    return c.json({ error: "Blueprint not found" }, 404);
  }

  console.log(
    `[Change Blueprint] Changing server ${server.id} from blueprint ${server.blueprintId} to ${parsed.data.blueprintId}`
  );

  // Update server with new blueprint
  const updated = await db.server.update({
    where: { id: server.id },
    data: {
      blueprintId: parsed.data.blueprintId,
      dockerImage: parsed.data.dockerImage || undefined,
      variables: parsed.data.variables ? parsed.data.variables : undefined,
    },
    include: {
      node: true,
      blueprint: true,
      owner: true,
      allocations: true,
    },
  });

  await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
    serverId: server.id,
    metadata: {
      blueprintChange: {
        from: server.blueprintId,
        to: parsed.data.blueprintId,
      },
    },
  });

  // If reinstall is requested, trigger reinstallation
  if (parsed.data.reinstall && updated.node.isOnline) {
    try {
      console.log(`[Change Blueprint] Triggering reinstall for server ${server.id}`);
      await daemonRequest(updated.node, "POST", `/api/servers/${server.id}/reinstall`);

      // Update status to INSTALLING
      await db.server.update({
        where: { id: updated.id },
        data: { status: "INSTALLING" },
      });

      await logActivityFromContext(c, ActivityEvents.SERVER_REINSTALL, { serverId: server.id });

      return c.json({
        success: true,
        message: "Blueprint changed and server reinstalling...",
        server: serializeServer(updated),
        reinstalling: true,
      });
    } catch (error: any) {
      console.error(`[Change Blueprint] Failed to reinstall server ${server.id}:`, error.message);
      await db.server.update({
        where: { id: updated.id },
        data: { status: "ERROR" },
      });
      return c.json(
        {
          error: "Blueprint changed but reinstall failed",
          details: error.message,
        },
        500
      );
    }
  }

  return c.json({
    success: true,
    message: "Blueprint changed successfully",
    server: serializeServer(updated),
    reinstalling: false,
  });
});

// Get server stats
// Note: Stats are typically streamed via WebSocket, this is for one-time fetch
servers.get("/:serverId/stats", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    // Get server info which includes state
    const serverInfo = await daemonRequest(fullServer.node, "GET", `/api/servers/${server.id}`);
    // Return basic stats - real-time stats come via WebSocket
    return c.json({
      state: serverInfo.state || "offline",
      is_installing: serverInfo.is_installing || false,
      is_transferring: serverInfo.is_transferring || false,
      is_restoring: serverInfo.is_restoring || false,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get server logs
servers.get("/:serverId/logs", requireServerAccess, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    const logs = await daemonRequest(fullServer.node, "GET", `/api/servers/${server.id}/logs`);
    return c.json(logs);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get WebSocket connection info for console
servers.get("/:serverId/console", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  const protocol = fullServer.node.protocol === "HTTP" ? "ws" : "wss";

  // Replace 0.0.0.0 with localhost for browser connections
  const host = fullServer.node.host === "0.0.0.0" ? "localhost" : fullServer.node.host;

  // Generate JWT for WebSocket authentication
  // The daemon validates this JWT using the node token as the secret
  const jwt = await import("jsonwebtoken");
  const now = Math.floor(Date.now() / 1000);
  const wsToken = jwt.default.sign(
    {
      server_uuid: server.id,
      user_id: user.id,
      permissions: [
        "websocket.connect",
        "control.console",
        "control.start",
        "control.stop",
        "control.restart",
        ...(user.role === "admin" ? ["admin.websocket.install", "admin.websocket.errors"] : []),
      ],
      iat: now,
      exp: now + 900, // 15 minutes
    },
    fullServer.node.token,
    { algorithm: "HS256" }
  );

  // New daemon uses /api/servers/{server_id}/ws for WebSocket
  return c.json({
    websocketUrl: `${protocol}://${host}:${fullServer.node.port}/api/servers/${server.id}/ws`,
    token: wsToken,
  });
});

// Send command to server (for non-WebSocket fallback)
servers.post("/:serverId/command", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const { command } = await c.req.json();

  if (!command) {
    return c.json({ error: "Command required" }, 400);
  }

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/commands`, { command });
    await logActivityFromContext(c, ActivityEvents.CONSOLE_COMMAND, {
      serverId: server.id,
      metadata: { command },
    });
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
    const regex = new RegExp(`\\{\\{${v.envVariable}\\}\\}`, "g");
    startupCommand = startupCommand.replace(regex, v.value);
  });
  // Replace SERVER_MEMORY placeholder with memory limit
  startupCommand = startupCommand.replace(/\{\{SERVER_MEMORY\}\}/g, String(fullServer.memory));

  return c.json({
    variables: variables.filter((v) => v.userViewable),
    dockerImages: dockerImageOptions,
    selectedDockerImage,
    startupCommand,
    customStartupCommands: fullServer.customStartupCommands || "",
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

  // Update custom startup commands
  if (parsed.data.customStartupCommands !== undefined) {
    updateData.customStartupCommands = parsed.data.customStartupCommands;
  }

  const updated = await db.server.update({
    where: { id: server.id },
    data: updateData,
  });

  await logActivityFromContext(c, ActivityEvents.STARTUP_UPDATE, {
    serverId: server.id,
    metadata: { changes: Object.keys(updateData) },
  });

  return c.json({
    success: true,
    variables: updated.variables,
    dockerImage: updated.dockerImage,
    customStartupCommands: updated.customStartupCommands,
  });
});

// === File Management ===

// Helper to get server with node for daemon communication
const getServerWithNode = async (serverId: string) => {
  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });

  if (!server) {
    throw new Error("Server not found");
  }

  if (!server.node.isOnline) {
    throw new Error("Node is offline");
  }

  return server;
};

// Helper to normalize file paths (convert backslashes to forward slashes)
const normalizePath = (path: string): string => {
  return path.replace(/\\/g, "/");
};

// Get disk usage
servers.get("/:serverId/files/disk-usage", requireServerAccess, async (c) => {
  const server = c.get("server");

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "GET",
      `/api/servers/${server.id}/files/disk-usage`
    );
    return c.json(result);
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
    const rawFiles = await daemonRequest(
      fullServer.node,
      "GET",
      `/api/servers/${server.id}/files/list?directory=${encodeURIComponent(path)}`
    );

    // Transform daemon FileInfo to frontend format
    const files = (Array.isArray(rawFiles) ? rawFiles : []).map((f: any) => ({
      name: f.name,
      path: path === "/" ? `/${f.name}` : `${path}/${f.name}`,
      type: f.is_directory ? "directory" : "file",
      size: f.size || 0,
      modified: f.modified ? new Date(f.modified * 1000).toISOString() : new Date().toISOString(),
      permissions: f.mode ? f.mode.toString(8).padStart(4, "0") : "0644",
    }));

    return c.json({ path, files });
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
      `/api/servers/${server.id}/files/contents?file=${encodeURIComponent(path)}`,
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
    const protocol =
      fullServer.node.protocol === "HTTPS" || fullServer.node.protocol === "HTTPS_PROXY"
        ? "https"
        : "http";
    // Use the daemon's public download endpoint with signed token
    const url = `${protocol}://${fullServer.node.host}:${fullServer.node.port}/download/file?server=${serverId}&file=${encodeURIComponent(path)}`;

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
servers.post("/:serverId/files/write", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.path || body.content === undefined) {
    return c.json({ error: "Path and content required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const normalizedPath = normalizePath(body.path);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/api/servers/${server.id}/files/write`,
      { file: normalizedPath, content: body.content }
    );
    await logActivityFromContext(c, ActivityEvents.FILE_WRITE, {
      serverId: server.id,
      metadata: { path: normalizedPath },
    });
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create file or directory
servers.post("/:serverId/files/create", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.path) {
    return c.json({ error: "Path required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const normalizedPath = normalizePath(body.path);

    if (body.type === "directory") {
      // Extract directory name and root from path
      const lastSlash = normalizedPath.lastIndexOf("/");
      const name = lastSlash >= 0 ? normalizedPath.slice(lastSlash + 1) : normalizedPath;
      const root = lastSlash >= 0 ? normalizedPath.slice(0, lastSlash) : "";

      const result = await daemonRequest(
        fullServer.node,
        "POST",
        `/api/servers/${server.id}/files/create-directory`,
        { name, root }
      );
      await logActivityFromContext(c, ActivityEvents.DIRECTORY_CREATE, {
        serverId: server.id,
        metadata: { path: normalizedPath },
      });
      return c.json(result);
    } else {
      // For files, write an empty file
      const result = await daemonRequest(
        fullServer.node,
        "POST",
        `/api/servers/${server.id}/files/write`,
        { file: normalizedPath, content: "" }
      );
      await logActivityFromContext(c, ActivityEvents.FILE_WRITE, {
        serverId: server.id,
        metadata: { path: normalizedPath },
      });
      return c.json(result);
    }
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete file or directory
servers.delete("/:serverId/files/delete", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const rawPath = c.req.query("path");

  if (!rawPath) {
    return c.json({ error: "Path required" }, 400);
  }

  const path = normalizePath(rawPath);

  // Extract filename and root from path
  const lastSlash = path.lastIndexOf("/");
  const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const root = lastSlash >= 0 ? path.slice(0, lastSlash) : "";

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "DELETE",
      `/api/servers/${server.id}/files/delete`,
      { files: [filename], root }
    );
    await logActivityFromContext(c, ActivityEvents.FILE_DELETE, {
      serverId: server.id,
      metadata: { path },
    });
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Rename file or directory
servers.post("/:serverId/files/rename", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.from || !body.to) {
    return c.json({ error: "From and to paths required" }, 400);
  }

  // The daemon expects from/to to be relative to root
  // Parse paths to extract root and filenames
  const fromPath = normalizePath(body.from);
  const toPath = normalizePath(body.to);

  // Extract root from fromPath (use parent directory)
  const fromLastSlash = fromPath.lastIndexOf("/");
  const toLastSlash = toPath.lastIndexOf("/");

  const fromName = fromLastSlash >= 0 ? fromPath.slice(fromLastSlash + 1) : fromPath;
  const toName = toLastSlash >= 0 ? toPath.slice(toLastSlash + 1) : toPath;
  const root = fromLastSlash >= 0 ? fromPath.slice(0, fromLastSlash) : "";

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/api/servers/${server.id}/files/rename`,
      { from: fromName, to: toName, root }
    );
    await logActivityFromContext(c, ActivityEvents.FILE_RENAME, {
      serverId: server.id,
      metadata: { from: fromPath, to: toPath },
    });
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Change file permissions (chmod)
servers.post("/:serverId/files/chmod", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.path || body.mode === undefined) {
    return c.json({ error: "Path and mode required" }, 400);
  }

  // Validate mode is a valid octal number (e.g., 755, 644)
  const mode = parseInt(String(body.mode), 8);
  if (isNaN(mode) || mode < 0 || mode > 0o777) {
    return c.json({ error: "Invalid mode. Must be octal between 000 and 777" }, 400);
  }

  const path = normalizePath(body.path);
  const lastSlash = path.lastIndexOf("/");
  const file = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const root = lastSlash >= 0 ? path.slice(0, lastSlash) : "";

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/api/servers/${server.id}/files/chmod`,
      {
        root,
        files: [{ file, mode }],
      }
    );
    await logActivityFromContext(c, ActivityEvents.FILE_WRITE, {
      serverId: server.id,
      metadata: { path, mode: body.mode },
    });
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create archive
servers.post("/:serverId/files/archive", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/api/servers/${server.id}/files/compress`,
      { files: body.files || [], root: body.root || "" }
    );
    await logActivityFromContext(c, ActivityEvents.FILE_COMPRESS, {
      serverId: server.id,
      metadata: { files: body.files || [], root: body.root || "" },
    });
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Extract archive
servers.post("/:serverId/files/extract", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  try {
    const fullServer = await getServerWithNode(server.id);
    const file = body.file || body.path;
    const root = body.root || body.destination || "";
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/api/servers/${server.id}/files/decompress`,
      { file, root }
    );
    await logActivityFromContext(c, ActivityEvents.FILE_DECOMPRESS, {
      serverId: server.id,
      metadata: { file, destination: root },
    });
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
    const response = await daemonRequest(
      fullServer.node,
      "GET",
      `/api/servers/${server.id}/backup`
    );
    // Get backups array from response
    const rawBackups = response.backups || response || [];

    // Transform daemon response to expected frontend format
    const backups = rawBackups.map((backup: any) => ({
      id: backup.uuid || backup.id,
      name: backup.name || `Backup ${new Date(backup.created_at * 1000).toLocaleDateString()}`,
      size: backup.size || 0,
      checksum: backup.checksum,
      checksumType: "sha256",
      status: backup.status || "COMPLETED",
      isLocked: backup.is_locked || backup.isLocked || false,
      storagePath: backup.storage_path,
      serverId: server.id,
      ignoredFiles: backup.ignored_files || [],
      completedAt: backup.completed_at
        ? new Date(backup.completed_at * 1000).toISOString()
        : undefined,
      createdAt: backup.created_at
        ? new Date(backup.created_at * 1000).toISOString()
        : new Date().toISOString(),
      updatedAt: backup.updated_at
        ? new Date(backup.updated_at * 1000).toISOString()
        : new Date().toISOString(),
    }));

    return c.json(backups);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create backup
servers.post("/:serverId/backups", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const body = await c.req.json().catch(() => ({}));

  try {
    const fullServer = await getServerWithNode(server.id);
    // Generate a UUID for the backup if not provided
    const backupUuid = body.uuid || crypto.randomUUID();
    const backup = await daemonRequest(
      fullServer.node,
      "POST",
      `/api/servers/${server.id}/backup`,
      { uuid: backupUuid, ignore: body.ignore || [] }
    );
    await logActivityFromContext(c, ActivityEvents.BACKUP_CREATE, {
      serverId: server.id,
      metadata: { backupId: backupUuid },
    });

    // Dispatch webhook (fire and forget)
    dispatchWebhook(WebhookEvents.BACKUP_CREATED, {
      serverId: server.id,
      userId: c.get("user").id,
      data: { backupId: backupUuid },
    }).catch(() => {});

    return c.json(backup);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Restore backup
servers.post("/:serverId/backups/restore", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const id = c.req.query("id");

  if (!id) {
    return c.json({ error: "Backup ID required" }, 400);
  }

  console.log(`[Backup Restore] Attempting to restore backup ${id} for server ${server.id}`);

  try {
    // Update backup status to RESTORING
    await db.backup.update({
      where: { id },
      data: { status: "RESTORING" },
    });

    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "POST",
      `/api/servers/${server.id}/backup/restore`,
      { uuid: id, truncate: false }
    );
    console.log(`[Backup Restore] Successfully completed restore for backup ${id}`);

    // Update backup status back to COMPLETED
    await db.backup.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    await logActivityFromContext(c, ActivityEvents.BACKUP_RESTORE, {
      serverId: server.id,
      metadata: { backupId: id },
    });

    // Dispatch webhook (fire and forget)
    dispatchWebhook(WebhookEvents.BACKUP_RESTORED, {
      serverId: server.id,
      userId: c.get("user").id,
      data: { backupId: id },
    }).catch(() => {});

    return c.json(result);
  } catch (error: any) {
    console.error(`[Backup Restore] Failed to restore backup ${id}:`, error.message);

    // Update backup status to FAILED on error
    await db.backup
      .update({
        where: { id },
        data: { status: "FAILED" },
      })
      .catch(() => {}); // Ignore errors in error handler

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
    const protocol =
      fullServer.node.protocol === "HTTPS" || fullServer.node.protocol === "HTTPS_PROXY"
        ? "https"
        : "http";
    // Use the daemon's public backup download endpoint
    const url = `${protocol}://${fullServer.node.host}:${fullServer.node.port}/download/backup?server=${serverId}&backup=${encodeURIComponent(backupId)}`;

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
servers.delete("/:serverId/backups/delete", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const id = c.req.query("id");

  if (!id) {
    return c.json({ error: "Backup ID required" }, 400);
  }

  console.log(`[Backup Delete] Attempting to delete backup ${id} for server ${server.id}`);

  try {
    const fullServer = await getServerWithNode(server.id);
    const result = await daemonRequest(
      fullServer.node,
      "DELETE",
      `/api/servers/${server.id}/backup/${encodeURIComponent(id)}`
    );
    console.log(`[Backup Delete] Successfully deleted backup ${id} from daemon`);

    // Delete from database
    await db.backup.delete({
      where: { id },
    });
    console.log(`[Backup Delete] Successfully deleted backup ${id} from database`);

    await logActivityFromContext(c, ActivityEvents.BACKUP_DELETE, {
      serverId: server.id,
      metadata: { backupId: id },
    });

    // Dispatch webhook (fire and forget)
    dispatchWebhook(WebhookEvents.BACKUP_DELETED, {
      serverId: server.id,
      userId: c.get("user").id,
      data: { backupId: id },
    }).catch(() => {});

    return c.json(result);
  } catch (error: any) {
    console.error(`[Backup Delete] Failed to delete backup ${id}:`, error.message);
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

  if (typeof body.locked !== "boolean") {
    return c.json({ error: "locked field must be a boolean" }, 400);
  }

  try {
    const backup = await db.backup.findUnique({
      where: { id },
    });

    if (!backup || backup.serverId !== server.id) {
      return c.json({ error: "Backup not found" }, 404);
    }

    const updated = await db.backup.update({
      where: { id },
      data: { isLocked: body.locked },
    });

    await logActivityFromContext(c, ActivityEvents.BACKUP_LOCK, {
      serverId: server.id,
      metadata: { backupId: id, locked: body.locked },
    });

    return c.json({ success: true, locked: updated.isLocked });
  } catch (error: any) {
    console.error(`[Backup Lock] Failed to update backup ${id}:`, error.message);
    return c.json({ error: error.message }, 500);
  }
});

// === Schedules ===

const scheduleSchema = z.object({
  name: z.string().min(1).max(255),
  cronExpression: z.string().min(1), // e.g., "0 0 * * *"
  isActive: z.boolean().default(true),
  tasks: z.array(
    z.object({
      action: z.enum(["power_start", "power_stop", "power_restart", "backup", "command"]),
      payload: z.string().optional(),
      timeOffset: z.number().int().min(0).default(0),
      sequence: z.number().int().min(0).default(0),
    })
  ),
});

// List schedules
servers.get("/:serverId/schedules", requireServerAccess, async (c) => {
  const server = c.get("server");

  const schedules = await db.schedule.findMany({
    where: { serverId: server.id },
    include: { tasks: { orderBy: { sequence: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return c.json(schedules);
});

// Get schedule
servers.get("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { scheduleId } = c.req.param();

  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, serverId: server.id },
    include: { tasks: { orderBy: { sequence: "asc" } } },
  });

  if (!schedule) {
    return c.json({ error: "Schedule not found" }, 404);
  }

  return c.json(schedule);
});

// Create schedule
servers.post("/:serverId/schedules", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  console.log(`[Schedule] Creating schedule "${parsed.data.name}" for server ${server.id}`);

  try {
    const schedule = await db.schedule.create({
      data: {
        serverId: server.id,
        name: parsed.data.name,
        cronExpression: parsed.data.cronExpression,
        isActive: parsed.data.isActive,
        tasks: {
          create: parsed.data.tasks,
        },
      },
      include: { tasks: { orderBy: { sequence: "asc" } } },
    });

    console.log(`[Schedule] Created schedule ${schedule.id}`);

    // TODO: Sync schedule to daemon for execution
    // await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/schedules`, schedule);

    await logActivityFromContext(c, ActivityEvents.SCHEDULE_CREATED, {
      serverId: server.id,
      metadata: { scheduleId: schedule.id, scheduleName: schedule.name },
    });

    return c.json(schedule, 201);
  } catch (error: any) {
    console.error("[Schedule] Failed to create schedule:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Update schedule
servers.patch("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { scheduleId } = c.req.param();
  const body = await c.req.json();

  const parsed = scheduleSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  console.log(`[Schedule] Updating schedule ${scheduleId}`);

  try {
    // Check schedule exists and belongs to server
    const existing = await db.schedule.findFirst({
      where: { id: scheduleId, serverId: server.id },
    });

    if (!existing) {
      return c.json({ error: "Schedule not found" }, 404);
    }

    // Update schedule
    const schedule = await db.schedule.update({
      where: { id: scheduleId },
      data: {
        name: parsed.data.name,
        cronExpression: parsed.data.cronExpression,
        isActive: parsed.data.isActive,
        ...(parsed.data.tasks && {
          tasks: {
            deleteMany: {}, // Remove all existing tasks
            create: parsed.data.tasks, // Create new tasks
          },
        }),
      },
      include: { tasks: { orderBy: { sequence: "asc" } } },
    });

    console.log(`[Schedule] Updated schedule ${scheduleId}`);

    // TODO: Sync schedule to daemon
    // await daemonRequest(fullServer.node, "PATCH", `/api/servers/${server.id}/schedules/${scheduleId}`, schedule);

    await logActivityFromContext(c, ActivityEvents.SCHEDULE_UPDATED, {
      serverId: server.id,
      metadata: { scheduleId: schedule.id, scheduleName: schedule.name },
    });

    return c.json(schedule);
  } catch (error: any) {
    console.error("[Schedule] Failed to update schedule:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Delete schedule
servers.delete("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { scheduleId } = c.req.param();

  console.log(`[Schedule] Deleting schedule ${scheduleId}`);

  try {
    // Check schedule exists and belongs to server
    const existing = await db.schedule.findFirst({
      where: { id: scheduleId, serverId: server.id },
    });

    if (!existing) {
      return c.json({ error: "Schedule not found" }, 404);
    }

    await db.schedule.delete({
      where: { id: scheduleId },
    });

    console.log(`[Schedule] Deleted schedule ${scheduleId}`);

    // TODO: Remove schedule from daemon
    // await daemonRequest(fullServer.node, "DELETE", `/api/servers/${server.id}/schedules/${scheduleId}`);

    await logActivityFromContext(c, ActivityEvents.SCHEDULE_DELETED, {
      serverId: server.id,
      metadata: { scheduleId, scheduleName: existing.name },
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error("[Schedule] Failed to delete schedule:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Run schedule now
servers.post("/:serverId/schedules/:scheduleId/run", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { scheduleId } = c.req.param();

  console.log(`[Schedule] Manually triggering schedule ${scheduleId}`);

  try {
    // Check schedule exists and belongs to server
    const schedule = await db.schedule.findFirst({
      where: { id: scheduleId, serverId: server.id },
      include: { tasks: { orderBy: { sequence: "asc" } } },
    });

    if (!schedule) {
      return c.json({ error: "Schedule not found" }, 404);
    }

    // TODO: Trigger schedule execution on daemon
    // const fullServer = await getServerWithNode(server.id);
    // await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/schedules/${scheduleId}/run`);

    console.log(`[Schedule] Triggered schedule ${scheduleId} manually`);

    await logActivityFromContext(c, ActivityEvents.SCHEDULE_TRIGGERED, {
      serverId: server.id,
      metadata: { scheduleId, scheduleName: schedule.name, manual: true },
    });

    return c.json({ success: true, message: "Schedule triggered successfully" });
  } catch (error: any) {
    console.error("[Schedule] Failed to trigger schedule:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// === Allocation Management ===

// List allocations for a server
servers.get("/:serverId/allocations", requireServerAccess, async (c) => {
  const server = c.get("server");

  const allocations = await db.allocation.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "asc" },
  });

  return c.json(allocations);
});

// Get available allocations on the server's node (admin only)
servers.get("/:serverId/allocations/available", requireAdmin, async (c) => {
  const server = c.get("server");

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    select: { nodeId: true },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Get unassigned allocations on the same node
  const allocations = await db.allocation.findMany({
    where: {
      nodeId: fullServer.nodeId,
      assigned: false,
    },
    orderBy: [{ ip: "asc" }, { port: "asc" }],
  });

  return c.json(allocations);
});

// Add allocation to server (server access required, respects allocation limit)
servers.post("/:serverId/allocations", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();
  const { allocationId } = body;

  if (!allocationId) {
    return c.json({ error: "Allocation ID required" }, 400);
  }

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true, allocations: true },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Check allocation limit (admins bypass this check)
  const user = c.get("user");
  const isAdmin = user.role === "admin";
  if (!isAdmin && fullServer.allocations.length >= fullServer.allocationLimit) {
    return c.json(
      {
        error: `Allocation limit reached (${fullServer.allocationLimit}). Contact an administrator to increase your limit.`,
      },
      400
    );
  }

  // Verify the allocation exists, is on the same node, and is not assigned
  const allocation = await db.allocation.findUnique({
    where: { id: allocationId },
  });

  if (!allocation) {
    return c.json({ error: "Allocation not found" }, 404);
  }

  if (allocation.nodeId !== fullServer.nodeId) {
    return c.json({ error: "Allocation must be on the same node as the server" }, 400);
  }

  if (allocation.assigned) {
    return c.json({ error: "Allocation is already assigned to another server" }, 400);
  }

  // Assign the allocation to the server
  const updated = await db.allocation.update({
    where: { id: allocationId },
    data: {
      assigned: true,
      serverId: server.id,
    },
  });

  // Update the daemon with the new allocation
  if (fullServer.node.isOnline) {
    try {
      const allAllocations = [...fullServer.allocations, updated];
      await daemonRequest(fullServer.node, "PATCH", `/api/servers/${server.id}`, {
        allocations: {
          default: {
            ip: fullServer.allocations[0]?.ip || "0.0.0.0",
            port: fullServer.allocations[0]?.port || 25565,
          },
          mappings: allAllocations.reduce(
            (acc, a) => {
              acc[a.port] = a.port;
              return acc;
            },
            {} as Record<number, number>
          ),
        },
      });
    } catch (error: any) {
      console.error("Failed to update daemon with new allocation:", error);
      // Continue anyway - allocation is assigned in DB
    }
  }

  return c.json(updated);
});

// Remove allocation from server (server access required)
servers.delete("/:serverId/allocations/:allocationId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { allocationId } = c.req.param();

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true, allocations: { orderBy: { createdAt: "asc" } } },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Verify the allocation exists and belongs to this server
  const allocation = await db.allocation.findUnique({
    where: { id: allocationId },
  });

  if (!allocation) {
    return c.json({ error: "Allocation not found" }, 404);
  }

  if (allocation.serverId !== server.id) {
    return c.json({ error: "Allocation does not belong to this server" }, 400);
  }

  // Check if this is the primary (first) allocation
  if (fullServer.allocations.length > 0 && fullServer.allocations[0].id === allocationId) {
    return c.json({ error: "Cannot remove the primary allocation" }, 400);
  }

  // Check if this is the only allocation
  if (fullServer.allocations.length <= 1) {
    return c.json({ error: "Server must have at least one allocation" }, 400);
  }

  // Release the allocation
  await db.allocation.update({
    where: { id: allocationId },
    data: {
      assigned: false,
      serverId: null,
    },
  });

  // Update the daemon with the removed allocation
  if (fullServer.node.isOnline) {
    try {
      const remainingAllocations = fullServer.allocations.filter((a) => a.id !== allocationId);
      await daemonRequest(fullServer.node, "PATCH", `/api/servers/${server.id}`, {
        allocations: {
          default: {
            ip: remainingAllocations[0]?.ip || "0.0.0.0",
            port: remainingAllocations[0]?.port || 25565,
          },
          mappings: remainingAllocations.reduce(
            (acc, a) => {
              acc[a.port] = a.port;
              return acc;
            },
            {} as Record<number, number>
          ),
        },
      });
    } catch (error: any) {
      console.error("Failed to update daemon after allocation removal:", error);
      // Continue anyway - allocation is released in DB
    }
  }

  return c.json({ success: true });
});

// Set primary allocation for a server
servers.post("/:serverId/allocations/:allocationId/primary", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");
  const { allocationId } = c.req.param();

  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true, allocations: { orderBy: { createdAt: "asc" } } },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Verify the allocation exists and belongs to this server
  const allocation = fullServer.allocations.find((a) => a.id === allocationId);

  if (!allocation) {
    return c.json({ error: "Allocation not found or does not belong to this server" }, 404);
  }

  // Update the primary allocation
  await db.server.update({
    where: { id: server.id },
    data: { primaryAllocationId: allocationId },
  });

  // Update the daemon with the new primary allocation
  if (fullServer.node.isOnline) {
    try {
      await daemonRequest(fullServer.node, "PATCH", `/api/servers/${server.id}`, {
        allocations: {
          default: {
            ip: allocation.ip,
            port: allocation.port,
          },
          mappings: fullServer.allocations.reduce(
            (acc, a) => {
              acc[a.port] = a.port;
              return acc;
            },
            {} as Record<number, number>
          ),
        },
      });
    } catch (error: any) {
      console.error("Failed to update daemon with new primary allocation:", error);
      // Continue anyway - primary is updated in DB
    }
  }

  await logActivityFromContext(c, "server:allocation.set-primary", {
    serverId: server.id,
    metadata: { allocationId, ip: allocation.ip, port: allocation.port },
  });

  return c.json({ success: true, allocation });
});

// === Activity Logs ===

// Get activity logs for a server
servers.get("/:serverId/activity", requireServerAccess, async (c) => {
  const server = c.get("server");
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const event = c.req.query("event");

  const where: any = { serverId: server.id };
  if (event) {
    where.event = { startsWith: event };
  }

  const [logs, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    db.activityLog.count({ where }),
  ]);

  return c.json({ logs, total, limit, offset });
});

// === Server Splitting ===

// Split validation schema
const splitServerSchema = z.object({
  name: z.string().min(1).max(100),
  memoryPercent: z.number().min(10).max(90), // Percentage of parent's memory
  diskPercent: z.number().min(10).max(90), // Percentage of parent's disk
  cpuPercent: z.number().min(10).max(90), // Percentage of parent's CPU
});

// Split a server into a child server
servers.post("/:serverId/split", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = splitServerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const { name, memoryPercent, diskPercent, cpuPercent } = parsed.data;

  // Verify the server is not already a child
  if (server.parentServerId) {
    return c.json({ error: "Cannot split a child server" }, 400);
  }

  // Get the full server with node info and blueprint
  const parentServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true, allocations: true, blueprint: true },
  });

  if (!parentServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  if (!parentServer.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  // Calculate resources for child
  const childMemory = BigInt(Math.floor(Number(parentServer.memory) * (memoryPercent / 100)));
  const childDisk = BigInt(Math.floor(Number(parentServer.disk) * (diskPercent / 100)));
  const childCpu = parentServer.cpu * (cpuPercent / 100);

  // Remaining resources for parent
  const newParentMemory = parentServer.memory - childMemory;
  const newParentDisk = parentServer.disk - childDisk;
  const newParentCpu = parentServer.cpu - childCpu;

  // Validate minimum resources (100MB memory, 500MB disk, 10% CPU)
  if (childMemory < 100 || newParentMemory < 100) {
    return c.json({ error: "Both servers must have at least 100 MiB of memory" }, 400);
  }
  if (childDisk < 500 || newParentDisk < 500) {
    return c.json({ error: "Both servers must have at least 500 MiB of disk" }, 400);
  }
  if (childCpu < 10 || newParentCpu < 10) {
    return c.json({ error: "Both servers must have at least 10% CPU" }, 400);
  }

  // Find an unassigned allocation on the same node
  const allocation = await db.allocation.findFirst({
    where: {
      nodeId: parentServer.nodeId,
      assigned: false,
    },
  });

  if (!allocation) {
    return c.json({ error: "No available allocations on this node" }, 400);
  }

  try {
    // Create the child server
    const childServer = await db.server.create({
      data: {
        name,
        nodeId: parentServer.nodeId,
        blueprintId: parentServer.blueprintId,
        ownerId: parentServer.ownerId,
        memory: childMemory,
        disk: childDisk,
        cpu: childCpu,
        parentServerId: parentServer.id,
        config: parentServer.config ?? undefined,
        variables: parentServer.variables ?? undefined,
        dockerImage: parentServer.dockerImage,
        status: "INSTALLING",
        primaryAllocationId: allocation.id,
        allocations: {
          connect: { id: allocation.id },
        },
      },
      include: { node: true, allocations: true },
    });

    // Mark allocation as assigned
    await db.allocation.update({
      where: { id: allocation.id },
      data: { assigned: true },
    });

    // Update parent server resources
    await db.server.update({
      where: { id: parentServer.id },
      data: {
        memory: newParentMemory,
        disk: newParentDisk,
        cpu: newParentCpu,
      },
    });

    // Notify daemon to create the child container
    try {
      // Build invocation command (startup command) from parent/blueprint
      const blueprint = parentServer.blueprint;
      let invocation = blueprint?.startup || "";
      const variables = (childServer.variables as Record<string, string>) || {};

      // Replace variables in invocation
      for (const [key, value] of Object.entries(variables)) {
        invocation = invocation.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }
      invocation = invocation.replace(/\{\{SERVER_PORT\}\}/g, String(allocation.port));
      invocation = invocation.replace(/\{\{SERVER_IP\}\}/g, allocation.ip);
      invocation = invocation.replace(/\{\{SERVER_MEMORY\}\}/g, String(Number(childMemory)));

      // Parse startup detection from blueprint
      const startupDetection = (blueprint?.startupDetection as any) || {};
      const startupDonePatterns: string[] = [];
      if (typeof startupDetection.done === "string") {
        startupDonePatterns.push(startupDetection.done);
      } else if (Array.isArray(startupDetection.done)) {
        startupDonePatterns.push(...startupDetection.done);
      } else if (typeof startupDetection === "string") {
        startupDonePatterns.push(startupDetection);
      }

      // Build the daemon request in the format the Rust daemon expects
      const daemonRequest_body = {
        uuid: childServer.id,
        name: childServer.name,
        suspended: false,
        invocation: invocation,
        skip_egg_scripts: !blueprint?.installScript,
        build: {
          memory_limit: Number(childMemory) * 1024 * 1024, // MiB to bytes
          swap: 0,
          io_weight: 500,
          cpu_limit: childCpu,
          disk_space: Number(childDisk) * 1024 * 1024, // MiB to bytes
          oom_disabled: false,
        },
        container: {
          image: childServer.dockerImage || parentServer.dockerImage || "",
          oom_disabled: false,
        },
        allocations: {
          default: {
            ip: allocation.ip,
            port: allocation.port,
          },
          mappings: {
            [allocation.ip]: [allocation.port],
          },
        },
        egg: {
          id: blueprint?.id || parentServer.blueprintId,
          file_denylist: [],
        },
        mounts: [],
        process_configuration: {
          startup: {
            done: startupDonePatterns,
            user_interaction: [],
            strip_ansi: false,
          },
          stop: blueprint?.stopCommand
            ? { type: "command", value: blueprint.stopCommand }
            : { type: "signal", value: "SIGTERM" },
          configs: [],
        },
      };

      await daemonRequest(parentServer.node, "POST", "/api/servers", daemonRequest_body);

      // Trigger installation if there's an install script
      const hasInstallScript =
        blueprint?.installScript && blueprint.installScript.trim().length > 0;
      if (hasInstallScript) {
        try {
          await daemonRequest(parentServer.node, "POST", `/api/servers/${childServer.id}/install`);
        } catch (installError) {
          console.error("Failed to trigger child server installation:", installError);
        }
      } else {
        // No install script, mark as stopped
        await db.server.update({
          where: { id: childServer.id },
          data: { status: "STOPPED" },
        });
      }

      // Sync parent server resources with daemon and restart it
      try {
        await daemonRequest(parentServer.node, "POST", `/api/servers/${parentServer.id}/sync`);
        // Restart parent server to apply new resource limits
        await daemonRequest(parentServer.node, "POST", `/api/servers/${parentServer.id}/power`, {
          action: "restart",
        });
      } catch (syncError) {
        console.error("Failed to sync/restart parent server after split:", syncError);
      }
    } catch (daemonError: any) {
      // Rollback: restore parent resources, release allocation, delete child server
      await db.server.update({
        where: { id: parentServer.id },
        data: {
          memory: parentServer.memory,
          disk: parentServer.disk,
          cpu: parentServer.cpu,
        },
      });
      await db.allocation.update({
        where: { id: allocation.id },
        data: { assigned: false, serverId: null },
      });
      await db.server.delete({
        where: { id: childServer.id },
      });
      return c.json({ error: `Failed to communicate with daemon: ${daemonError.message}` }, 500);
    }

    await logActivityFromContext(c, "server:split", {
      serverId: parentServer.id,
      metadata: { childServerId: childServer.id, name },
    });

    return c.json({
      success: true,
      childServer: {
        id: childServer.id,
        name: childServer.name,
        memory: Number(childServer.memory),
        disk: Number(childServer.disk),
        cpu: childServer.cpu,
      },
      parentServer: {
        id: parentServer.id,
        memory: Number(newParentMemory),
        disk: Number(newParentDisk),
        cpu: newParentCpu,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get child servers for a parent
servers.get("/:serverId/children", requireServerAccess, async (c) => {
  const server = c.get("server");

  const children = await db.server.findMany({
    where: { parentServerId: server.id },
    select: {
      id: true,
      name: true,
      status: true,
      memory: true,
      disk: true,
      cpu: true,
      createdAt: true,
    },
  });

  return c.json(
    children.map((child) => ({
      ...child,
      memory: Number(child.memory),
      disk: Number(child.disk),
    }))
  );
});

// === Server Transfer ===

const transferServerSchema = z.object({
  targetNodeId: z.string().uuid(),
});

// Initiate a server transfer
servers.post("/:serverId/transfer", requireServerAccess, requireNotSuspended, async (c) => {
  const server = c.get("server");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = transferServerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const { targetNodeId } = parsed.data;

  // Get the full server with node info
  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: { node: true },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  if (!fullServer.node.isOnline) {
    return c.json({ error: "Source node is offline" }, 400);
  }

  // Cannot transfer a child server
  if (fullServer.parentServerId) {
    return c.json({ error: "Cannot transfer a child server" }, 400);
  }

  // Check for existing active transfer
  const existingTransfer = await db.serverTransfer.findFirst({
    where: {
      serverId: server.id,
      status: { notIn: ["COMPLETED", "FAILED"] },
    },
  });

  if (existingTransfer) {
    return c.json({ error: "A transfer is already in progress for this server" }, 400);
  }

  // Get target node
  const targetNode = await db.node.findUnique({
    where: { id: targetNodeId },
  });

  if (!targetNode) {
    return c.json({ error: "Target node not found" }, 404);
  }

  if (!targetNode.isOnline) {
    return c.json({ error: "Target node is offline" }, 400);
  }

  if (targetNode.id === fullServer.nodeId) {
    return c.json({ error: "Server is already on this node" }, 400);
  }

  // Check if target node has enough resources
  const serverMemory = Number(fullServer.memory);
  const serverDisk = Number(fullServer.disk);
  const nodeTotalMemory = Number(targetNode.memoryLimit);
  const nodeTotalDisk = Number(targetNode.diskLimit);

  // Get current usage on target node
  const targetNodeServers = await db.server.aggregate({
    where: { nodeId: targetNodeId },
    _sum: {
      memory: true,
      disk: true,
      cpu: true,
    },
  });

  const usedMemory = Number(targetNodeServers._sum.memory || 0);
  const usedDisk = Number(targetNodeServers._sum.disk || 0);

  if (usedMemory + serverMemory > nodeTotalMemory) {
    return c.json({ error: "Target node does not have enough memory" }, 400);
  }

  if (usedDisk + serverDisk > nodeTotalDisk) {
    return c.json({ error: "Target node does not have enough disk space" }, 400);
  }

  // Find an available allocation on target node
  const allocation = await db.allocation.findFirst({
    where: {
      nodeId: targetNodeId,
      assigned: false,
    },
  });

  if (!allocation) {
    return c.json({ error: "No available allocations on target node" }, 400);
  }

  try {
    // Create transfer record
    const transfer = await db.serverTransfer.create({
      data: {
        serverId: server.id,
        sourceNodeId: fullServer.nodeId,
        targetNodeId,
        status: "PENDING",
      },
    });

    // Notify source daemon to start archiving
    // The daemon will create an archive and update the transfer status
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/transfer`, {
      transferId: transfer.id,
      targetNodeHost: targetNode.host,
      targetNodePort: targetNode.port,
      targetNodeToken: targetNode.token,
      targetAllocation: {
        ip: allocation.ip,
        port: allocation.port,
      },
    });

    // Update transfer status
    await db.serverTransfer.update({
      where: { id: transfer.id },
      data: { status: "ARCHIVING" },
    });

    // Dispatch webhook
    dispatchWebhook(WebhookEvents.TRANSFER_STARTED, {
      serverId: server.id,
      userId: user.id,
      data: { transferId: transfer.id, targetNodeId },
    }).catch(() => {});

    await logActivityFromContext(c, "server:transfer.start", {
      serverId: server.id,
      metadata: { transferId: transfer.id, targetNodeId },
    });

    return c.json({
      success: true,
      transfer: {
        id: transfer.id,
        status: "ARCHIVING",
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get transfer status
servers.get("/:serverId/transfer", requireServerAccess, async (c) => {
  const server = c.get("server");

  const transfer = await db.serverTransfer.findFirst({
    where: {
      serverId: server.id,
      status: { notIn: ["COMPLETED", "FAILED"] },
    },
    include: {
      sourceNode: { select: { displayName: true } },
      targetNode: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!transfer) {
    return c.json({ active: false });
  }

  return c.json({
    active: true,
    transfer: {
      id: transfer.id,
      status: transfer.status,
      progress: transfer.progress,
      error: transfer.error,
      sourceNode: transfer.sourceNode.displayName,
      targetNode: transfer.targetNode.displayName,
      createdAt: transfer.createdAt,
    },
  });
});

// Cancel a transfer
servers.delete("/:serverId/transfer", requireServerAccess, async (c) => {
  const server = c.get("server");

  const transfer = await db.serverTransfer.findFirst({
    where: {
      serverId: server.id,
      status: { in: ["PENDING", "ARCHIVING"] }, // Can only cancel early stages
    },
  });

  if (!transfer) {
    return c.json({ error: "No cancellable transfer found" }, 404);
  }

  await db.serverTransfer.update({
    where: { id: transfer.id },
    data: {
      status: "FAILED",
      error: "Cancelled by user",
      completedAt: new Date(),
    },
  });

  return c.json({ success: true });
});

// Get transfer history
servers.get("/:serverId/transfer/history", requireServerAccess, async (c) => {
  const server = c.get("server");

  const transfers = await db.serverTransfer.findMany({
    where: { serverId: server.id },
    include: {
      sourceNode: { select: { displayName: true } },
      targetNode: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return c.json(
    transfers.map((t) => ({
      id: t.id,
      status: t.status,
      progress: t.progress,
      error: t.error,
      sourceNode: t.sourceNode.displayName,
      targetNode: t.targetNode.displayName,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
    }))
  );
});

// === Server Settings (MOTD) ===

const serverSettingsSchema = z.object({
  motd: z.string().max(500).optional(),
});

// Get server settings
servers.get("/:serverId/settings", requireServerAccess, async (c) => {
  const server = c.get("server");

  const settings = await db.serverSettings.findUnique({
    where: { serverId: server.id },
  });

  return c.json({
    motd: settings?.motd || null,
  });
});

// Update server settings
servers.patch("/:serverId/settings", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({ error: "Only administrators can manage server settings" }, 403);
  }

  const body = await c.req.json();
  const parsed = serverSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const settings = await db.serverSettings.upsert({
    where: { serverId: server.id },
    create: {
      serverId: server.id,
      ...parsed.data,
    },
    update: parsed.data,
  });

  await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
    serverId: server.id,
    metadata: { settingsUpdate: parsed.data },
  });

  return c.json(settings);
});

// === Firewall Management ===

const firewallRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  action: z.enum(["ALLOW", "DENY"]),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp", "both"]),
  sourceIp: z.string().ip().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

const firewallRuleUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
  action: z.enum(["ALLOW", "DENY"]).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["tcp", "udp", "both"]).optional(),
  sourceIp: z.string().ip().optional().or(z.literal("")).optional(),
  isActive: z.boolean().optional(),
});

// List firewall rules
servers.get("/:serverId/firewall", requireServerAccess, async (c) => {
  const server = c.get("server");

  const rules = await db.firewallRule.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
  });

  return c.json(rules);
});

// Create firewall rule
servers.post("/:serverId/firewall", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({ error: "Only administrators can manage firewall rules" }, 403);
  }

  const body = await c.req.json();
  const parsed = firewallRuleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  // Clean up sourceIp if empty string
  const data = {
    ...parsed.data,
    sourceIp: parsed.data.sourceIp === "" ? null : parsed.data.sourceIp,
  };

  const rule = await db.firewallRule.create({
    data: {
      serverId: server.id,
      ...data,
    },
  });

  await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
    serverId: server.id,
    metadata: { firewallRuleCreated: rule.id },
  });

  return c.json({ success: true, rule });
});

// Update firewall rule
servers.patch("/:serverId/firewall/:ruleId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");
  const { ruleId } = c.req.param();

  if (user.role !== "admin") {
    return c.json({ error: "Only administrators can manage firewall rules" }, 403);
  }

  const body = await c.req.json();
  const parsed = firewallRuleUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  // Verify rule belongs to this server
  const existingRule = await db.firewallRule.findUnique({
    where: { id: ruleId },
  });

  if (!existingRule || existingRule.serverId !== server.id) {
    return c.json({ error: "Firewall rule not found" }, 404);
  }

  // Clean up sourceIp if empty string
  const data = {
    ...parsed.data,
    sourceIp: parsed.data.sourceIp === "" ? null : parsed.data.sourceIp,
  };

  const rule = await db.firewallRule.update({
    where: { id: ruleId },
    data,
  });

  await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
    serverId: server.id,
    metadata: { firewallRuleUpdated: rule.id },
  });

  return c.json({ success: true, rule });
});

// Delete firewall rule
servers.delete("/:serverId/firewall/:ruleId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const user = c.get("user");
  const { ruleId } = c.req.param();

  if (user.role !== "admin") {
    return c.json({ error: "Only administrators can manage firewall rules" }, 403);
  }

  // Verify rule belongs to this server
  const existingRule = await db.firewallRule.findUnique({
    where: { id: ruleId },
  });

  if (!existingRule || existingRule.serverId !== server.id) {
    return c.json({ error: "Firewall rule not found" }, 404);
  }

  await db.firewallRule.delete({
    where: { id: ruleId },
  });

  await logActivityFromContext(c, ActivityEvents.SERVER_UPDATE, {
    serverId: server.id,
    metadata: { firewallRuleDeleted: ruleId },
  });

  return c.json({ success: true });
});

export { servers };
