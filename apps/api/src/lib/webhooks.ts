import { db } from "./db";
import crypto from "crypto";
import type { WebhookEvent, WebhookPayload, DispatchWebhookOptions } from "./webhooks.types";

// Re-export types for backwards compatibility
export type { WebhookEvent, WebhookPayload, DispatchWebhookOptions } from "./webhooks.types";

/**
 * Webhook event types
 */
export const WebhookEvents = {
  // Server power events
  SERVER_STARTED: "server.started",
  SERVER_STOPPED: "server.stopped",
  SERVER_CRASHED: "server.crashed",
  SERVER_RESTARTED: "server.restarted",

  // Server lifecycle events
  SERVER_CREATED: "server.created",
  SERVER_DELETED: "server.deleted",
  SERVER_UPDATED: "server.updated",
  SERVER_SUSPENDED: "server.suspended",
  SERVER_UNSUSPENDED: "server.unsuspended",

  // Backup events
  BACKUP_CREATED: "backup.created",
  BACKUP_FAILED: "backup.failed",
  BACKUP_RESTORED: "backup.restored",
  BACKUP_DELETED: "backup.deleted",

  // Transfer events
  TRANSFER_STARTED: "transfer.started",
  TRANSFER_COMPLETED: "transfer.completed",
  TRANSFER_FAILED: "transfer.failed",

  // File events
  FILE_CREATED: "file.created",
  FILE_DELETED: "file.deleted",
  FILE_MODIFIED: "file.modified",

  // Resource events
  RESOURCE_WARNING: "resource.warning",
  RESOURCE_CRITICAL: "resource.critical",
} as const;

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
const signPayload = (payload: string, secret: string): string => {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

/**
 * Format event name for display
 */
const formatEventName = (event: string): string => {
  return event
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

/**
 * Get color for Discord embed based on event type
 */
const getDiscordColor = (event: string): number => {
  if (event.includes("started") || event.includes("created") || event.includes("completed")) {
    return 0x00ff00; // Green
  }
  if (event.includes("stopped") || event.includes("deleted") || event.includes("failed")) {
    return 0xff0000; // Red
  }
  if (event.includes("warning")) {
    return 0xffff00; // Yellow
  }
  return 0x0099ff; // Blue (default)
};

/**
 * Format payload for Discord webhooks
 */
const formatDiscordPayload = (payload: WebhookPayload): object => {
  const embed: {
    title: string;
    description?: string;
    color: number;
    fields: { name: string; value: string; inline?: boolean }[];
    timestamp: string;
    footer: { text: string };
  } = {
    title: `🔔 ${formatEventName(payload.event)}`,
    color: getDiscordColor(payload.event),
    fields: [],
    timestamp: payload.timestamp,
    footer: { text: "StellarStack" },
  };

  if (payload.server) {
    embed.fields.push({
      name: "Server",
      value: payload.server.name,
      inline: true,
    });
    if (payload.server.status) {
      embed.fields.push({
        name: "Status",
        value: payload.server.status,
        inline: true,
      });
    }
  }

  if (payload.data) {
    // Add any extra data fields
    for (const [key, value] of Object.entries(payload.data)) {
      if (typeof value === "string" || typeof value === "number") {
        embed.fields.push({
          name: key.charAt(0).toUpperCase() + key.slice(1),
          value: String(value),
          inline: true,
        });
      }
    }
  }

  return { embeds: [embed] };
};

/**
 * Format payload for Slack webhooks
 */
const formatSlackPayload = (payload: WebhookPayload): object => {
  const blocks: object[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🔔 ${formatEventName(payload.event)}`,
        emoji: true,
      },
    },
  ];

  if (payload.server) {
    const fields: { type: string; text: string }[] = [
      {
        type: "mrkdwn",
        text: `*Server:*\n${payload.server.name}`,
      },
    ];
    if (payload.server.status) {
      fields.push({
        type: "mrkdwn",
        text: `*Status:*\n${payload.server.status}`,
      });
    }
    blocks.push({
      type: "section",
      fields,
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `StellarStack • ${new Date(payload.timestamp).toLocaleString()}`,
      },
    ],
  });

  return { blocks };
};

/**
 * Format payload based on provider
 */
const formatPayloadForProvider = (
  payload: WebhookPayload,
  provider: string
): { body: string; contentType: string } => {
  switch (provider) {
    case "discord":
      return {
        body: JSON.stringify(formatDiscordPayload(payload)),
        contentType: "application/json",
      };
    case "slack":
      return {
        body: JSON.stringify(formatSlackPayload(payload)),
        contentType: "application/json",
      };
    default:
      return {
        body: JSON.stringify(payload),
        contentType: "application/json",
      };
  }
};

/**
 * Generate a random webhook secret
 */
export const generateWebhookSecret = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Dispatch a webhook event
 */
export const dispatchWebhook = async (
  event: WebhookEvent | string,
  options: DispatchWebhookOptions = {}
): Promise<void> => {
  const { serverId, userId, data } = options;

  // Find all webhooks that should receive this event
  const webhooks = await db.webhook.findMany({
    where: {
      enabled: true,
      events: { has: event },
      OR: [
        { serverId: null }, // Global webhooks
        { serverId }, // Server-specific webhooks
      ],
      ...(userId ? { userId } : {}),
    },
    include: {
      server: {
        select: { id: true, name: true, status: true },
      },
    },
  });

  if (webhooks.length === 0) {
    return;
  }

  // Get server info if serverId is provided
  let serverInfo;
  if (serverId) {
    const server = await db.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, status: true },
    });
    if (server) {
      serverInfo = {
        id: server.id,
        name: server.name,
        status: server.status,
      };
    }
  }

  // Build the payload
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    ...(serverInfo && { server: serverInfo }),
    ...(data && { data }),
  };

  // Dispatch to all matching webhooks
  const deliveryPromises = webhooks.map(async (webhook) => {
    // Format payload based on provider
    const { body: formattedBody, contentType } = formatPayloadForProvider(
      payload,
      webhook.provider
    );

    // For generic webhooks, sign the payload; Discord/Slack don't use signatures
    const signature =
      webhook.provider === "generic" ? signPayload(formattedBody, webhook.secret) : "";

    // Create delivery record (always store the original payload for debugging)
    const delivery = await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: payload as object,
        attempts: 1,
      },
    });

    try {
      // Build headers - only include signature for generic webhooks
      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "User-Agent": "StellarStack-Webhook/1.0",
      };

      if (webhook.provider === "generic") {
        headers["X-Webhook-Signature"] = `sha256=${signature}`;
        headers["X-Webhook-Event"] = event;
        headers["X-Webhook-Delivery"] = delivery.id;
      }

      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: formattedBody,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const responseText = await response.text().catch(() => "");

      // Update delivery with result
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          statusCode: response.status,
          response: responseText.substring(0, 5000), // Limit response size
          deliveredAt: response.ok ? new Date() : null,
        },
      });

      // If failed, schedule retry
      if (!response.ok) {
        scheduleRetry(delivery.id, 1);
      }
    } catch (error: any) {
      // Update delivery with error
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          response: error.message || "Request failed",
        },
      });

      // Schedule retry
      scheduleRetry(delivery.id, 1);
    }
  });

  // Execute all deliveries in parallel (fire and forget)
  await Promise.allSettled(deliveryPromises);
};

/**
 * Schedule a retry for a failed webhook delivery
 */
const scheduleRetry = async (deliveryId: string, attemptNumber: number): Promise<void> => {
  // Maximum 5 retry attempts
  if (attemptNumber >= 5) {
    return;
  }

  // Exponential backoff: 1min, 5min, 30min, 2hr
  const delays = [60000, 300000, 1800000, 7200000];
  const delay = delays[attemptNumber - 1] || delays[delays.length - 1];

  setTimeout(async () => {
    const delivery = await db.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });

    if (!delivery || !delivery.webhook || !delivery.webhook.enabled) {
      return;
    }

    // Skip if already delivered
    if (delivery.deliveredAt) {
      return;
    }

    const payloadString = JSON.stringify(delivery.payload);
    const signature = signPayload(payloadString, delivery.webhook.secret);

    try {
      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: { attempts: attemptNumber + 1 },
      });

      const response = await fetch(delivery.webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-Event": delivery.event,
          "X-Webhook-Delivery": deliveryId,
          "X-Webhook-Retry": String(attemptNumber),
          "User-Agent": "StellarStack-Webhook/1.0",
        },
        body: payloadString,
        signal: AbortSignal.timeout(10000),
      });

      const responseText = await response.text().catch(() => "");

      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          statusCode: response.status,
          response: responseText.substring(0, 5000),
          deliveredAt: response.ok ? new Date() : null,
        },
      });

      if (!response.ok && attemptNumber < 4) {
        scheduleRetry(deliveryId, attemptNumber + 1);
      }
    } catch (error: any) {
      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          response: error.message || "Retry failed",
        },
      });

      if (attemptNumber < 4) {
        scheduleRetry(deliveryId, attemptNumber + 1);
      }
    }
  }, delay);
};

/**
 * Get all available webhook events
 */
export const getAvailableEvents = (): string[] => {
  return Object.values(WebhookEvents);
};

/**
 * Verify webhook signature
 */
export const verifyWebhookSignature = (
  payload: string,
  signature: string,
  secret: string
): boolean => {
  const expectedSignature = `sha256=${signPayload(payload, secret)}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};
