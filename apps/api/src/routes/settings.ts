import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAdmin } from "../middleware/auth";
import type { Variables } from "../types";
import type { SmtpConfig, EmailConfig } from "./settings.types";

// Re-export types for backwards compatibility
export type {
  SmtpConfig,
  EmailConfig,
  CloudflareSettings,
  SubdomainSettings,
  BrandingSettings,
} from "./settings.types";

const settings = new Hono<{ Variables: Variables }>();

// Validation schemas
const cloudflareSettingsSchema = z.object({
  apiToken: z.string().optional(),
  zoneId: z.string().optional(),
  domain: z.string().optional(),
  enabled: z.boolean().optional(),
});

const subdomainSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  baseDomain: z.string().optional(),
  autoProvision: z.boolean().optional(),
  dnsProvider: z.enum(["cloudflare", "manual"]).optional(),
});

const emailSettingsSchema = z.object({
  provider: z.enum(["smtp", "resend", "sendgrid", "mailgun"]).optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
  smtp: z
    .object({
      host: z.string(),
      port: z.number(),
      secure: z.boolean(),
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  apiKey: z.string().optional(),
});

const brandingSettingsSchema = z.object({
  appName: z.string().min(1).max(50).optional(),
  logoUrl: z.string().url().optional().nullable(),
  faviconUrl: z.string().url().optional().nullable(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  supportEmail: z.string().email().optional(),
  supportUrl: z.string().url().optional().nullable(),
  termsUrl: z.string().url().optional().nullable(),
  privacyUrl: z.string().url().optional().nullable(),
  footerText: z.string().max(200).optional(),
  customCss: z.string().max(10000).optional(),
});

// Helper to get a setting
const getSetting = async <T>(key: string, defaultValue: T): Promise<T> => {
  const setting = await db.settings.findUnique({
    where: { key },
  });
  return (setting?.value as T) ?? defaultValue;
};

// Helper to set a setting
const setSetting = async <T>(key: string, value: T): Promise<void> => {
  await db.settings.upsert({
    where: { key },
    create: { id: key, key, value: value as any },
    update: { value: value as any },
  });
};

// === Cloudflare Settings ===

// Get Cloudflare settings
settings.get("/cloudflare", requireAdmin, async (c) => {
  const cloudflare = await getSetting("cloudflare", {
    apiToken: "",
    zoneId: "",
    domain: "",
    enabled: false,
  });

  // Mask API token for security
  return c.json({
    ...cloudflare,
    apiToken: cloudflare.apiToken ? "********" : "",
    hasApiToken: !!cloudflare.apiToken,
  });
});

// Update Cloudflare settings
settings.patch("/cloudflare", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = cloudflareSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const current = await getSetting("cloudflare", {
    apiToken: "",
    zoneId: "",
    domain: "",
    enabled: false,
  });

  const updated = {
    ...current,
    ...parsed.data,
    // Don't overwrite API token if masked value is sent
    apiToken:
      parsed.data.apiToken === "********"
        ? current.apiToken
        : (parsed.data.apiToken ?? current.apiToken),
  };

  await setSetting("cloudflare", updated);

  return c.json({
    ...updated,
    apiToken: updated.apiToken ? "********" : "",
    hasApiToken: !!updated.apiToken,
  });
});

// Test Cloudflare connection
settings.post("/cloudflare/test", requireAdmin, async (c) => {
  const cloudflare = await getSetting("cloudflare", {
    apiToken: "",
    zoneId: "",
    domain: "",
    enabled: false,
  });

  if (!cloudflare.apiToken) {
    return c.json({ success: false, error: "No API token configured" }, 400);
  }

  try {
    // Test API token by fetching zone details
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cloudflare.zoneId}`,
      {
        headers: {
          Authorization: `Bearer ${cloudflare.apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = (await response.json()) as any;

    if (!data.success) {
      return c.json({
        success: false,
        error: data.errors?.[0]?.message || "Failed to connect to Cloudflare",
      });
    }

    return c.json({
      success: true,
      zone: {
        id: data.result.id,
        name: data.result.name,
        status: data.result.status,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message });
  }
});

// === Subdomain Settings ===

// Get subdomain settings
settings.get("/subdomains", requireAdmin, async (c) => {
  const subdomains = await getSetting("subdomains", {
    enabled: false,
    baseDomain: "",
    autoProvision: false,
    dnsProvider: "manual" as const,
  });

  return c.json(subdomains);
});

// Update subdomain settings
settings.patch("/subdomains", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = subdomainSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const current = await getSetting("subdomains", {
    enabled: false,
    baseDomain: "",
    autoProvision: false,
    dnsProvider: "manual" as const,
  });

  const updated = { ...current, ...parsed.data };
  await setSetting("subdomains", updated);

  return c.json(updated);
});

// === Email Settings ===

// Get email settings
settings.get("/email", requireAdmin, async (c) => {
  const email = await getSetting<EmailConfig>("email", {
    provider: "smtp",
    fromEmail: "",
    fromName: "StellarStack",
    smtp: null,
    apiKey: "",
  });

  // Mask sensitive data
  return c.json({
    ...email,
    smtp: email.smtp
      ? {
          ...email.smtp,
          password: email.smtp.password ? "********" : "",
        }
      : null,
    apiKey: email.apiKey ? "********" : "",
    hasApiKey: !!email.apiKey,
  });
});

// Update email settings
settings.patch("/email", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = emailSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const current = await getSetting("email", {
    provider: "smtp" as const,
    fromEmail: "",
    fromName: "StellarStack",
    smtp: null as any,
    apiKey: "",
  });

  const updated = {
    ...current,
    ...parsed.data,
    // Don't overwrite secrets if masked value is sent
    apiKey:
      parsed.data.apiKey === "********" ? current.apiKey : (parsed.data.apiKey ?? current.apiKey),
    smtp: parsed.data.smtp
      ? {
          ...parsed.data.smtp,
          password:
            parsed.data.smtp.password === "********"
              ? (current.smtp?.password ?? "")
              : parsed.data.smtp.password,
        }
      : current.smtp,
  };

  await setSetting("email", updated);

  return c.json({
    ...updated,
    smtp: updated.smtp
      ? {
          ...updated.smtp,
          password: updated.smtp.password ? "********" : "",
        }
      : null,
    apiKey: updated.apiKey ? "********" : "",
    hasApiKey: !!updated.apiKey,
  });
});

// Test email configuration
settings.post("/email/test", requireAdmin, async (c) => {
  const { testEmail } = await c.req.json();

  if (!testEmail) {
    return c.json({ success: false, error: "Test email address required" }, 400);
  }

  try {
    const { sendEmail } = await import("../lib/email");
    await sendEmail({
      to: testEmail,
      subject: "StellarStack Test Email",
      html: "<h1>Test Email</h1><p>This is a test email from StellarStack. If you received this, your email configuration is working correctly.</p>",
      text: "Test Email\n\nThis is a test email from StellarStack. If you received this, your email configuration is working correctly.",
    });

    return c.json({ success: true, message: "Test email sent successfully" });
  } catch (error: any) {
    return c.json({ success: false, error: error.message });
  }
});

// === Branding Settings ===

// Get branding settings
settings.get("/branding", requireAdmin, async (c) => {
  const branding = await getSetting("branding", {
    appName: "StellarStack",
    logoUrl: null,
    faviconUrl: null,
    primaryColor: "#22c55e",
    supportEmail: "",
    supportUrl: null,
    termsUrl: null,
    privacyUrl: null,
    footerText: "",
    customCss: "",
  });

  return c.json(branding);
});

// Update branding settings
settings.patch("/branding", requireAdmin, async (c) => {
  const body = await c.req.json();
  const parsed = brandingSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.errors }, 400);
  }

  const current = await getSetting("branding", {
    appName: "StellarStack",
    logoUrl: null,
    faviconUrl: null,
    primaryColor: "#22c55e",
    supportEmail: "",
    supportUrl: null,
    termsUrl: null,
    privacyUrl: null,
    footerText: "",
    customCss: "",
  });

  const updated = { ...current, ...parsed.data };
  await setSetting("branding", updated);

  return c.json(updated);
});

