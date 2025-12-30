import { Hono } from "hono";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../lib/db";
import { requireAuth, requireServerAccess } from "../middleware/auth";
import {
  createDnsRecord,
  deleteDnsRecord,
  deleteDnsRecordByName,
  getCloudflareSettings,
  isCloudflareEnabled,
} from "../lib/cloudflare";
import type { Variables } from "../types";

const domains = new Hono<{ Variables: Variables }>();

// Default subdomain base (can be overridden via env)
const SUBDOMAIN_BASE = process.env.SUBDOMAIN_BASE || "stellarstack.io";

// Generate a verification code for domain ownership
const generateVerifyCode = (): string => {
  return `stellarstack-verify-${crypto.randomBytes(16).toString("hex")}`;
};

// Check if a subdomain is valid (alphanumeric, hyphens, 3-32 chars)
const isValidSubdomain = (subdomain: string): boolean => {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(subdomain);
};

// Validation schemas
const claimSubdomainSchema = z.object({
  subdomain: z.string().min(3).max(32).toLowerCase(),
});

const addCustomDomainSchema = z.object({
  domain: z.string().min(4).max(253),
});

// === Subdomain Management ===

// Get server's subdomain
domains.get("/:serverId/subdomain", requireServerAccess, async (c) => {
  const server = c.get("server");

  const subdomain = await db.subdomain.findUnique({
    where: { serverId: server.id },
  });

  if (!subdomain) {
    return c.json({ claimed: false });
  }

  return c.json({
    claimed: true,
    subdomain: subdomain.subdomain,
    fullDomain: `${subdomain.subdomain}.${SUBDOMAIN_BASE}`,
    createdAt: subdomain.createdAt,
  });
});

// Claim a subdomain for a server
domains.post("/:serverId/subdomain", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();
  const parsed = claimSubdomainSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const { subdomain } = parsed.data;

  // Validate subdomain format
  if (!isValidSubdomain(subdomain)) {
    return c.json(
      {
        error:
          "Invalid subdomain. Must be 3-32 characters, alphanumeric with hyphens, cannot start/end with hyphen",
      },
      400
    );
  }

  // Check for reserved subdomains
  const reserved = ["www", "api", "admin", "panel", "dashboard", "mail", "ftp", "sftp", "ssh"];
  if (reserved.includes(subdomain)) {
    return c.json({ error: "This subdomain is reserved" }, 400);
  }

  // Check if server already has a subdomain
  const existing = await db.subdomain.findUnique({
    where: { serverId: server.id },
  });

  if (existing) {
    return c.json({ error: "Server already has a subdomain" }, 400);
  }

  // Check if subdomain is already taken
  const taken = await db.subdomain.findUnique({
    where: { subdomain },
  });

  if (taken) {
    return c.json({ error: "Subdomain is already taken" }, 400);
  }

  // Get the server's primary allocation IP for DNS
  const fullServer = await db.server.findUnique({
    where: { id: server.id },
    include: {
      allocations: true,
      node: true,
    },
  });

  if (!fullServer) {
    return c.json({ error: "Server not found" }, 404);
  }

  // Get target IP - use primary allocation IP or first allocation or node host
  const primaryAllocation =
    fullServer.allocations.find((a) => a.id === fullServer.primaryAllocationId) ||
    fullServer.allocations[0];
  const targetIp = primaryAllocation?.ip || fullServer.node.host;

  // Check if Cloudflare is enabled and create DNS record
  let dnsRecordId: string | null = null;
  const cloudflareEnabled = await isCloudflareEnabled();

  if (cloudflareEnabled) {
    const cloudflareSettings = await getCloudflareSettings();
    const dnsResult = await createDnsRecord(subdomain, targetIp, true);

    if (!dnsResult.success) {
      return c.json(
        {
          error: "Failed to create DNS record",
          details: dnsResult.error,
        },
        500
      );
    }

    dnsRecordId = dnsResult.recordId || null;

    // Use Cloudflare domain as base
    const newSubdomain = await db.subdomain.create({
      data: {
        serverId: server.id,
        subdomain,
        dnsRecordId,
      },
    });

    return c.json(
      {
        success: true,
        subdomain: newSubdomain.subdomain,
        fullDomain: `${newSubdomain.subdomain}.${cloudflareSettings.domain}`,
        dnsConfigured: true,
      },
      201
    );
  }

  // Cloudflare not enabled - just save to database (manual DNS required)
  const newSubdomain = await db.subdomain.create({
    data: {
      serverId: server.id,
      subdomain,
    },
  });

  return c.json(
    {
      success: true,
      subdomain: newSubdomain.subdomain,
      fullDomain: `${newSubdomain.subdomain}.${SUBDOMAIN_BASE}`,
      dnsConfigured: false,
      note: "DNS record not created. Cloudflare integration is not enabled. Configure DNS manually.",
    },
    201
  );
});

