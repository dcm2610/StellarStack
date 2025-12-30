import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createNodeWebSocket } from "@hono/node-ws";
import { serve } from "@hono/node-server";

import { auth } from "./lib/auth";
import { wsManager } from "./lib/ws";
import { account } from "./routes/account";
import { locations } from "./routes/locations";
import { nodes } from "./routes/nodes";
import { blueprints } from "./routes/blueprints";
import { servers } from "./routes/servers";
import { webhooks } from "./routes/webhooks";
import { domains } from "./routes/domains";
import { remote } from "./routes/remote";
import { members } from "./routes/members";
import { settings } from "./routes/settings";
import { securityHeaders, validateEnvironment, getRequiredEnv } from "./middleware/security";
import { authRateLimit, apiRateLimit } from "./middleware/rate-limit";
import { db } from "./lib/db";

// Validate environment variables at startup
validateEnvironment();

const app = new Hono();

// Create WebSocket adapter
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Get frontend URL with production safety
const FRONTEND_URL = getRequiredEnv("FRONTEND_URL", "http://localhost:3000");

// Middleware
app.use("*", logger());
app.use("*", securityHeaders());

// CORS for auth routes (must be before the auth handler)
app.use(
  "/api/auth/*",
  cors({
    origin: FRONTEND_URL,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  })
);

// Rate limiting for auth routes
app.use("/api/auth/sign-in/*", authRateLimit);
app.use("/api/auth/sign-up/*", authRateLimit);
app.use("/api/auth/forget-password/*", authRateLimit);

