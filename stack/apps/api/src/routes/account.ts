import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, requireAdmin } from "../middleware/auth";
import type { Variables } from "../types";

const account = new Hono<{ Variables: Variables }>();

// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  image: z.string().url().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(["user", "admin"]).optional(),
  image: z.string().url().optional(),
});

// Get current user profile
account.get("/me", requireAuth, async (c) => {
  const user = c.get("user");

  const fullUser = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      createdAt: true,
      _count: {
        select: { servers: true },
      },
    },
  });

  return c.json(fullUser);
});

// Update current user profile
account.patch("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
    },
  });

  return c.json(updated);
});

// Delete current user account
account.delete("/me", requireAuth, async (c) => {
  const user = c.get("user");

  // Check if user has any servers
  const serverCount = await db.server.count({
    where: { ownerId: user.id },
  });

  if (serverCount > 0) {
    return c.json({ error: "Cannot delete account with active servers" }, 400);
  }

  await db.user.delete({
    where: { id: user.id },
  });

  return c.json({ success: true });
});

// === Admin user management ===

// List all users (admin only)
account.get("/users", requireAdmin, async (c) => {
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      createdAt: true,
      _count: {
        select: { servers: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json(users);
});

// Get single user (admin only)
account.get("/users/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      createdAt: true,
      servers: {
        select: {
          id: true,
          name: true,
          status: true,
          node: {
            select: { displayName: true },
          },
        },
      },
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(user);
});

// Update user (admin only)
account.patch("/users/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  try {
    const user = await db.user.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
      },
    });

    return c.json(user);
  } catch {
    return c.json({ error: "User not found" }, 404);
  }
});

// Delete user (admin only)
account.delete("/users/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get("user");

  if (id === currentUser.id) {
    return c.json({ error: "Cannot delete your own account via admin endpoint" }, 400);
  }

  try {
    await db.user.delete({
      where: { id },
    });

    return c.json({ success: true });
  } catch {
    return c.json({ error: "User not found or has associated servers" }, 400);
  }
});

export { account };
