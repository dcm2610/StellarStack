import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { auth } from "../lib/auth";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { sendEmail, testEmailConfig, getEmailConfigStatus } from "../lib/email";
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

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["user", "admin"]).default("user"),
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

// Create user (admin only)
account.post("/users", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const { name, email, password, role } = parsed.data;

  // Check if email already exists
  const existingUser = await db.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return c.json({ error: "A user with this email already exists" }, 400);
  }

  try {
    // Use better-auth's API to create user with proper password hash
    const ctx = await auth.api.signUpEmail({
      body: { email, password, name },
    });

    if (!ctx.user) {
      return c.json({ error: "Failed to create user" }, 500);
    }

    // Update user role and mark email as verified (admin-created users are trusted)
    const user = await db.user.update({
      where: { id: ctx.user.id },
      data: {
        role,
        emailVerified: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        role: true,
        createdAt: true,
      },
    });

    return c.json(user, 201);
  } catch (error) {
    console.error("Failed to create user:", error);
    return c.json({ error: "Failed to create user" }, 500);
  }
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

// === Admin email management ===

// Get email configuration status (admin only)
account.get("/admin/email/status", requireAdmin, async (c) => {
  const status = getEmailConfigStatus();
  return c.json(status);
});

// Send test email (admin only)
account.post("/admin/email/test", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const testAddress = body.email;

  if (!testAddress) {
    return c.json({ error: "Email address required" }, 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(testAddress)) {
    return c.json({ error: "Invalid email format" }, 400);
  }

  const result = await sendEmail({
    to: testAddress,
    subject: "StellarStack Email Test",
    html: `
      <h1>Email Configuration Test</h1>
      <p>This is a test email from StellarStack.</p>
      <p><strong>Provider:</strong> ${getEmailConfigStatus().provider}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <p>If you received this email, your email configuration is working correctly!</p>
    `,
    text: `Email Configuration Test\n\nThis is a test email from StellarStack.\nProvider: ${getEmailConfigStatus().provider}\nTime: ${new Date().toISOString()}\n\nIf you received this email, your email configuration is working correctly!`,
  });

  if (result.success) {
    return c.json({ success: true, messageId: result.messageId });
  } else {
    return c.json({ error: result.error || "Failed to send test email" }, 500);
  }
});

export { account };