// Release a subdomain
domains.delete("/:serverId/subdomain", requireServerAccess, async (c) => {
  const server = c.get("server");

  const subdomain = await db.subdomain.findUnique({
    where: { serverId: server.id },
  });

  if (!subdomain) {
    return c.json({ error: "Server does not have a subdomain" }, 404);
  }

  // Delete DNS record from Cloudflare if we have a record ID
  if (subdomain.dnsRecordId) {
    const deleteResult = await deleteDnsRecord(subdomain.dnsRecordId);
    if (!deleteResult.success) {
      console.error(`Failed to delete Cloudflare DNS record: ${deleteResult.error}`);
      // Continue with deletion anyway - the subdomain may need manual cleanup
    }
  } else {
    // Try to delete by name as fallback
    const cloudflareEnabled = await isCloudflareEnabled();
    if (cloudflareEnabled) {
      const deleteResult = await deleteDnsRecordByName(subdomain.subdomain);
      if (!deleteResult.success) {
        console.error(`Failed to delete Cloudflare DNS record by name: ${deleteResult.error}`);
      }
    }
  }

  await db.subdomain.delete({
    where: { serverId: server.id },
  });

  return c.json({ success: true });
});

// === Custom Domain Management ===

// List custom domains for a server
domains.get("/:serverId/domains", requireServerAccess, async (c) => {
  const server = c.get("server");

  const customDomains = await db.customDomain.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
  });

  return c.json(
    customDomains.map((d) => ({
      id: d.id,
      domain: d.domain,
      verified: d.verified,
      verifyCode: d.verifyCode,
      createdAt: d.createdAt,
    }))
  );
});

// Add a custom domain
domains.post("/:serverId/domains", requireServerAccess, async (c) => {
  const server = c.get("server");
  const body = await c.req.json();
  const parsed = addCustomDomainSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const { domain } = parsed.data;

  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return c.json({ error: "Invalid domain format" }, 400);
  }

  // Check if domain is already registered
  const existing = await db.customDomain.findUnique({
    where: { domain },
  });

  if (existing) {
    return c.json({ error: "Domain is already registered" }, 400);
  }

  // Generate verification code
  const verifyCode = generateVerifyCode();

  // Create the custom domain
  const customDomain = await db.customDomain.create({
    data: {
      serverId: server.id,
      domain,
      verifyCode,
    },
  });

  return c.json(
    {
      success: true,
      id: customDomain.id,
      domain: customDomain.domain,
      verified: false,
      verifyCode: customDomain.verifyCode,
      instructions: {
        type: "TXT",
        name: "_stellarstack",
        value: verifyCode,
        ttl: 300,
        note: `Add a TXT record to your DNS with name "_stellarstack.${domain}" and value "${verifyCode}"`,
      },
    },
    201
  );
});

// Verify domain ownership
domains.post("/:serverId/domains/:domainId/verify", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { domainId } = c.req.param();

  const customDomain = await db.customDomain.findFirst({
    where: {
      id: domainId,
      serverId: server.id,
    },
  });

  if (!customDomain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  if (customDomain.verified) {
    return c.json({ verified: true, message: "Domain is already verified" });
  }

  // Check DNS TXT record
  const dns = await import("dns").then((m) => m.promises);

  try {
    const records = await dns.resolveTxt(`_stellarstack.${customDomain.domain}`);
    const flatRecords = records.flat();

    if (flatRecords.includes(customDomain.verifyCode)) {
      // Verification successful
      await db.customDomain.update({
        where: { id: domainId },
        data: { verified: true },
      });

      // TODO: Add proxy configuration for the domain

      return c.json({
        verified: true,
        message: "Domain verified successfully",
      });
    } else {
      return c.json(
        {
          verified: false,
          message: "Verification code not found in DNS",
          found: flatRecords,
          expected: customDomain.verifyCode,
        },
        400
      );
    }
  } catch (error: any) {
    if (error.code === "ENODATA" || error.code === "ENOTFOUND") {
      return c.json(
        {
          verified: false,
          message:
            "TXT record not found. Make sure you added the DNS record and waited for propagation.",
        },
        400
      );
    }
    return c.json(
      {
        verified: false,
        message: `DNS lookup failed: ${error.message}`,
      },
      500
    );
  }
});

// Remove a custom domain
domains.delete("/:serverId/domains/:domainId", requireServerAccess, async (c) => {
  const server = c.get("server");
  const { domainId } = c.req.param();

  const customDomain = await db.customDomain.findFirst({
    where: {
      id: domainId,
      serverId: server.id,
    },
  });

  if (!customDomain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  await db.customDomain.delete({
    where: { id: domainId },
  });

  // TODO: Remove proxy configuration

  return c.json({ success: true });
});

// === Admin: Get all subdomains/domains ===

// Note: These would typically be admin-only routes for managing the proxy system
// They're not implemented here but would be useful for:
// - Viewing all registered subdomains/domains
// - Manually verifying or removing domains
// - Managing proxy configuration

export { domains };
