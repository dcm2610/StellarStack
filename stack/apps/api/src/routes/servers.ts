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
  node: { id: string; host: string; port: number; protocol: string; token: string },
  method: string,
  path: string,
  body?: any,
  options?: { responseType?: "json" | "text" }
) {
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

  // Build environment from blueprint variables + server overrides
  const blueprintVariables = (blueprint.variables as any[]) || [];
  const serverVariables = (parsed.data.variables as Record<string, string>) || {};
  const variablesEnvironment: Record<string, string> = {};

  for (const v of blueprintVariables) {
    variablesEnvironment[v.env_variable] = serverVariables[v.env_variable] ?? v.default_value ?? "";
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
  if (typeof startupDetection.done === 'string') {
    startupDonePatterns.push(startupDetection.done);
  } else if (Array.isArray(startupDetection.done)) {
    startupDonePatterns.push(...startupDetection.done);
  } else if (typeof startupDetection === 'string') {
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
      mappings: allocations.reduce((acc, a) => {
        if (!acc[a.ip]) acc[a.ip] = [];
        acc[a.ip].push(a.port);
        return acc;
      }, {} as Record<string, number[]>),
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

  // Remove from daemon
  if (server.node.isOnline) {
    try {
      await daemonRequest(server.node, "DELETE", `/api/servers/${serverId}`);
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

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/power`, { action: "start" });

    await db.server.update({
      where: { id: server.id },
      data: { status: "STARTING" },
    });

    return c.json({ success: true, status: "STARTING" });
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

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/power`, { action: "stop" });

    await db.server.update({
      where: { id: server.id },
      data: { status: "STOPPING" },
    });

    return c.json({ success: true, status: "STOPPING" });
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

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/power`, { action: "restart" });

    await db.server.update({
      where: { id: server.id },
      data: { status: "STARTING" },
    });

    return c.json({ success: true, status: "STARTING" });
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

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/power`, { action: "kill" });

    await db.server.update({
      where: { id: server.id },
      data: { status: "STOPPED" },
    });

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

  if (!fullServer?.node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  try {
    await daemonRequest(fullServer.node, "POST", `/api/servers/${server.id}/commands`, { command });
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
    const protocol = fullServer.node.protocol === "HTTPS" || fullServer.node.protocol === "HTTPS_PROXY" ? "https" : "http";
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
      `/api/servers/${server.id}/files/write`,
      { file: normalizePath(body.path), content: body.content }
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
      return c.json(result);
    } else {
      // For files, write an empty file
      const result = await daemonRequest(
        fullServer.node,
        "POST",
        `/api/servers/${server.id}/files/write`,
        { file: normalizedPath, content: "" }
      );
      return c.json(result);
    }
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
      `/api/servers/${server.id}/files/compress`,
      { files: body.files || [], root: body.root || "" }
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
      `/api/servers/${server.id}/files/decompress`,
      { file: body.file || body.path, root: body.root || body.destination || "" }
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
      completedAt: backup.completed_at ? new Date(backup.completed_at * 1000).toISOString() : undefined,
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
servers.post("/:serverId/backups", requireServerAccess, async (c) => {
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
      `/api/servers/${server.id}/backup/restore`,
      { uuid: id, truncate: false }
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
      `/api/servers/${server.id}/backup/${encodeURIComponent(id)}`
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Lock/unlock backup - not yet implemented in new daemon
servers.patch("/:serverId/backups/lock", requireServerAccess, async (c) => {
  const server = c.get("server");
  const id = c.req.query("id");
  const body = await c.req.json();

  if (!id) {
    return c.json({ error: "Backup ID required" }, 400);
  }

  // TODO: Add backup lock endpoint to daemon
  return c.json({ success: true, locked: body.locked || false });
});

// === Schedules ===
// Note: Schedules are not yet implemented in the new daemon
// These are stubbed out for now

// List schedules
servers.get("/:serverId/schedules", requireServerAccess, async (c) => {
  // TODO: Implement schedules in daemon
  return c.json([]);
});

// Get schedule
servers.get("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  // TODO: Implement schedules in daemon
  return c.json({ error: "Schedules not yet implemented" }, 501);
});

// Create schedule
servers.post("/:serverId/schedules", requireServerAccess, async (c) => {
  // TODO: Implement schedules in daemon
  return c.json({ error: "Schedules not yet implemented" }, 501);
});

// Update schedule
servers.patch("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  // TODO: Implement schedules in daemon
  return c.json({ error: "Schedules not yet implemented" }, 501);
});

// Delete schedule
servers.delete("/:serverId/schedules/:scheduleId", requireServerAccess, async (c) => {
  // TODO: Implement schedules in daemon
  return c.json({ error: "Schedules not yet implemented" }, 501);
});

// Run schedule now
servers.post("/:serverId/schedules/:scheduleId/run", requireServerAccess, async (c) => {
  // TODO: Implement schedules in daemon
  return c.json({ error: "Schedules not yet implemented" }, 501);
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

// Add allocation to server (admin only)
servers.post("/:serverId/allocations", requireAdmin, async (c) => {
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
          mappings: allAllocations.reduce((acc, a) => {
            acc[a.port] = a.port;
            return acc;
          }, {} as Record<number, number>),
        },
      });
    } catch (error: any) {
      console.error("Failed to update daemon with new allocation:", error);
      // Continue anyway - allocation is assigned in DB
    }
  }

  return c.json(updated);
});

// Remove allocation from server (admin only)
servers.delete("/:serverId/allocations/:allocationId", requireAdmin, async (c) => {
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
          mappings: remainingAllocations.reduce((acc, a) => {
            acc[a.port] = a.port;
            return acc;
          }, {} as Record<number, number>),
        },
      });
    } catch (error: any) {
      console.error("Failed to update daemon after allocation removal:", error);
      // Continue anyway - allocation is released in DB
    }
  }

  return c.json({ success: true });
});

export { servers };
