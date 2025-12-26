import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, requireAdmin, requireServerAccess } from "../middleware/auth";
import type { Variables } from "../types";

const servers = new Hono<{ Variables: Variables }>();

// Validation schemas
const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  nodeId: z.string(),
  blueprintId: z.string(),
  ownerId: z.string().optional(), // Admin can assign to any user
  memory: z.number().int().positive(), // bytes
  disk: z.number().int().positive(), // bytes
  cpu: z.number().positive(), // cores
  allocationIds: z.array(z.string()).min(1), // At least one allocation
  config: z.record(z.any()).optional(), // Override blueprint config
});

const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  memory: z.number().int().positive().optional(),
  disk: z.number().int().positive().optional(),
  cpu: z.number().positive().optional(),
  config: z.record(z.any()).optional(),
});

// Helper to communicate with daemon
async function daemonRequest(
  node: { host: string; port: number; protocol: string; token: string },
  method: string,
  path: string,
  body?: any
) {
  const protocol = node.protocol === "HTTPS" || node.protocol === "HTTPS_PROXY" ? "https" : "http";
  const url = `${protocol}://${node.host}:${node.port}${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${node.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Daemon error: ${error}`);
    }

    return response.json();
  } catch (error) {
    throw new Error(`Failed to communicate with daemon: ${error}`);
  }
}

// List servers (users see their own, admins see all)
servers.get("/", requireAuth, async (c) => {
  const user = c.get("user");

  const where = user.role === "ADMIN" ? {} : { ownerId: user.id };

  const allServers = await db.server.findMany({
    where,
    include: {
      node: {
        select: { id: true, displayName: true, isOnline: true },
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

  return c.json(allServers);
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
        },
      },
      blueprint: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
      allocations: true,
    },
  });

  return c.json(fullServer);
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

  const usedMemory = Number(existingServers._sum.memory || 0);
  const usedDisk = Number(existingServers._sum.disk || 0);
  const usedCpu = existingServers._sum.cpu || 0;

  if (usedMemory + parsed.data.memory > Number(node.memoryLimit)) {
    return c.json({ error: "Insufficient memory on node" }, 400);
  }

  if (usedDisk + parsed.data.disk > Number(node.diskLimit)) {
    return c.json({ error: "Insufficient disk space on node" }, 400);
  }

  if (usedCpu + parsed.data.cpu > node.cpuLimit) {
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
  const server = await db.server.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      nodeId: parsed.data.nodeId,
      blueprintId: parsed.data.blueprintId,
      ownerId,
      memory: parsed.data.memory,
      disk: parsed.data.disk,
      cpu: parsed.data.cpu,
      config: parsed.data.config as any,
      status: "INSTALLING",
    },
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

  // Merge configs
  const daemonBlueprint = {
    name: server.name,
    description: server.description,
    image: {
      name: blueprint.imageName,
      tag: blueprint.imageTag,
      registry: blueprint.registry,
    },
    stdin_open: blueprintConfig.stdin_open ?? true,
    tty: blueprintConfig.tty ?? true,
    ports: allocations.map((a) => ({
      container_port: a.port,
      host_port: a.port,
      host_ip: a.ip,
    })),
    environment: {
      ...blueprintConfig.environment,
      ...serverConfig.environment,
    },
    resources: {
      memory: parsed.data.memory,
      cpus: parsed.data.cpu,
    },
    volumes: blueprintConfig.volumes,
    mounts: blueprintConfig.mounts,
    restart_policy: blueprintConfig.restart_policy || "unlessstopped",
  };

  // Send to daemon
  try {
    const result = await daemonRequest(node, "POST", `/containers?name=${server.id}`, daemonBlueprint);

    await db.server.update({
      where: { id: server.id },
      data: {
        containerId: result.id,
        status: "RUNNING",
      },
    });

    return c.json(
      {
        ...server,
        containerId: result.id,
        status: "RUNNING",
      },
      201
    );
  } catch (error: any) {
    // Mark as error if daemon fails
    await db.server.update({
      where: { id: server.id },
      data: { status: "ERROR" },
    });

    return c.json({ error: error.message, server }, 500);
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
  if (user.role !== "ADMIN") {
    delete parsed.data.memory;
    delete parsed.data.disk;
    delete parsed.data.cpu;
  }

  const updated = await db.server.update({
    where: { id: server.id },
    data: parsed.data as any,
  });

  return c.json(updated);
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

// Send command to server
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

  // This would need WebSocket support - for now return info for WS connection
  const protocol = fullServer.node.protocol === "HTTP" ? "ws" : "wss";

  return c.json({
    websocketUrl: `${protocol}://${fullServer.node.host}:${fullServer.node.port}/containers/${fullServer.containerId}/console`,
    message: "Use WebSocket to send commands",
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

// List files
servers.get("/:serverId/files", requireServerAccess, async (c) => {
  const server = c.get("server");
  const path = c.req.query("path") || "/";

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
  const path = c.req.query("path");

  if (!path) {
    return c.json({ error: "Path required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const content = await daemonRequest(
      fullServer.node,
      "GET",
      `/containers/${fullServer.containerId}/files/read?path=${encodeURIComponent(path)}`
    );
    return c.json({ content });
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
      body
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
      body
    );
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete file or directory
servers.delete("/:serverId/files/delete", requireServerAccess, async (c) => {
  const server = c.get("server");
  const path = c.req.query("path");

  if (!path) {
    return c.json({ error: "Path required" }, 400);
  }

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
      body
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
    return c.json(schedules);
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
    return c.json(schedule);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create schedule
servers.post("/:serverId/schedules", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();

  if (!body.name || !body.cron || !body.action) {
    return c.json({ error: "Name, cron, and action required" }, 400);
  }

  try {
    const fullServer = await getServerWithNode(server.id);
    const schedule = await daemonRequest(
      fullServer.node,
      "POST",
      `/containers/${fullServer.containerId}/schedules`,
      body
    );
    return c.json(schedule);
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
    const schedule = await daemonRequest(
      fullServer.node,
      "PATCH",
      `/containers/${fullServer.containerId}/schedules/${scheduleId}`,
      body
    );
    return c.json(schedule);
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
