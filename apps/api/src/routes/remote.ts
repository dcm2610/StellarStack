/**
 * Remote API routes for daemon-to-panel communication
 *
 * These endpoints are called by the Rust daemon to:
 * - Fetch server configurations
 * - Report server status
 * - Get installation scripts
 * - Manage backups
 * - Handle transfers
 * - Authenticate SFTP users
 * - Log activity
 */

import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { requireDaemon } from "../middleware/auth";
import { emitServerEvent } from "../lib/ws";
import type { Variables } from "../types";

const remote = new Hono<{ Variables: Variables }>();

// All remote routes require daemon authentication
remote.use("*", requireDaemon);

// Helper to serialize BigInt fields
const serializeServer = (server: any) => {
  return {
    ...server,
    memory: Number(server.memory),
    disk: Number(server.disk),
    swap: Number(server.swap),
  };
};

// ============================================================================
// Server Configuration Endpoints
// ============================================================================

/**
 * GET /api/remote/servers
 * Fetch all servers for this node with pagination
 */
remote.get("/servers", async (c) => {
  const node = c.get("node");
  const page = parseInt(c.req.query("page") || "1");
  const perPage = parseInt(c.req.query("per_page") || "50");

  const skip = (page - 1) * perPage;

  const [servers, total] = await Promise.all([
    db.server.findMany({
      where: { nodeId: node.id },
      include: {
        blueprint: true,
        allocations: true,
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
      skip,
      take: perPage,
      orderBy: { createdAt: "asc" },
    }),
    db.server.count({ where: { nodeId: node.id } }),
  ]);

  const lastPage = Math.ceil(total / perPage);

  // Transform to daemon-expected format
  const data = servers.map((server) => {
    const blueprint = server.blueprint;
    const blueprintConfig = (blueprint.config as any) || {};
    const blueprintVariables = (blueprint.variables as any[]) || [];
    const serverVariables = (server.variables as Record<string, string>) || {};

    // Build environment variables
    const environment: Record<string, string> = {};
    for (const v of blueprintVariables) {
      environment[v.env_variable] = serverVariables[v.env_variable] ?? v.default_value ?? "";
    }
    environment["SERVER_MEMORY"] = String(server.memory);

    // Determine docker image
    let dockerImage = server.dockerImage || `${blueprint.imageName}:${blueprint.imageTag}`;
    if (blueprint.registry) {
      dockerImage = `${blueprint.registry}/${dockerImage}`;
    }

    // Build stop configuration
    let stopConfig: any = { type: "signal", value: "SIGTERM" };
    if (blueprint.stopCommand) {
      stopConfig = { type: "command", value: blueprint.stopCommand };
    }

    // Build startup detection - handle various formats
    let donePatterns: string[] = [];
    let startupDetection: any = blueprint.startupDetection;

    // Try to parse if it's a string (may be double-stringified)
    if (typeof startupDetection === "string") {
      try {
        startupDetection = JSON.parse(startupDetection);
      } catch {
        // If parsing fails, try to extract pattern from malformed JSON string
        // Pattern like: {"done": ")! For help, type "} -> extract just the pattern
        const match = startupDetection.match(/"done":\s*"([^"]+)"/);
        if (match) {
          donePatterns = [match[1]];
        }
        startupDetection = null;
      }
    }

    // If we still have startupDetection as an object, extract done patterns
    if (startupDetection && typeof startupDetection === "object") {
      if (typeof startupDetection.done === "string") {
        donePatterns = [startupDetection.done];
      } else if (Array.isArray(startupDetection.done)) {
        donePatterns = startupDetection.done.filter((p: any) => typeof p === "string");
      }
    }

    // Clean up Windows line endings from patterns
    donePatterns = donePatterns.map((p) => p.replace(/\r\n/g, "\n").replace(/\r/g, ""));

    return {
      uuid: server.id,
      settings: {
        uuid: server.id,
        name: server.name,
        suspended: server.suspended,
        invocation: buildStartupCommand(blueprint.startup, environment),
        skip_egg_scripts: false,
        build: {
          memory_limit: Number(server.memory),
          swap: Number(server.swap),
          io_weight: 500,
          cpu_limit: Math.round(server.cpu),
          threads: server.cpuPinning || null,
          disk_space: Number(server.disk),
          oom_disabled: server.oomKillDisable,
        },
        container: {
          image: dockerImage,
          oom_disabled: server.oomKillDisable,
          requires_rebuild: false,
        },
        allocations: {
          default: {
            ip: server.allocations[0]?.ip || "0.0.0.0",
            port: server.allocations[0]?.port || 25565,
          },
          mappings: buildAllocationMappings(server.allocations),
        },
        egg: {
          id: blueprint.id,
          file_denylist: [],
        },
        mounts: [],
      },
      process_configuration: {
        startup: {
          done: donePatterns,
          user_interaction: [],
          strip_ansi: false,
        },
        stop: stopConfig,
        configs: buildConfigFiles(blueprint.configFiles),
      },
    };
  });

  return c.json({
    data,
    meta: {
      current_page: page,
      last_page: lastPage,
      per_page: perPage,
      total,
    },
  });
});

