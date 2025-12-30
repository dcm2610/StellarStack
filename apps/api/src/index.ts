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
  const sessionTokenMatch = cookies.match(/better-auth\.session_token=([^;]+)/);
  const cookieSessionToken = sessionTokenMatch ? decodeURIComponent(sessionTokenMatch[1]) : null;

  if (!cookieSessionToken) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  const session = await db.session.findFirst({
    where: {
      token: cookieSessionToken,
      expiresAt: { gt: new Date() },
    },
  });

  if (!session) {
    return c.json({ error: "Invalid session" }, 401);
  }

  // Return the session token - client can use this for WebSocket auth
  // The token is the same as the cookie, so it's already valid
  return c.json({ token: cookieSessionToken, userId: session.userId });
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
