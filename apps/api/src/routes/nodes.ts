import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { generateToken, hashToken } from "../lib/crypto";
import { requireAdmin, requireDaemon } from "../middleware/auth";
import type { Variables } from "../types";

const nodes = new Hono<{ Variables: Variables }>();

// Heartbeat timeout in milliseconds (45 seconds - allows 1 missed heartbeat at 30s interval)
const HEARTBEAT_TIMEOUT_MS = 45 * 1000;

// Helper to convert BigInt fields to string for JSON serialization
// BigInt values can lose precision when converted to Number for large values
// Also checks if node is actually online based on heartbeat
const serializeNode = (node: any) => {
  // Check if heartbeat is stale (older than timeout)
  let isOnline = node.isOnline;
  if (isOnline && node.lastHeartbeat) {
    const lastHeartbeat = new Date(node.lastHeartbeat).getTime();
    const now = Date.now();
    isOnline = now - lastHeartbeat < HEARTBEAT_TIMEOUT_MS;
  } else if (isOnline && !node.lastHeartbeat) {
    // No heartbeat recorded yet, consider offline
    isOnline = false;
  }

  return {
    ...node,
    isOnline,
    memoryLimit: node.memoryLimit?.toString(),
    diskLimit: node.diskLimit?.toString(),
    uploadLimit: node.uploadLimit?.toString(),
  };
};

// Validation schemas
const createNodeSchema = z.object({
  displayName: z.string().min(1).max(100),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["HTTP", "HTTPS", "HTTPS_PROXY"]).default("HTTP"),
  sftpPort: z.number().int().min(1).max(65535).default(2022),
  memoryLimit: z.number().int().positive(), // bytes
  diskLimit: z.number().int().positive(), // bytes
  cpuLimit: z.number().positive(), // cores
  uploadLimit: z.number().int().positive().default(104857600), // 100MB default
  locationId: z.string(),
});

const updateNodeSchema = createNodeSchema.partial().omit({ locationId: true });

const addAllocationSchema = z.object({
  ip: z.string().ip(),
  port: z.number().int().min(1).max(65535),
  alias: z.string().optional(),
});

const addAllocationsRangeSchema = z.object({
  ip: z.string().ip(),
  startPort: z.number().int().min(1).max(65535),
  endPort: z.number().int().min(1).max(65535),
});

// List all nodes (admin only)
nodes.get("/", requireAdmin, async (c) => {
  const allNodes = await db.node.findMany({
    include: {
      location: {
        select: { id: true, name: true },
      },
      _count: {
        select: { servers: true, allocations: true },
      },
    },
    orderBy: { displayName: "asc" },
  });

  // Remove sensitive token info and serialize BigInt fields
  const safeNodes = allNodes.map(({ token, tokenHash, ...node }) => serializeNode(node));

  return c.json(safeNodes);
});

// Get single node (admin only)
nodes.get("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const node = await db.node.findUnique({
    where: { id },
    include: {
      location: true,
      allocations: {
        orderBy: [{ ip: "asc" }, { port: "asc" }],
      },
      servers: {
        select: {
          id: true,
          name: true,
          status: true,
          owner: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  // Remove sensitive token info and serialize BigInt fields
  const { token, tokenHash, ...safeNode } = node;

  return c.json(serializeNode(safeNode));
});

// Create node (admin only) - returns token ONCE
nodes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = createNodeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  // Verify location exists
  const location = await db.location.findUnique({
    where: { id: parsed.data.locationId },
  });

  if (!location) {
    return c.json({ error: "Location not found" }, 404);
  }

  // Generate token
  const token = generateToken(48);
  const tokenHashed = hashToken(token);

  const node = await db.node.create({
    data: {
      ...parsed.data,
      token,
      tokenHash: tokenHashed,
    },
    include: {
      location: {
        select: { id: true, name: true },
      },
    },
  });

  // Return token ONLY on creation - store it securely!
  return c.json(
    {
      node: serializeNode({ ...node, token: undefined, tokenHash: undefined }),
      // Daemon config values - use these in config.toml
      token_id: node.id,
      token: token,
      message:
        "Store token_id and token securely for your daemon config.toml. They will not be shown again.",
    },
    201
  );
});

// Regenerate node token (admin only)
nodes.post("/:id/regenerate-token", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const existingNode = await db.node.findUnique({ where: { id } });

  if (!existingNode) {
    return c.json({ error: "Node not found" }, 404);
  }

  const token = generateToken(48);
  const tokenHashed = hashToken(token);

  await db.node.update({
    where: { id },
    data: {
      token,
      tokenHash: tokenHashed,
      isOnline: false, // Force re-authentication
    },
  });

  return c.json({
    token_id: id,
    token,
    message:
      "Store token_id and token securely for your daemon config.toml. They will not be shown again.",
  });
});

// Update node (admin only)
nodes.patch("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateNodeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  try {
    const node = await db.node.update({
      where: { id },
      data: parsed.data,
    });

    const { token, tokenHash, ...safeNode } = node;
    return c.json(serializeNode(safeNode));
  } catch {
    return c.json({ error: "Node not found" }, 404);
  }
});

// Delete node (admin only)
nodes.delete("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();

  try {
    await db.node.delete({
      where: { id },
    });

    return c.json({ success: true });
  } catch {
    return c.json({ error: "Node not found or has associated servers" }, 400);
  }
});

// === Allocations ===

