import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAdmin } from "../middleware/auth";
import type { Variables } from "../types";

const locations = new Hono<{ Variables: Variables }>();

// Validation schemas
const createLocationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
});

const updateLocationSchema = createLocationSchema.partial();

// List all locations
locations.get("/", async (c) => {
  const allLocations = await db.location.findMany({
    include: {
      _count: {
        select: { nodes: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return c.json(allLocations);
});

// Get single location
locations.get("/:id", async (c) => {
  const { id } = c.req.param();

  const location = await db.location.findUnique({
    where: { id },
    include: {
      nodes: {
        select: {
          id: true,
          displayName: true,
          isOnline: true,
          lastHeartbeat: true,
        },
      },
    },
  });

  if (!location) {
    return c.json({ error: "Location not found" }, 404);
  }

  return c.json(location);
});

// Create location (admin only)
locations.post("/", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = createLocationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const location = await db.location.create({
    data: parsed.data,
  });

  return c.json(location, 201);
});

// Update location (admin only)
locations.patch("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateLocationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  try {
    const location = await db.location.update({
      where: { id },
      data: parsed.data,
    });

    return c.json(location);
  } catch {
    return c.json({ error: "Location not found" }, 404);
  }
});

// Delete location (admin only)
locations.delete("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();

  try {
    await db.location.delete({
      where: { id },
    });

    return c.json({ success: true });
  } catch {
    return c.json({ error: "Location not found or has associated nodes" }, 400);
  }
});

export { locations };