/**
 * GET /api/remote/servers/:uuid
 * Get configuration for a specific server
 */
remote.get("/servers/:uuid", async (c) => {
  const node = c.get("node");
  const { uuid } = c.req.param();

  const server = await db.server.findFirst({
    where: { id: uuid, nodeId: node.id },
    include: {
      blueprint: true,
      allocations: true,
    },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  const blueprint = server.blueprint;
  const blueprintVariables = (blueprint.variables as any[]) || [];
  const serverVariables = (server.variables as Record<string, string>) || {};

  // Build environment
  const environment: Record<string, string> = {};
  for (const v of blueprintVariables) {
    environment[v.env_variable] = serverVariables[v.env_variable] ?? v.default_value ?? "";
  }
  environment["SERVER_MEMORY"] = String(server.memory);

  // Determine docker image
  let dockerImage = server.dockerImage || `${blueprint.imageName}:${blueprint.imageTag}`;
  if (blueprint.registry) {
    dockerImage = `${blueprint.registry}/${dockerImage}`;
  }

  // Build stop configuration
  let stopConfig: any = { type: "signal", value: "SIGTERM" };
  if (blueprint.stopCommand) {
    stopConfig = { type: "command", value: blueprint.stopCommand };
  }

  // Build startup detection - handle various formats
  let donePatterns: string[] = [];
  let startupDetection: any = blueprint.startupDetection;

  // Try to parse if it's a string (may be double-stringified)
  if (typeof startupDetection === "string") {
    try {
      startupDetection = JSON.parse(startupDetection);
    } catch {
      // If parsing fails, try to extract pattern from malformed JSON string
      const match = startupDetection.match(/"done":\s*"([^"]+)"/);
      if (match) {
        donePatterns = [match[1]];
      }
      startupDetection = null;
    }
  }

  // If we still have startupDetection as an object, extract done patterns
  if (startupDetection && typeof startupDetection === "object") {
    if (typeof startupDetection.done === "string") {
      donePatterns = [startupDetection.done];
    } else if (Array.isArray(startupDetection.done)) {
      donePatterns = startupDetection.done.filter((p: any) => typeof p === "string");
    }
  }

  // Clean up Windows line endings from patterns
  donePatterns = donePatterns.map((p) => p.replace(/\r\n/g, "\n").replace(/\r/g, ""));

  return c.json({
    data: {
      uuid: server.id,
      name: server.name,
      suspended: server.suspended,
      invocation: buildStartupCommand(blueprint.startup, environment),
      skip_egg_scripts: false,
      build: {
        memory_limit: Number(server.memory),
        swap: Number(server.swap),
        io_weight: 500,
        cpu_limit: Math.round(server.cpu),
        threads: server.cpuPinning || null,
        disk_space: Number(server.disk),
        oom_disabled: server.oomKillDisable,
      },
      container: {
        image: dockerImage,
        oom_disabled: server.oomKillDisable,
        requires_rebuild: false,
      },
      allocations: {
        default: {
          ip: server.allocations[0]?.ip || "0.0.0.0",
          port: server.allocations[0]?.port || 25565,
        },
        mappings: buildAllocationMappings(server.allocations),
      },
      egg: {
        id: blueprint.id,
        file_denylist: [],
      },
      mounts: [],
      process_configuration: {
        startup: {
          done: donePatterns,
          user_interaction: [],
          strip_ansi: false,
        },
        stop: stopConfig,
        configs: buildConfigFiles(blueprint.configFiles),
      },
    },
  });
});

/**
 * POST /api/remote/servers/:uuid/status
 * Update server status from daemon
 */
const statusSchema = z.object({
  status: z.enum(["installing", "starting", "running", "stopping", "stopped", "offline", "error"]),
});

remote.post("/servers/:uuid/status", async (c) => {
  const node = c.get("node");
  const { uuid } = c.req.param();
  const body = await c.req.json();

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid status", details: parsed.error.errors }, 400);
  }

  const server = await db.server.findFirst({
    where: { id: uuid, nodeId: node.id },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Don't update status if server is suspended (admin override)
  if (server.status === "SUSPENDED") {
    return c.json({ success: true, message: "Server is suspended, status not updated" });
  }

  // Map daemon status to our schema
  const statusMap: Record<string, string> = {
    installing: "INSTALLING",
    starting: "STARTING",
    running: "RUNNING",
    stopping: "STOPPING",
    stopped: "STOPPED",
    offline: "STOPPED",
    error: "ERROR",
  };

  const newStatus = statusMap[parsed.data.status];

  await db.server.update({
    where: { id: uuid },
    data: { status: newStatus as any },
  });

  // Emit WebSocket event to notify frontend of status change
  emitServerEvent("server:status", uuid, { id: uuid, status: newStatus });

  return c.json({ success: true });
});

// ============================================================================
// Installation Endpoints
// ============================================================================

/**
 * GET /api/remote/servers/:uuid/install
 * Get installation script for a server
 */
remote.get("/servers/:uuid/install", async (c) => {
  const node = c.get("node");
  const { uuid } = c.req.param();

  const server = await db.server.findFirst({
    where: { id: uuid, nodeId: node.id },
    include: {
      blueprint: true,
      allocations: true,
    },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  const blueprint = server.blueprint;

  // Build environment variables for the install script
  const environment: Record<string, string> = {};

  // Add server variables (these are the egg variables configured by the user)
  const serverVariables = (server.variables as Record<string, string>) || {};
  for (const [key, value] of Object.entries(serverVariables)) {
    environment[key] = String(value);
  }

  // Add allocation information
  const primaryAllocation = server.allocations?.[0];
  if (primaryAllocation) {
    environment["SERVER_IP"] = primaryAllocation.ip;
    environment["SERVER_PORT"] = String(primaryAllocation.port);
    environment["P_SERVER_ALLOCATION_LIMIT"] = String(server.allocations?.length || 1);
  }

  // Add server identity
  environment["P_SERVER_UUID"] = server.id;
  environment["SERVER_MEMORY"] = String(server.memory);
  environment["SERVER_DISK"] = String(server.disk);

  // Return empty script if no install script
  if (!blueprint.installScript || blueprint.installScript.trim().length === 0) {
    return c.json({
      data: {
        container_image: "alpine:latest",
        entrypoint: "ash",
        script: "#!/bin/ash\necho 'No installation script'",
        environment,
      },
    });
  }

  return c.json({
    data: {
      container_image: blueprint.installContainer || "ghcr.io/ptero-eggs/installers:alpine",
      entrypoint: blueprint.installEntrypoint || "ash",
      script: blueprint.installScript,
      environment,
    },
  });
});

/**
 * POST /api/remote/servers/:uuid/install
 * Report installation status
 */
const installStatusSchema = z.object({
  successful: z.boolean(),
  reinstall: z.boolean().optional().default(false),
});

remote.post("/servers/:uuid/install", async (c) => {
  const node = c.get("node");
  const { uuid } = c.req.param();
  const body = await c.req.json();

  const parsed = installStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  const server = await db.server.findFirst({
    where: { id: uuid, nodeId: node.id },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Don't update status if server is suspended (admin override)
  if (server.status === "SUSPENDED") {
    return c.json({ success: true, message: "Server is suspended, status not updated" });
  }

  // Update server status based on installation result
  const newStatus = parsed.data.successful ? "STOPPED" : "ERROR";

  await db.server.update({
    where: { id: uuid },
    data: { status: newStatus },
  });

  // Emit WebSocket event to notify frontend of installation completion
  emitServerEvent("server:status", uuid, { id: uuid, status: newStatus });

  return c.json({ success: true });
});

// ============================================================================
// Backup Endpoints
// ============================================================================

/**
 * POST /api/remote/backups/:uuid
 * Update backup status
 */
const backupStatusSchema = z.object({
  successful: z.boolean(),
  checksum: z.string().optional(),
  checksum_type: z.string().optional(),
  size: z.number(),
  parts: z
    .array(
      z.object({
        part_number: z.number(),
        etag: z.string(),
      })
    )
    .optional(),
});

remote.post("/backups/:uuid", async (c) => {
  const { uuid } = c.req.param();
  const body = await c.req.json();

  const parsed = backupStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  // Find and update backup
  const backup = await db.backup.findUnique({
    where: { id: uuid },
  });

  if (!backup) {
    return c.json({ error: "Backup not found" }, 404);
  }

  await db.backup.update({
    where: { id: uuid },
    data: {
      status: parsed.data.successful ? "COMPLETED" : "FAILED",
      size: parsed.data.size,
      checksum: parsed.data.checksum,
      checksumType: parsed.data.checksum_type || "sha256",
      completedAt: parsed.data.successful ? new Date() : null,
    },
  });

  return c.json({ success: true });
});

/**
 * GET /api/remote/backups/:uuid/upload
 * Get pre-signed upload URLs for backup (S3)
 */
remote.get("/backups/:uuid/upload", async (c) => {
  const { uuid } = c.req.param();
  const size = parseInt(c.req.query("size") || "0");

  // TODO: Implement S3 pre-signed URLs when S3 is configured
  // For now, return local upload endpoint

  return c.json({
    parts: [
      {
        part_number: 1,
        url: `/api/remote/backups/${uuid}/upload/local`,
      },
    ],
    upload_id: null,
  });
});

/**
 * POST /api/remote/backups/:uuid/restore
 * Report backup restoration status
 */
const restoreStatusSchema = z.object({
  successful: z.boolean(),
});

remote.post("/backups/:uuid/restore", async (c) => {
  const { uuid } = c.req.param();
  const body = await c.req.json();

  const parsed = restoreStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  // Find and update backup
  const backup = await db.backup.findUnique({
    where: { id: uuid },
  });

  if (!backup) {
    return c.json({ error: "Backup not found" }, 404);
  }

  // Update backup status (restore complete, revert to COMPLETED)
  await db.backup.update({
    where: { id: uuid },
    data: {
      status: parsed.data.successful ? "COMPLETED" : "FAILED",
    },
  });

  // Log activity
  await db.activityLog.create({
    data: {
      event: "server:backup.restore",
      serverId: backup.serverId,
      metadata: {
        backup_id: uuid,
        successful: parsed.data.successful,
      },
    },
  });

  return c.json({ success: true });
});

// ============================================================================
// Transfer Endpoints
// ============================================================================

/**
 * GET /api/remote/servers/:uuid/archive
 * Get transfer archive download URL
 */
remote.get("/servers/:uuid/archive", async (c) => {
  const node = c.get("node");
  const { uuid } = c.req.param();

  const server = await db.server.findFirst({
    where: { id: uuid, nodeId: node.id },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  // TODO: Implement server transfer archive
  return c.json({
    url: "",
    checksum: "",
  });
});

/**
 * POST /api/remote/servers/:uuid/archive
 * Report archive creation status
 */
const archiveStatusSchema = z.object({
  successful: z.boolean(),
});

remote.post("/servers/:uuid/archive", async (c) => {
  const node = c.get("node");
  const { uuid } = c.req.param();
  const body = await c.req.json();

  const parsed = archiveStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  const server = await db.server.findFirst({
    where: { id: uuid, nodeId: node.id },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  // TODO: Update transfer status

  return c.json({ success: true });
});

/**
 * POST /api/remote/servers/:uuid/transfer
 * Report transfer completion status
 */
const transferStatusSchema = z.object({
  successful: z.boolean(),
});

remote.post("/servers/:uuid/transfer", async (c) => {
  const node = c.get("node");
  const { uuid } = c.req.param();
  const body = await c.req.json();

  const parsed = transferStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  const server = await db.server.findFirst({
    where: { id: uuid, nodeId: node.id },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  // TODO: Handle transfer completion

  return c.json({ success: true });
});

// ============================================================================
// SFTP Authentication
// ============================================================================

/**
 * POST /api/remote/sftp/auth
 * Validate SFTP credentials
 */
const sftpAuthSchema = z.object({
  username: z.string(), // Format: server_uuid.user_uuid
  password: z.string(),
});

remote.post("/sftp/auth", async (c) => {
  const node = c.get("node");
  const body = await c.req.json();

  const parsed = sftpAuthSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  // Parse username format: server_uuid.user_uuid
  const parts = parsed.data.username.split(".");
  if (parts.length !== 2) {
    return c.json({ error: "Invalid username format" }, 400);
  }

  const [serverUuid, userIdentifier] = parts;

  // Find server
  const server = await db.server.findFirst({
    where: { id: serverUuid, nodeId: node.id },
    include: { owner: true },
  });

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Find user - can be by ID or email
  const user = await db.user.findFirst({
    where: {
      OR: [{ id: userIdentifier }, { email: userIdentifier }],
    },
    include: {
      accounts: {
        where: { providerId: "credential" },
      },
    },
  });

  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // Verify password (using Better Auth's credential account)
  const credentialAccount = user.accounts.find((a) => a.providerId === "credential");
  if (!credentialAccount?.password) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // Verify password using bcrypt (industry standard like Pterodactyl)
  const { verifyPassword } = await import("../lib/crypto");
  const isValidPassword = await verifyPassword(parsed.data.password, credentialAccount.password);

  if (!isValidPassword) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // Check if user owns the server or is admin
  if (server.ownerId !== user.id && user.role !== "admin") {
    return c.json({ error: "Access denied" }, 403);
  }

  // Return permissions
  const permissions = [
    "control.console",
    "control.start",
    "control.stop",
    "control.restart",
    "file.create",
    "file.read",
    "file.read-content",
    "file.update",
    "file.delete",
    "file.archive",
    "file.sftp",
  ];

  // Admins get all permissions
  if (user.role === "admin") {
    permissions.push("admin.websocket.install", "admin.websocket.errors");
  }

  return c.json({
    server: serverUuid,
    permissions,
  });
});

// ============================================================================
// Activity Logging
// ============================================================================

/**
 * POST /api/remote/activity
 * Receive activity logs from daemon
 */
// Safe metadata schema - only allow primitive values and arrays/objects of primitives
const safeMetadataSchema = z
  .record(
    z.union([
      z.string().max(1000),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])),
    ])
  )
  .optional();

const activityLogSchema = z.object({
  data: z
    .array(
      z.object({
        server: z.string().uuid(),
        event: z
          .string()
          .max(100)
          .regex(/^[a-z0-9:._-]+$/i), // Only allow safe event names
        metadata: safeMetadataSchema,
        ip: z.string().ip().optional(),
        timestamp: z.string().datetime(),
      })
    )
    .max(100), // Limit batch size
});

remote.post("/activity", async (c) => {
  const body = await c.req.json();

  const parsed = activityLogSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.errors }, 400);
  }

  // Store activity logs in database
  const logs = parsed.data.data.map((log) => ({
    event: log.event,
    serverId: log.server,
    ip: log.ip,
    metadata: log.metadata,
    timestamp: new Date(log.timestamp),
  }));

  await db.activityLog.createMany({
    data: logs,
  });

  return c.json({ success: true });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build startup command with variable substitution
 */
const buildStartupCommand = (
  template: string | null,
  variables: Record<string, string>
): string => {
  if (!template) return "";

  let cmd = template;

  // Substitute {{VARIABLE}} patterns
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    cmd = cmd.replace(regex, value);
  }

  return cmd;
};

/**
 * Build allocation mappings for additional ports
 */
const buildAllocationMappings = (
  allocations: Array<{ ip: string; port: number }>
): Record<string, number[]> => {
  const mappings: Record<string, number[]> = {};

  // Skip the first allocation (it's the default)
  for (let i = 1; i < allocations.length; i++) {
    const alloc = allocations[i];
    if (!mappings[alloc.ip]) {
      mappings[alloc.ip] = [];
    }
    mappings[alloc.ip].push(alloc.port);
  }

  return mappings;
};

/**
 * Build config file modifications for daemon
 */
const buildConfigFiles = (configFiles: any): any[] => {
  if (!configFiles) return [];

  const configs: any[] = [];

  // configFiles format: { "server.properties": { "parser": "properties", "find": {...} } }
  for (const [file, config] of Object.entries(configFiles as Record<string, any>)) {
    if (!config || typeof config !== "object") continue;

    const replacements: any[] = [];
    const find = config.find || {};

    for (const [key, value] of Object.entries(find)) {
      replacements.push({
        match: key,
        replace_with: typeof value === "object" ? value : String(value),
      });
    }

    if (replacements.length > 0) {
      configs.push({
        parser: config.parser || "file",
        file,
        replace: replacements,
      });
    }
  }

  return configs;
};

export { remote };
