import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, requireAdmin } from "../middleware/auth";

const blueprints = new Hono();

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

// List all public blueprints (or all if admin)
blueprints.get("/", requireAuth, async (c) => {
  const user = c.get("user");

  const where = user.role === "ADMIN" ? {} : { isPublic: true };

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
  if (!blueprint.isPublic && user.role !== "ADMIN") {
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

export { blueprints };
