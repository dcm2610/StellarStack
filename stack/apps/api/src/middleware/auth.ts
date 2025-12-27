import { Context, Next } from "hono";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { verifyToken } from "../lib/crypto";

// User session type
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

// Middleware to require authenticated user
export async function requireAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", session.user as SessionUser);
  c.set("session", session.session);

  return next();
}

// Middleware to require admin role
export async function requireAdmin(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = session.user as SessionUser;

  if (user.role !== "admin") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  c.set("user", user);
  c.set("session", session.session);

  return next();
}

// Middleware for daemon authentication (using node token)
export async function requireDaemon(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing daemon token" }, 401);
  }

  const token = authHeader.slice(7);

  // Find node by token
  const node = await db.node.findFirst({
    where: {
      token: token,
    },
  });

  if (!node) {
    return c.json({ error: "Invalid daemon token" }, 401);
  }

  // Verify token hash
  if (!verifyToken(token, node.tokenHash)) {
    return c.json({ error: "Invalid daemon token" }, 401);
  }

  // Update last heartbeat
  await db.node.update({
    where: { id: node.id },
    data: {
      isOnline: true,
      lastHeartbeat: new Date(),
    },
  });

  c.set("node", node);

  return next();
}

// Middleware to check server ownership
export async function requireServerAccess(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = session.user as SessionUser;
  const serverId = c.req.param("serverId");

  if (!serverId) {
    return c.json({ error: "Server ID required" }, 400);
  }

  const server = await db.server.findUnique({
    where: { id: serverId },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Admins can access any server, users only their own
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden: You don't own this server" }, 403);
  }

  c.set("user", user);
  c.set("server", server);

  return next();
}