// Add single allocation to node (admin only)
nodes.post("/:id/allocations", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = addAllocationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const node = await db.node.findUnique({ where: { id } });

  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  try {
    const allocation = await db.allocation.create({
      data: {
        nodeId: id,
        ...parsed.data,
      },
    });

    return c.json(allocation, 201);
  } catch {
    return c.json({ error: "Allocation already exists" }, 409);
  }
});

// Add allocation range to node (admin only)
nodes.post("/:id/allocations/range", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = addAllocationsRangeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const { ip, startPort, endPort } = parsed.data;

  if (startPort > endPort) {
    return c.json({ error: "startPort must be less than or equal to endPort" }, 400);
  }

  const node = await db.node.findUnique({ where: { id } });

  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  const allocations = [];
  for (let port = startPort; port <= endPort; port++) {
    allocations.push({
      nodeId: id,
      ip,
      port,
    });
  }

  const result = await db.allocation.createMany({
    data: allocations,
    skipDuplicates: true,
  });

  return c.json({ created: result.count }, 201);
});

// Delete allocation (admin only)
nodes.delete("/:id/allocations/:allocationId", requireAdmin, async (c) => {
  const { allocationId } = c.req.param();

  try {
    const allocation = await db.allocation.findUnique({
      where: { id: allocationId },
    });

    if (allocation?.assigned) {
      return c.json({ error: "Cannot delete assigned allocation" }, 400);
    }

    await db.allocation.delete({
      where: { id: allocationId },
    });

    return c.json({ success: true });
  } catch {
    return c.json({ error: "Allocation not found" }, 404);
  }
});

// Get node stats from daemon (admin only, proxied)
nodes.get("/:id/stats", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const node = await db.node.findUnique({
    where: { id },
  });

  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  if (!node.isOnline) {
    return c.json({ error: "Node is offline" }, 400);
  }

  // Proxy request to daemon
  const protocol = node.protocol === "HTTP" ? "http" : "https";
  const url = `${protocol}://${node.host}:${node.port}/stats`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${node.token}`,
      },
    });

    if (!response.ok) {
      return c.json({ error: "Failed to fetch stats from daemon" }, 500);
    }

    const stats = await response.json();
    return c.json(stats);
  } catch (error) {
    return c.json({ error: "Failed to connect to daemon" }, 500);
  }
});

// === Daemon endpoints ===

// Daemon handshake - called on startup to verify connection and get config
nodes.post("/handshake", requireDaemon, async (c) => {
  const node = c.get("node");

  // Get full node info with servers
  const fullNode = await db.node.findUnique({
    where: { id: node.id },
    include: {
      location: {
        select: { id: true, name: true, country: true, city: true },
      },
      servers: {
        include: {
          blueprint: true,
          allocations: true,
        },
      },
    },
  });

  if (!fullNode) {
    return c.json({ error: "Node not found" }, 404);
  }

  // Mark as online
  await db.node.update({
    where: { id: node.id },
    data: {
      isOnline: true,
      lastHeartbeat: new Date(),
    },
  });

  return c.json({
    success: true,
    node: {
      id: fullNode.id,
      displayName: fullNode.displayName,
      host: fullNode.host,
      port: fullNode.port,
      protocol: fullNode.protocol,
      sftpPort: fullNode.sftpPort,
      memoryLimit: Number(fullNode.memoryLimit),
      diskLimit: Number(fullNode.diskLimit),
      cpuLimit: fullNode.cpuLimit,
      uploadLimit: Number(fullNode.uploadLimit),
      location: fullNode.location,
    },
    servers: fullNode.servers.map((server) => ({
      id: server.id,
      name: server.name,
      containerId: server.containerId,
      status: server.status,
      memory: Number(server.memory),
      disk: Number(server.disk),
      cpu: server.cpu,
      config: server.config,
      blueprint: {
        id: server.blueprint.id,
        name: server.blueprint.name,
        imageName: server.blueprint.imageName,
        imageTag: server.blueprint.imageTag,
        registry: server.blueprint.registry,
        config: server.blueprint.config,
      },
      allocations: server.allocations.map((a) => ({
        id: a.id,
        ip: a.ip,
        port: a.port,
        alias: a.alias,
      })),
    })),
    timestamp: new Date().toISOString(),
  });
});

// Daemon heartbeat - called periodically to stay online
nodes.post("/heartbeat", requireDaemon, async (c) => {
  const node = c.get("node");
  const body = await c.req.json().catch(() => ({}));

  // Update heartbeat timestamp and optionally latency
  const updateData: { lastHeartbeat: Date; isOnline: boolean; heartbeatLatency?: number } = {
    lastHeartbeat: new Date(),
    isOnline: true,
  };

  // Daemon can optionally report its measured latency (from previous heartbeat RTT)
  if (body.latency !== undefined) {
    updateData.heartbeatLatency = Math.round(body.latency);
  }

  await db.node.update({
    where: { id: node.id },
    data: updateData,
  });

  return c.json({
    acknowledged: true,
    nodeId: node.id,
    timestamp: new Date().toISOString(),
  });
});

// Daemon reports server status
nodes.post("/servers/:serverId/status", requireDaemon, async (c) => {
  const node = c.get("node");
  const { serverId } = c.req.param();
  const body = await c.req.json();

  const server = await db.server.findFirst({
    where: {
      id: serverId,
      nodeId: node.id,
    },
  });

  if (!server) {
    return c.json({ error: "Server not found on this node" }, 404);
  }

  await db.server.update({
    where: { id: serverId },
    data: {
      status: body.status,
      containerId: body.containerId,
    },
  });

  return c.json({ success: true });
});

export { nodes };
