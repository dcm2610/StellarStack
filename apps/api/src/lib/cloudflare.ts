/**
 * Cloudflare DNS API integration
 */

import { db } from "./db";
import type { CloudflareSettings } from "../routes/settings.types";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Get Cloudflare settings from the database
 */
export async function getCloudflareSettings(): Promise<CloudflareSettings> {
  const setting = await db.settings.findUnique({
    where: { key: "cloudflare" },
  });

  const defaultSettings: CloudflareSettings = {
    apiToken: "",
    zoneId: "",
    domain: "",
    enabled: false,
  };

  if (!setting?.value) {
    return defaultSettings;
  }

  return setting.value as unknown as CloudflareSettings;
}

/**
 * Check if Cloudflare is configured and enabled
 */
export async function isCloudflareEnabled(): Promise<boolean> {
  const settings = await getCloudflareSettings();
  return settings.enabled && !!settings.apiToken && !!settings.zoneId;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

/**
 * Create a DNS A record for a subdomain pointing to an IP
 */
export async function createDnsRecord(
  subdomain: string,
  targetIp: string,
  proxied: boolean = true
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  const settings = await getCloudflareSettings();

  if (!settings.enabled || !settings.apiToken || !settings.zoneId) {
    return { success: false, error: "Cloudflare is not configured" };
  }

  const fullName = `${subdomain}.${settings.domain}`;

  try {
    const response = await fetch(`${CLOUDFLARE_API_BASE}/zones/${settings.zoneId}/dns_records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "A",
        name: fullName,
        content: targetIp,
        proxied,
        ttl: proxied ? 1 : 300, // Auto TTL when proxied
      }),
    });

    const data: CloudflareResponse<DnsRecord> = await response.json();

    if (!data.success) {
      const errorMsg = data.errors?.[0]?.message || "Unknown Cloudflare error";
      console.error("Cloudflare API error:", data.errors);
      return { success: false, error: errorMsg };
    }

    return { success: true, recordId: data.result.id };
  } catch (error: any) {
    console.error("Failed to create Cloudflare DNS record:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a DNS record by ID
 */
export async function deleteDnsRecord(
  recordId: string
): Promise<{ success: boolean; error?: string }> {
  const settings = await getCloudflareSettings();

  if (!settings.enabled || !settings.apiToken || !settings.zoneId) {
    return { success: false, error: "Cloudflare is not configured" };
  }

  try {
    const response = await fetch(
      `${CLOUDFLARE_API_BASE}/zones/${settings.zoneId}/dns_records/${recordId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${settings.apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data: CloudflareResponse<{ id: string }> = await response.json();

    if (!data.success) {
      const errorMsg = data.errors?.[0]?.message || "Unknown Cloudflare error";
      console.error("Cloudflare API error:", data.errors);
      return { success: false, error: errorMsg };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete Cloudflare DNS record:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Find a DNS record by name
 */
export async function findDnsRecord(
  subdomain: string
): Promise<{ success: boolean; record?: DnsRecord; error?: string }> {
  const settings = await getCloudflareSettings();

  if (!settings.enabled || !settings.apiToken || !settings.zoneId) {
    return { success: false, error: "Cloudflare is not configured" };
  }

  const fullName = `${subdomain}.${settings.domain}`;

  try {
    const response = await fetch(
      `${CLOUDFLARE_API_BASE}/zones/${settings.zoneId}/dns_records?name=${encodeURIComponent(fullName)}&type=A`,
      {
        headers: {
          Authorization: `Bearer ${settings.apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data: CloudflareResponse<DnsRecord[]> = await response.json();

    if (!data.success) {
      const errorMsg = data.errors?.[0]?.message || "Unknown Cloudflare error";
      return { success: false, error: errorMsg };
    }

    if (data.result.length === 0) {
      return { success: true, record: undefined };
    }

    return { success: true, record: data.result[0] };
  } catch (error: any) {
    console.error("Failed to find Cloudflare DNS record:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a DNS record by subdomain name (finds and deletes)
 */
export async function deleteDnsRecordByName(
  subdomain: string
): Promise<{ success: boolean; error?: string }> {
  const findResult = await findDnsRecord(subdomain);

  if (!findResult.success) {
    return findResult;
  }

  if (!findResult.record) {
    // Record doesn't exist, consider it a success
    return { success: true };
  }

  return deleteDnsRecord(findResult.record.id);
}
