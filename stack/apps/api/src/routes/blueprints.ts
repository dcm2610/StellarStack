import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { requireAuth, requireAdmin } from "../middleware/auth";
import type { Variables } from "../types";

const blueprints = new Hono<{ Variables: Variables }>();

// Validation schemas
const blueprintConfigSchema = z.object({
  stdin_open: z.boolean().optional(),
  tty: z.boolean().optional(),
  ports: z.array(z.object({
    container_port: z.number(),
    host_port: z.number().optional(),
    protocol: z.string().optional(),
  })).optional(),
  environment: z.record(z.string()).optional(),
  resources: z.object({
    memory: z.number().optional(),
    cpus: z.number().optional(),
    cpuset_cpus: z.string().optional(),
  }).optional(),
  mounts: z.array(z.object({
    source: z.string(),
    target: z.string(),
    read_only: z.boolean().optional(),
  })).optional(),
  volumes: z.array(z.object({
    name: z.string(),
    target: z.string(),
    read_only: z.boolean().optional(),
  })).optional(),
  command: z.array(z.string()).optional(),
  entrypoint: z.array(z.string()).optional(),
  working_dir: z.string().optional(),
  restart_policy: z.enum(["no", "always", "onfailure", "unlessstopped"]).optional(),
});

const createBlueprintSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.string().optional(),
  imageName: z.string().min(1),
  imageTag: z.string().default("latest"),
  registry: z.string().optional(),
  config: blueprintConfigSchema,
  isPublic: z.boolean().default(true),
});

const updateBlueprintSchema = createBlueprintSchema.partial();

// Pterodactyl egg schema
const pterodactylEggSchema = z.object({
  meta: z.object({
    version: z.string(),
    update_url: z.string().nullable().optional(),
  }).optional(),
  name: z.string(),
  author: z.string().optional(),
  description: z.string().nullable().optional(),
  features: z.array(z.string()).optional(),
  docker_images: z.record(z.string()).optional(),
  file_denylist: z.array(z.string()).optional(),
  startup: z.string().optional(),
  config: z.object({
    files: z.string().optional(),
    startup: z.string().optional(),
    logs: z.string().optional(),
    stop: z.string().optional(),
  }).optional(),
  scripts: z.object({
    installation: z.object({
      script: z.string(),
      container: z.string().optional(),
      entrypoint: z.string().optional(),
    }).optional(),
  }).optional(),
  variables: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    env_variable: z.string(),
    default_value: z.string(),
    user_viewable: z.boolean().optional(),
    user_editable: z.boolean().optional(),
    rules: z.string().optional(),
    field_type: z.string().optional(),
  })).optional(),
});

// Helper to parse Pterodactyl docker image string
function parseDockerImage(imageStr: string): { registry: string | undefined; name: string; tag: string } {
  // Remove escape sequences
  const cleaned = imageStr.replace(/\\\//g, '/');

  // Parse image parts
  const parts = cleaned.split('/');
  let registry: string | undefined = undefined;
  let nameWithTag: string;

  if (parts.length >= 2 && (parts[0].includes('.') || parts[0].includes(':'))) {
    registry = parts[0];
    nameWithTag = parts.slice(1).join('/');
  } else {
    nameWithTag = cleaned;
  }

  // Split name and tag
  const [name, tag = 'latest'] = nameWithTag.split(':');

  return { registry, name, tag };
}

// List all public blueprints (or all if admin)
blueprints.get("/", requireAuth, async (c) => {
  const user = c.get("user");

  const where = user.role === "admin" ? {} : { isPublic: true };

  const allBlueprints = await db.blueprint.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return c.json(allBlueprints);
});

// Get single blueprint
blueprints.get("/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  const blueprint = await db.blueprint.findUnique({
    where: { id },
  });

  if (!blueprint) {
    return c.json({ error: "Blueprint not found" }, 404);
  }

  // Non-admins can only see public blueprints
  if (!blueprint.isPublic && user.role !== "admin") {
    return c.json({ error: "Blueprint not found" }, 404);
  }

  return c.json(blueprint);
});

// Create blueprint (admin only)
blueprints.post("/", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = createBlueprintSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const blueprint = await db.blueprint.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      imageName: parsed.data.imageName,
      imageTag: parsed.data.imageTag,
      registry: parsed.data.registry,
      config: parsed.data.config as any,
      isPublic: parsed.data.isPublic,
    },
  });

  return c.json(blueprint, 201);
});

// Update blueprint (admin only)
blueprints.patch("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateBlueprintSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  try {
    const updateData: any = { ...parsed.data };
    if (parsed.data.config) {
      updateData.config = parsed.data.config;
    }

    const blueprint = await db.blueprint.update({
      where: { id },
      data: updateData,
    });

    return c.json(blueprint);
  } catch {
    return c.json({ error: "Blueprint not found" }, 404);
  }
});

