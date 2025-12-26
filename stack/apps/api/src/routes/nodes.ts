import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { generateToken, hashToken } from "../lib/crypto";
import { requireAdmin, requireDaemon } from "../middleware/auth";

const nodes = new Hono();

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

  // Remove sensitive token info
  const safeNodes = allNodes.map(({ token, tokenHash, ...node }) => node);

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

  // Remove sensitive token info
  const { token, tokenHash, ...safeNode } = node;

  return c.json(safeNode);
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
      id: node.id,
      displayName: node.displayName,
      host: node.host,
      port: node.port,
      protocol: node.protocol,
      location: node.location,
      token: token, // Only returned on creation!
      message: "Store this token securely. It will not be shown again.",
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
    token,
    message: "Store this token securely. It will not be shown again.",
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
    return c.json(safeNode);
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

// === Daemon endpoints ===

// Daemon heartbeat
nodes.post("/heartbeat", requireDaemon, async (c) => {
  const node = c.get("node");

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
