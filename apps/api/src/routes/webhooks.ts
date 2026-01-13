import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { getAvailableEvents, WebhookEvents } from "../lib/webhooks";
import type { Variables } from "../types";

const webhooks = new Hono<{ Variables: Variables }>();

// Validation schemas
const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  serverId: z.string().optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
});

// Get available webhook events
webhooks.get("/events", requireAuth, (c) => {
  const events = getAvailableEvents();
  const categorized = {
    server: Object.entries(WebhookEvents)
      .filter(([key]) => key.startsWith("SERVER_"))
      .map(([, value]) => value),
    backup: Object.entries(WebhookEvents)
      .filter(([key]) => key.startsWith("BACKUP_"))
      .map(([, value]) => value),
    transfer: Object.entries(WebhookEvents)
      .filter(([key]) => key.startsWith("TRANSFER_"))
      .map(([, value]) => value),
    file: Object.entries(WebhookEvents)
      .filter(([key]) => key.startsWith("FILE_"))
      .map(([, value]) => value),
    resource: Object.entries(WebhookEvents)
      .filter(([key]) => key.startsWith("RESOURCE_"))
      .map(([, value]) => value),
  };

  return c.json({ events, categorized });
});

// List all webhooks for current user
webhooks.get("/", requireAuth, async (c) => {
  const user = c.get("user");

  const userWebhooks = await db.webhook.findMany({
    where: { userId: user.id },
    include: {
      server: {
        select: { id: true, name: true },
      },
      _count: {
        select: { deliveries: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json(userWebhooks);
});

// Get a single webhook
webhooks.get("/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  const webhook = await db.webhook.findFirst({
    where: { id, userId: user.id },
    include: {
      server: {
        select: { id: true, name: true },
      },
      deliveries: {
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          event: true,
          statusCode: true,
          attempts: true,
          deliveredAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!webhook) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  return c.json(webhook);
});

// Create a new webhook
webhooks.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createWebhookSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const { url, events, serverId } = parsed.data;

  // Validate events
  const availableEvents = getAvailableEvents();
  const invalidEvents = events.filter((e) => !availableEvents.includes(e));
  if (invalidEvents.length > 0) {
    return c.json({ error: "Invalid events", invalidEvents }, 400);
  }

  // If serverId provided, verify ownership
  if (serverId) {
    const server = await db.server.findFirst({
      where: { id: serverId, ownerId: user.id },
    });
    if (!server) {
      return c.json({ error: "Server not found or not owned by you" }, 404);
    }
  }

  const webhook = await db.webhook.create({
    data: {
      userId: user.id,
      url,
      secret: "", // Not used for Discord webhooks
      events,
      serverId,
      provider: "discord", // Only Discord supported
    },
    include: {
      server: {
        select: { id: true, name: true },
      },
    },
  });

  return c.json(webhook, 201);
});

// Update a webhook
webhooks.patch("/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = updateWebhookSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  // Verify ownership
  const existing = await db.webhook.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  // Validate events if provided
  if (parsed.data.events) {
    const availableEvents = getAvailableEvents();
    const invalidEvents = parsed.data.events.filter((e) => !availableEvents.includes(e));
    if (invalidEvents.length > 0) {
      return c.json({ error: "Invalid events", invalidEvents }, 400);
    }
  }

  const webhook = await db.webhook.update({
    where: { id },
    data: parsed.data,
    include: {
      server: {
        select: { id: true, name: true },
      },
    },
  });

  return c.json(webhook);
});

// Delete a webhook
webhooks.delete("/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  // Verify ownership
  const existing = await db.webhook.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  await db.webhook.delete({
    where: { id },
  });

  return c.json({ success: true });
});

// Get webhook deliveries
webhooks.get("/:id/deliveries", requireAuth, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  // Verify ownership
  const existing = await db.webhook.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const [deliveries, total] = await Promise.all([
    db.webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    db.webhookDelivery.count({
      where: { webhookId: id },
    }),
  ]);

  return c.json({
    deliveries,
    total,
    limit,
    offset,
  });
});

// Get a specific delivery
webhooks.get("/:id/deliveries/:deliveryId", requireAuth, async (c) => {
  const { id, deliveryId } = c.req.param();
  const user = c.get("user");

  // Verify ownership
  const existing = await db.webhook.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const delivery = await db.webhookDelivery.findFirst({
    where: { id: deliveryId, webhookId: id },
  });

  if (!delivery) {
    return c.json({ error: "Delivery not found" }, 404);
  }

  return c.json(delivery);
});

// Retry a failed delivery
webhooks.post("/:id/deliveries/:deliveryId/retry", requireAuth, async (c) => {
  const { id, deliveryId } = c.req.param();
  const user = c.get("user");

  // Verify ownership
  const webhook = await db.webhook.findFirst({
    where: { id, userId: user.id },
  });

  if (!webhook) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  const delivery = await db.webhookDelivery.findFirst({
    where: { id: deliveryId, webhookId: id },
  });

  if (!delivery) {
    return c.json({ error: "Delivery not found" }, 404);
  }

  // Create a new delivery for the retry
  const newDelivery = await db.webhookDelivery.create({
    data: {
      webhookId: id,
      event: delivery.event,
      payload: delivery.payload as object,
      attempts: 1,
    },
  });

  // Dispatch the retry (similar to dispatchWebhook but for a single delivery)
  const payloadString = JSON.stringify(delivery.payload);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "StellarStack-Webhook/1.0",
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await response.text().catch(() => "");

    await db.webhookDelivery.update({
      where: { id: newDelivery.id },
      data: {
        statusCode: response.status,
        response: responseText.substring(0, 5000),
        deliveredAt: response.ok ? new Date() : null,
      },
    });

    return c.json({
      success: response.ok,
      deliveryId: newDelivery.id,
      statusCode: response.status,
    });
  } catch (error: any) {
    await db.webhookDelivery.update({
      where: { id: newDelivery.id },
      data: {
        response: error.message || "Retry failed",
      },
    });

    return c.json(
      {
        success: false,
        deliveryId: newDelivery.id,
        error: error.message || "Request failed",
      },
      500
    );
  }
});

// Test a webhook URL
webhooks.post("/:id/test", requireAuth, async (c) => {
  const user = c.get("user");
  const webhookId = c.req.param("id");

  // Get webhook
  const webhook = await db.webhook.findFirst({
    where: {
      id: webhookId,
      userId: user.id,
    },
  });

  if (!webhook) {
    return c.json({ error: "Webhook not found" }, 404);
  }

  // Import here to avoid circular dependency
  const { sendTestWebhook } = await import("../lib/webhooks");

  try {
    const result = await sendTestWebhook(webhook.url);
    return c.json(result);
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || "Test failed",
      },
      500
    );
  }
});

export { webhooks };