// Delete blueprint (admin only)
blueprints.delete("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();

  try {
    await db.blueprint.delete({
      where: { id },
    });

    return c.json({ success: true });
  } catch {
    return c.json({ error: "Blueprint not found or in use by servers" }, 400);
  }
});

// Import Pterodactyl egg (admin only)
blueprints.post("/import/egg", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = pterodactylEggSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid Pterodactyl egg format", details: parsed.error.errors }, 400);
  }

  const egg = parsed.data;

  // Get primary docker image (first one or default)
  let primaryImage = { registry: undefined as string | undefined, name: "alpine", tag: "latest" };
  let dockerImages: Record<string, string> = {};

  if (egg.docker_images) {
    const entries = Object.entries(egg.docker_images);
    if (entries.length > 0) {
      // Clean up docker images and store them
      for (const [label, image] of entries) {
        dockerImages[label] = image.replace(/\\\//g, '/');
      }
      // Use first image as primary
      primaryImage = parseDockerImage(entries[0][1]);
    }
  }

  // Parse config files JSON string if present
  let configFiles: any = null;
  if (egg.config?.files) {
    try {
      configFiles = JSON.parse(egg.config.files);
    } catch {
      // Invalid JSON, skip
    }
  }

  // Parse startup detection
  let startupDetection: any = null;
  if (egg.config?.startup) {
    try {
      startupDetection = JSON.parse(egg.config.startup);
    } catch {
      // Invalid JSON, skip
    }
  }

  // Build default environment from variables
  const environment: Record<string, string> = {};
  if (egg.variables) {
    for (const variable of egg.variables) {
      environment[variable.env_variable] = variable.default_value;
    }
  }

  // Create blueprint
  const blueprint = await db.blueprint.create({
    data: {
      name: egg.name,
      description: egg.description || null,
      author: egg.author || null,
      category: "imported",
      imageName: primaryImage.name,
      imageTag: primaryImage.tag,
      registry: primaryImage.registry || null,
      dockerImages: Object.keys(dockerImages).length > 0 ? dockerImages : Prisma.JsonNull,
      startup: egg.startup || null,
      stopCommand: egg.config?.stop || null,
      configFiles: configFiles || Prisma.JsonNull,
      startupDetection: startupDetection || Prisma.JsonNull,
      installScript: egg.scripts?.installation?.script || null,
      installContainer: egg.scripts?.installation?.container || null,
      installEntrypoint: egg.scripts?.installation?.entrypoint || null,
      variables: egg.variables ? egg.variables : Prisma.JsonNull,
      features: egg.features ? egg.features : Prisma.JsonNull,
      config: {
        stdin_open: true,
        tty: true,
        environment,
        // Default volume for server data (used by Pterodactyl eggs)
        volumes: [
          {
            name: "data",
            target: "/home/container", // Pterodactyl's default working directory
          },
        ],
        // Note: Resources (memory, cpu) are set per-server, not in the blueprint
      },
      isPublic: true,
    },
  });

  return c.json({
    success: true,
    blueprint,
    message: `Successfully imported "${egg.name}" from Pterodactyl egg`,
  }, 201);
});

// Export blueprint as Pterodactyl egg format (admin only)
blueprints.get("/:id/export/egg", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const blueprint = await db.blueprint.findUnique({
    where: { id },
  });

  if (!blueprint) {
    return c.json({ error: "Blueprint not found" }, 404);
  }

  // Build docker_images
  const dockerImages: Record<string, string> = blueprint.dockerImages as Record<string, string> || {};
  if (Object.keys(dockerImages).length === 0) {
    const fullImage = blueprint.registry
      ? `${blueprint.registry}/${blueprint.imageName}:${blueprint.imageTag}`
      : `${blueprint.imageName}:${blueprint.imageTag}`;
    dockerImages["Default"] = fullImage;
  }

  // Build config
  const config: any = {
    files: blueprint.configFiles ? JSON.stringify(blueprint.configFiles) : "{}",
    startup: blueprint.startupDetection ? JSON.stringify(blueprint.startupDetection) : "{}",
    logs: "{}",
    stop: blueprint.stopCommand || "stop",
  };

  // Build egg
  const egg = {
    _comment: "EXPORTED FROM STELLARSTACK",
    meta: {
      version: "PTDL_v2",
      update_url: null,
    },
    exported_at: new Date().toISOString(),
    name: blueprint.name,
    author: blueprint.author || "stellarstack@local",
    description: blueprint.description || "",
    features: blueprint.features || [],
    docker_images: dockerImages,
    file_denylist: [],
    startup: blueprint.startup || "",
    config,
    scripts: {
      installation: {
        script: blueprint.installScript || "#!/bin/bash\necho 'No installation script'",
        container: blueprint.installContainer || "alpine",
        entrypoint: blueprint.installEntrypoint || "ash",
      },
    },
    variables: blueprint.variables || [],
  };

  return c.json(egg);
});

export { blueprints };
