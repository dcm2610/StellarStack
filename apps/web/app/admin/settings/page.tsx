"use client";

import { useEffect, useState } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FadeIn } from "@workspace/ui/components/fade-in";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import {
  CloudIcon,
  GlobeIcon,
  MailIcon,
  CheckCircle2Icon,
  XCircleIcon,
  Loader2Icon,
  SaveIcon,
  TestTube2Icon,
  ArrowLeftIcon,
  PaletteIcon,
} from "lucide-react";
import Link from "next/link";
import { adminSettings, type CloudflareSettings, type SubdomainSettings, type EmailSettings, type BrandingSettings } from "@/lib/api";
import { toast } from "sonner";

const InputField = ({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
  helperText,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
}) => {
  return (
    <div>
      <label className={cn("block text-xs uppercase tracking-wider mb-2 text-zinc-400")}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-2 text-sm border focus:outline-none transition-colors disabled:opacity-50 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-zinc-500",
        )}
      />
      {helperText && (
        <p className={cn("text-xs mt-1 text-zinc-500")}>{helperText}</p>
      )}
    </div>
  );
};

const Toggle = ({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) => {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        className={cn(
          "relative w-10 h-5 rounded-full transition-colors",
          checked
            ? "bg-green-600"
            : "bg-zinc-700",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => !disabled && onChange(!checked)}
      >
        <div
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full transition-transform bg-white",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </div>
      <span className={cn("text-sm text-zinc-300")}>{label}</span>
    </label>
  );
};

const Select = ({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) => {
  return (
    <div>
      <label className={cn("block text-xs uppercase tracking-wider mb-2 text-zinc-400")}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-2 text-sm border focus:outline-none transition-colors disabled:opacity-50 bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500",
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

const SettingsSection = ({
  title,
  description,
  icon: Icon,
  children,
  onSave,
  onTest,
  isSaving,
  isTesting,
  testResult,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onSave: () => void;
  onTest?: () => void;
  isSaving: boolean;
  isTesting?: boolean;
  testResult?: { success: boolean; message?: string } | null;
}) => {
  return (
    <div
      className={cn(
        "relative p-6 border bg-zinc-900/50 border-zinc-700/50",
      )}
    >
      {/* Corner accents */}
      <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l border-zinc-700")} />
      <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r border-zinc-700")} />
      <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l border-zinc-700")} />
      <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r border-zinc-700")} />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Icon className={cn("w-5 h-5 text-zinc-400")} />
        <div>
          <h2 className={cn("font-medium text-zinc-100")}>{title}</h2>
          <p className={cn("text-xs text-zinc-500")}>{description}</p>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 mb-6">{children}</div>

      {/* Test Result */}
      {testResult && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 mb-4 border text-sm",
            testResult.success
              ? "border-green-700/50 bg-green-900/20 text-green-400"
              : "border-red-700/50 bg-red-900/20 text-red-400"
          )}
        >
          {testResult.success ? (
            <CheckCircle2Icon className="w-4 h-4" />
          ) : (
            <XCircleIcon className="w-4 h-4" />
          )}
          {testResult.message || (testResult.success ? "Test successful" : "Test failed")}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={isSaving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-50 bg-zinc-800 border border-zinc-600 text-zinc-100 hover:bg-zinc-700",
          )}
        >
          {isSaving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <SaveIcon className="w-4 h-4" />}
          Save
        </button>
        {onTest && (
          <button
            onClick={onTest}
            disabled={isTesting}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-50 bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800",
            )}
          >
            {isTesting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <TestTube2Icon className="w-4 h-4" />}
            Test Connection
          </button>
        )}
      </div>
    </div>
  );
};