// Better Auth routes
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// CORS for other API routes
app.use(
  "/api/*",
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// General API rate limiting
app.use("/api/*", apiRateLimit);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WebSocket authentication token endpoint
// This allows clients to get a short-lived token for WebSocket authentication
// when cookies don't work (cross-origin)
app.get("/api/ws/token", async (c) => {
  // Get session from cookies
  const cookies = c.req.header("Cookie") || "";
  console.log("[WS Token] Cookies received:", cookies.substring(0, 100) + "...");

  // Try multiple cookie name formats (Better Auth may use different formats)
  let cookieSessionToken: string | null = null;

  // Try: better-auth.session_token (with dot)
  const dotMatch = cookies.match(/better-auth\.session_token=([^;]+)/);
  if (dotMatch) {
    cookieSessionToken = decodeURIComponent(dotMatch[1]);
    console.log("[WS Token] Found token with dot format");
  }

  // Try: better-auth_session_token (with underscore)
  if (!cookieSessionToken) {
    const underscoreMatch = cookies.match(/better-auth_session_token=([^;]+)/);
    if (underscoreMatch) {
      cookieSessionToken = decodeURIComponent(underscoreMatch[1]);
      console.log("[WS Token] Found token with underscore format");
    }
  }

  // Try: session_token (simple)
  if (!cookieSessionToken) {
    const simpleMatch = cookies.match(/session_token=([^;]+)/);
    if (simpleMatch) {
      cookieSessionToken = decodeURIComponent(simpleMatch[1]);
      console.log("[WS Token] Found token with simple format");
    }
  }

  if (!cookieSessionToken) {
    console.log("[WS Token] No session token found in cookies");
    return c.json({ error: "Not authenticated" }, 401);
  }

  console.log(
    "[WS Token] Looking up session with token:",
    cookieSessionToken.substring(0, 20) + "..."
  );

  // First, try to find any session with this token (ignore expiry for debugging)
  const anySession = await db.session.findFirst({
    where: { token: cookieSessionToken },
  });

  if (anySession) {
    console.log("[WS Token] Found session, expires:", anySession.expiresAt, "now:", new Date());
    if (anySession.expiresAt <= new Date()) {
      console.log("[WS Token] Session is expired!");
      return c.json({ error: "Session expired" }, 401);
    }
  } else {
    console.log("[WS Token] No session found with this token");
    // List some sessions for debugging (remove in production)
    const recentSessions = await db.session.findMany({
      take: 3,
      orderBy: { createdAt: "desc" },
      select: { token: true, expiresAt: true },
    });
    console.log(
      "[WS Token] Recent sessions:",
      recentSessions.map((s) => ({
        tokenStart: s.token.substring(0, 20),
        expiresAt: s.expiresAt,
      }))
    );
    return c.json({ error: "Invalid session" }, 401);
  }

  // Return the session token
  return c.json({ token: cookieSessionToken, userId: anySession.userId });
});

// Public setup status endpoint - check if system is initialized
app.get("/api/admin/status", async (c) => {
  const userCount = await db.user.count();
  const adminCount = await db.user.count({ where: { role: "admin" } });

  return c.json({
    initialized: userCount > 0,
    hasAdmin: adminCount > 0,
    userCount,
  });
});

// Password recovery/migration - reset password for existing users
// This is useful when migrating password hash algorithms (e.g., argon2 -> bcrypt)
// Requires ADMIN_RECOVERY_KEY environment variable to be set
app.post("/api/admin/reset-password", async (c) => {
  const recoveryKey = process.env.ADMIN_RECOVERY_KEY;

  if (!recoveryKey) {
    return c.json(
      {
        error:
          "Password recovery is disabled. Set ADMIN_RECOVERY_KEY environment variable to enable.",
      },
      403
    );
  }

  const body = await c.req.json();
  const { email, newPassword, recoveryKey: providedKey } = body;

  if (!email || !newPassword || !providedKey) {
    return c.json({ error: "Email, new password, and recovery key are required" }, 400);
  }

  if (providedKey !== recoveryKey) {
    return c.json({ error: "Invalid recovery key" }, 403);
  }

  if (newPassword.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  try {
    // Find the user
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Hash the new password using bcrypt
    const { hashPassword } = await import("./lib/crypto");
    const hashedPassword = await hashPassword(newPassword);

    // Update the user's password in the account table
    await db.account.updateMany({
      where: {
        userId: user.id,
        providerId: "credential",
      },
      data: {
        password: hashedPassword,
      },
    });

    console.log(`[Recovery] Password reset for user: ${email}`);

    return c.json({
      success: true,
      message: "Password has been reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    console.error("[Recovery] Failed to reset password:", error);
    return c.json({ error: "Failed to reset password" }, 500);
  }
});

// First-time setup - create initial admin account (only works if no users exist)
app.post("/api/setup", async (c) => {
  // Check if system is already initialized
  const userCount = await db.user.count();
  if (userCount > 0) {
    return c.json({ error: "System is already initialized" }, 400);
  }

  const body = await c.req.json();

  // Validate input
  const { name, email, password } = body;
  if (!name || !email || !password) {
    return c.json({ error: "Name, email, and password are required" }, 400);
  }

  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return c.json({ error: "Invalid email format" }, 400);
  }

  try {
    // Create the user using better-auth
    const ctx = await auth.api.signUpEmail({
      body: { email, password, name },
    });

    if (!ctx.user) {
      return c.json({ error: "Failed to create user" }, 500);
    }

    // Update user to be admin with verified email
    const user = await db.user.update({
      where: { id: ctx.user.id },
      data: {
        role: "admin",
        emailVerified: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    console.log(`[Setup] Created first admin user: ${user.email}`);

    return c.json(
      {
        success: true,
        user,
        message: "Admin account created successfully",
      },
      201
    );
  } catch (error) {
    console.error("[Setup] Failed to create admin:", error);
    return c.json({ error: "Failed to create admin account" }, 500);
  }
});

// Public feature flags endpoint - check if subdomains are available
app.get("/api/features/subdomains", async (c) => {
  const subdomainSettings = await db.settings.findUnique({
    where: { key: "subdomains" },
  });
  const cloudflareSettings = await db.settings.findUnique({
    where: { key: "cloudflare" },
  });

  const subdomains = subdomainSettings?.value as {
    enabled?: boolean;
    baseDomain?: string;
    dnsProvider?: string;
  } | null;
  const cloudflare = cloudflareSettings?.value as { enabled?: boolean; domain?: string } | null;

  // Subdomains are available if:
  // 1. Subdomain feature is enabled in settings, AND
  // 2. Either Cloudflare is configured OR manual DNS is being used
  const isCloudflareConfigured = cloudflare?.enabled === true && !!cloudflare?.domain;
  const isManualDns = subdomains?.dnsProvider === "manual";

  const enabled = subdomains?.enabled === true && (isCloudflareConfigured || isManualDns);
  const baseDomain = isCloudflareConfigured ? cloudflare?.domain : subdomains?.baseDomain;

  return c.json({
    enabled,
    baseDomain: enabled ? baseDomain : null,
    dnsProvider: subdomains?.dnsProvider || "manual",
  });
});

// API routes
app.route("/api/account", account);
app.route("/api/locations", locations);
app.route("/api/nodes", nodes);
app.route("/api/blueprints", blueprints);
app.route("/api/servers", servers);
app.route("/api/webhooks", webhooks);
app.route("/api/servers", domains); // Domain routes under /api/servers/:serverId/subdomain and /domains
app.route("/api/servers", members); // Member routes under /api/servers/:serverId/members
app.route("/api/admin/settings", settings); // Admin settings routes

// Daemon-facing API routes (node authentication required)
app.route("/api/remote", remote);

// WebSocket endpoint for real-time updates with authentication
app.get(
  "/api/ws",
  upgradeWebSocket((c) => {
    // Extract session token from cookies during upgrade
    const cookies = c.req.header("Cookie") || "";
    const sessionTokenMatch = cookies.match(/better-auth\.session_token=([^;]+)/);
    const cookieSessionToken = sessionTokenMatch ? decodeURIComponent(sessionTokenMatch[1]) : null;

    console.log(`[WS] Connection upgrade, cookie token present: ${!!cookieSessionToken}`);

    return {
      onOpen: async (_event, ws) => {
        console.log("[WS] Client connected");
        // Add client first
        wsManager.addClient(ws.raw as any);

        // Try to auto-authenticate via cookie
        if (cookieSessionToken) {
          console.log("[WS] Attempting cookie authentication...");
          const session = await db.session.findFirst({
            where: {
              token: cookieSessionToken,
              expiresAt: { gt: new Date() },
            },
            include: { user: true },
          });

          if (session) {
            console.log(`[WS] Cookie auth successful for user ${session.userId}`);
            wsManager.authenticateClient(ws.raw as any, session.userId);
            ws.send(JSON.stringify({ type: "auth_success", userId: session.userId }));
          } else {
            console.log("[WS] Cookie auth failed - no valid session found");
          }
        } else {
          console.log("[WS] No cookie token found");
        }
      },
      onMessage: async (event, ws) => {
        const message = event.data.toString();

        try {
          const data = JSON.parse(message);

          // Handle authentication message (fallback for manual auth)
          if (data.type === "auth" && data.token) {
            // Verify session token
            const session = await db.session.findFirst({
              where: {
                token: data.token,
                expiresAt: { gt: new Date() },
              },
              include: { user: true },
            });

            if (session) {
              // Update client with authenticated user
              wsManager.authenticateClient(ws.raw as any, session.userId);
              ws.send(JSON.stringify({ type: "auth_success", userId: session.userId }));
            } else {
              ws.send(JSON.stringify({ type: "auth_error", error: "Invalid or expired session" }));
            }
            return;
          }

          // Handle other messages
          wsManager.handleMessage(ws.raw as any, message);
        } catch {
          // Invalid JSON, let wsManager handle it
          wsManager.handleMessage(ws.raw as any, message);
        }
      },
      onClose: (_event, ws) => {
        wsManager.removeClient(ws.raw as any);
      },
      onError: (_event, ws) => {
        wsManager.removeClient(ws.raw as any);
      },
    };
  })
);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  // Don't log full error details in production
  if (process.env.NODE_ENV === "production") {
    console.error(`[Error] ${err.message}`);
  } else {
    console.error(err);
  }
  return c.json({ error: "Internal server error" }, 500);
});

// Start server
const port = parseInt(process.env.PORT || "3001");
const hostname = process.env.HOSTNAME || "::";

console.log(`Starting API server on port ${port}...`);

const server = serve({
  fetch: app.fetch,
  port,
  hostname,
});

// Inject WebSocket support into the server
injectWebSocket(server);

console.log(`API server running at http://localhost:${port}`);
console.log(`WebSocket endpoint available at ws://localhost:${port}/api/ws`);