// Public branding endpoint (no auth required for frontend to use)
settings.get("/branding/public", async (c) => {
  const branding = await getSetting("branding", {
    appName: "StellarStack",
    logoUrl: null,
    faviconUrl: null,
    primaryColor: "#22c55e",
    supportEmail: "",
    supportUrl: null,
    termsUrl: null,
    privacyUrl: null,
    footerText: "",
  });

  // Return only public-safe branding info (exclude customCss for security)
  return c.json({
    appName: branding.appName,
    logoUrl: branding.logoUrl,
    faviconUrl: branding.faviconUrl,
    primaryColor: branding.primaryColor,
    supportEmail: branding.supportEmail,
    supportUrl: branding.supportUrl,
    termsUrl: branding.termsUrl,
    privacyUrl: branding.privacyUrl,
    footerText: branding.footerText,
  });
});

// === General Settings ===

// Get all settings (overview)
settings.get("/", requireAdmin, async (c) => {
  const [cloudflare, subdomains, email, branding] = await Promise.all([
    getSetting("cloudflare", { enabled: false, domain: "" }),
    getSetting("subdomains", { enabled: false, baseDomain: "" }),
    getSetting("email", { provider: "smtp", fromEmail: "" }),
    getSetting("branding", { appName: "StellarStack" }),
  ]);

  return c.json({
    cloudflare: {
      enabled: cloudflare.enabled,
      domain: cloudflare.domain,
    },
    subdomains: {
      enabled: subdomains.enabled,
      baseDomain: subdomains.baseDomain,
    },
    email: {
      provider: email.provider,
      configured: !!email.fromEmail,
    },
    branding: {
      appName: branding.appName,
    },
  });
});

export { settings };