export default function AdminSettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Cloudflare state
  const [cloudflare, setCloudflare] = useState<CloudflareSettings>({
    apiToken: "",
    zoneId: "",
    domain: "",
    enabled: false,
  });
  const [savingCloudflare, setSavingCloudflare] = useState(false);
  const [testingCloudflare, setTestingCloudflare] = useState(false);
  const [cloudflareTestResult, setCloudflareTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Subdomain state
  const [subdomains, setSubdomains] = useState<SubdomainSettings>({
    enabled: false,
    baseDomain: "",
    autoProvision: false,
    dnsProvider: "manual",
  });
  const [savingSubdomains, setSavingSubdomains] = useState(false);

  // Email state
  const [email, setEmail] = useState<EmailSettings>({
    provider: "smtp",
    fromEmail: "",
    fromName: "StellarStack",
    smtp: {
      host: "",
      port: 587,
      secure: false,
      username: "",
      password: "",
    },
    apiKey: "",
  });
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Branding state
  const [branding, setBranding] = useState<BrandingSettings>({
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
  const [savingBranding, setSavingBranding] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const [cf, sub, em, br] = await Promise.all([
          adminSettings.cloudflare.get(),
          adminSettings.subdomains.get(),
          adminSettings.email.get(),
          adminSettings.branding.get(),
        ]);

        setCloudflare(cf);
        setSubdomains(sub);
        setEmail({
          ...em,
          smtp: em.smtp || { host: "", port: 587, secure: false, username: "", password: "" },
        });
        setBranding(br);
      } catch (error) {
        console.error("Failed to fetch settings:", error);
        toast.error("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleSaveCloudflare = async () => {
    setSavingCloudflare(true);
    try {
      const updated = await adminSettings.cloudflare.update(cloudflare);
      setCloudflare(updated);
      toast.success("Cloudflare settings saved");
    } catch (error) {
      toast.error("Failed to save Cloudflare settings");
    } finally {
      setSavingCloudflare(false);
    }
  };

  const handleTestCloudflare = async () => {
    setTestingCloudflare(true);
    setCloudflareTestResult(null);
    try {
      const result = await adminSettings.cloudflare.test();
      setCloudflareTestResult({
        success: result.success,
        message: result.success
          ? `Connected to zone: ${result.zone?.name} (${result.zone?.status})`
          : result.error,
      });
    } catch (error: any) {
      setCloudflareTestResult({ success: false, message: error.message });
    } finally {
      setTestingCloudflare(false);
    }
  };

  const handleSaveSubdomains = async () => {
    setSavingSubdomains(true);
    try {
      const updated = await adminSettings.subdomains.update(subdomains);
      setSubdomains(updated);
      toast.success("Subdomain settings saved");
    } catch (error) {
      toast.error("Failed to save subdomain settings");
    } finally {
      setSavingSubdomains(false);
    }
  };

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    try {
      const updated = await adminSettings.email.update(email);
      setEmail({
        ...updated,
        smtp: updated.smtp || { host: "", port: 587, secure: false, username: "", password: "" },
      });
      toast.success("Email settings saved");
    } catch (error) {
      toast.error("Failed to save email settings");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmailAddress) {
      toast.error("Please enter a test email address");
      return;
    }
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const result = await adminSettings.email.test(testEmailAddress);
      setEmailTestResult({
        success: result.success,
        message: result.success ? result.message : result.error,
      });
    } catch (error: any) {
      setEmailTestResult({ success: false, message: error.message });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    try {
      const updated = await adminSettings.branding.update(branding);
      setBranding(updated);
      toast.success("Branding settings saved");
    } catch (error) {
      toast.error("Failed to save branding settings");
    } finally {
      setSavingBranding(false);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("min-h-svh flex items-center justify-center bg-[#0b0b0a]")}>
        <Loader2Icon className={cn("w-8 h-8 animate-spin text-zinc-400")} />
      </div>
    );
  }

  return (
    <div className={cn("min-h-svh transition-colors relative bg-[#0b0b0a]")}>
      <AnimatedBackground />
      <FloatingDots count={15} />

      <div className="relative p-8">
        <div className="max-w-4xl mx-auto">
          <FadeIn delay={0}>
            {/* Header */}
            <div className="mb-8">
              <Link
                href="/admin"
                className={cn(
                  "inline-flex items-center gap-2 text-xs uppercase tracking-wider mb-4 hover:opacity-70 transition-opacity text-zinc-500",
                )}
              >
                <ArrowLeftIcon className="w-4 h-4" />
                Back to Dashboard
              </Link>
              <h1 className={cn("text-2xl font-light tracking-wider text-zinc-100")}>
                SETTINGS
              </h1>
              <p className={cn("text-sm mt-1 text-zinc-500")}>
                Configure system-wide settings
              </p>
            </div>
          </FadeIn>

          {/* Settings Sections */}
          <div className="space-y-6">
            <FadeIn delay={0.1}>
              <SettingsSection
                title="Cloudflare"
                description="Configure Cloudflare API for DNS management"
                icon={CloudIcon}
                onSave={handleSaveCloudflare}
                onTest={handleTestCloudflare}
                isSaving={savingCloudflare}
                isTesting={testingCloudflare}
                testResult={cloudflareTestResult}
              >
                <Toggle
                  label="Enable Cloudflare Integration"
                  checked={cloudflare.enabled}
                  onChange={(v) => setCloudflare({ ...cloudflare, enabled: v })}
                />
                <InputField
                  label="API Token"
                  type="password"
                  value={cloudflare.apiToken}
                  onChange={(v) => setCloudflare({ ...cloudflare, apiToken: v })}
                  placeholder="Enter Cloudflare API token"
                  helperText="Create a token with Zone:Read and DNS:Edit permissions"
                />
                <InputField
                  label="Zone ID"
                  value={cloudflare.zoneId}
                  onChange={(v) => setCloudflare({ ...cloudflare, zoneId: v })}
                  placeholder="Enter zone ID"
                />
                <InputField
                  label="Domain"
                  value={cloudflare.domain}
                  onChange={(v) => setCloudflare({ ...cloudflare, domain: v })}
                  placeholder="example.com"
                />
              </SettingsSection>
            </FadeIn>

            <FadeIn delay={0.2}>
              <SettingsSection
                title="Subdomains"
                description="Configure automatic subdomain provisioning for servers"
                icon={GlobeIcon}
                onSave={handleSaveSubdomains}
                isSaving={savingSubdomains}
              >
                <Toggle
                  label="Enable Subdomains"
                  checked={subdomains.enabled}
                  onChange={(v) => setSubdomains({ ...subdomains, enabled: v })}
                />
                <InputField
                  label="Base Domain"
                  value={subdomains.baseDomain}
                  onChange={(v) => setSubdomains({ ...subdomains, baseDomain: v })}
                  placeholder="servers.example.com"
                  helperText="Subdomains will be created under this domain (e.g., myserver.servers.example.com)"
                />
                <Select
                  label="DNS Provider"
                  value={subdomains.dnsProvider}
                  onChange={(v) => setSubdomains({ ...subdomains, dnsProvider: v as "cloudflare" | "manual" })}
                  options={[
                    { value: "manual", label: "Manual DNS" },
                    { value: "cloudflare", label: "Cloudflare (automatic)" },
                  ]}
                />
                {subdomains.dnsProvider === "cloudflare" && (
                  <Toggle
                    label="Auto-provision DNS records"
                    checked={subdomains.autoProvision}
                    onChange={(v) => setSubdomains({ ...subdomains, autoProvision: v })}                  
                  />
                )}
              </SettingsSection>
            </FadeIn>

            <FadeIn delay={0.3}>
              <SettingsSection
                title="Email"
                description="Configure email settings for notifications and invitations"
                icon={MailIcon}
                onSave={handleSaveEmail}
                onTest={handleTestEmail}
                isSaving={savingEmail}
                isTesting={testingEmail}
                testResult={emailTestResult}
              >
                <Select
                  label="Email Provider"
                  value={email.provider}
                  onChange={(v) => setEmail({ ...email, provider: v as EmailSettings["provider"] })}
                  options={[
                    { value: "smtp", label: "SMTP" },
                    { value: "resend", label: "Resend" },
                    { value: "sendgrid", label: "SendGrid" },
                    { value: "mailgun", label: "Mailgun" },
                  ]}
                />
                <InputField
                  label="From Email"
                  type="email"
                  value={email.fromEmail}
                  onChange={(v) => setEmail({ ...email, fromEmail: v })}
                  placeholder="noreply@example.com"
                />
                <InputField
                  label="From Name"
                  value={email.fromName}
                  onChange={(v) => setEmail({ ...email, fromName: v })}
                  placeholder="StellarStack"
                />

                {email.provider === "smtp" && (
                  <>
                    <InputField
                      label="SMTP Host"
                      value={email.smtp?.host || ""}
                      onChange={(v) => setEmail({ ...email, smtp: { ...email.smtp!, host: v } })}
                      placeholder="smtp.example.com"
                    />
                    <InputField
                      label="SMTP Port"
                      type="number"
                      value={String(email.smtp?.port || 587)}
                      onChange={(v) => setEmail({ ...email, smtp: { ...email.smtp!, port: parseInt(v) || 587 } })}
                      placeholder="587"
                    />
                    <Toggle
                      label="Use TLS/SSL"
                      checked={email.smtp?.secure || false}
                      onChange={(v) => setEmail({ ...email, smtp: { ...email.smtp!, secure: v } })}
                    />
                    <InputField
                      label="SMTP Username"
                      value={email.smtp?.username || ""}
                      onChange={(v) => setEmail({ ...email, smtp: { ...email.smtp!, username: v } })}
                      placeholder="username"
                    />
                    <InputField
                      label="SMTP Password"
                      type="password"
                      value={email.smtp?.password || ""}
                      onChange={(v) => setEmail({ ...email, smtp: { ...email.smtp!, password: v } })}
                      placeholder="••••••••"
                    />
                  </>
                )}

                {email.provider !== "smtp" && (
                  <InputField
                    label="API Key"
                    type="password"
                    value={email.apiKey || ""}
                    onChange={(v) => setEmail({ ...email, apiKey: v })}
                    placeholder="Enter API key"
                  />
                )}

                <InputField
                  label="Test Email Address"
                  type="email"
                  value={testEmailAddress}
                  onChange={setTestEmailAddress}
                  placeholder="test@example.com"
                  helperText="Enter an email address to send a test email"
                />
              </SettingsSection>
            </FadeIn>

            <FadeIn delay={0.4}>
              <SettingsSection
                title="Branding"
                description="Customize the appearance and branding of your panel"
                icon={PaletteIcon}
                onSave={handleSaveBranding}
                isSaving={savingBranding}
              >
                <InputField
                  label="Application Name"
                  value={branding.appName}
                  onChange={(v) => setBranding({ ...branding, appName: v })}
                  placeholder="StellarStack"
                  helperText="The name displayed throughout the application"
                />
                <InputField
                  label="Logo URL"
                  value={branding.logoUrl || ""}
                  onChange={(v) => setBranding({ ...branding, logoUrl: v || null })}
                  placeholder="https://example.com/logo.png"
                  helperText="URL to your logo image (recommended: 200x50px)"
                />
                <InputField
                  label="Favicon URL"
                  value={branding.faviconUrl || ""}
                  onChange={(v) => setBranding({ ...branding, faviconUrl: v || null })}
                  placeholder="https://example.com/favicon.ico"
                  helperText="URL to your favicon"
                />
                <div>
                  <label className={cn("block text-xs uppercase tracking-wider mb-2 text-zinc-400")}>
                    Primary Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                      className="w-10 h-10 border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                      placeholder="#22c55e"
                      className={cn(
                        "flex-1 px-4 py-2 text-sm border focus:outline-none transition-colors bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500",
                      )}
                    />
                  </div>
                </div>
                <InputField
                  label="Support Email"
                  type="email"
                  value={branding.supportEmail}
                  onChange={(v) => setBranding({ ...branding, supportEmail: v })}
                  placeholder="support@example.com"
                />
                <InputField
                  label="Support URL"
                  value={branding.supportUrl || ""}
                  onChange={(v) => setBranding({ ...branding, supportUrl: v || null })}
                  placeholder="https://support.example.com"
                />
                <InputField
                  label="Terms of Service URL"
                  value={branding.termsUrl || ""}
                  onChange={(v) => setBranding({ ...branding, termsUrl: v || null })}
                  placeholder="https://example.com/terms"
                />
                <InputField
                  label="Privacy Policy URL"
                  value={branding.privacyUrl || ""}
                  onChange={(v) => setBranding({ ...branding, privacyUrl: v || null })}
                  placeholder="https://example.com/privacy"
                />
                <InputField
                  label="Footer Text"
                  value={branding.footerText}
                  onChange={(v) => setBranding({ ...branding, footerText: v })}
                  placeholder="Powered by StellarStack"
                />
                <div>
                  <label className={cn("block text-xs uppercase tracking-wider mb-2 text-zinc-400")}>
                    Custom CSS
                  </label>
                  <textarea
                    value={branding.customCss}
                    onChange={(e) => setBranding({ ...branding, customCss: e.target.value })}
                    placeholder="/* Custom CSS styles */"
                    rows={6}
                    className={cn(
                      "w-full px-4 py-2 text-sm font-mono border focus:outline-none transition-colors resize-y bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-zinc-500",
                    )}
                  />
                  <p className={cn("text-xs mt-1 text-zinc-500")}>
                    Advanced: Add custom CSS to override default styles (admins only)
                  </p>
                </div>
              </SettingsSection>
            </FadeIn>
          </div>
        </div>
      </div>
    </div>
  );
}
