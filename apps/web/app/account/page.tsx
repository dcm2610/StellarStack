"use client";

import { useState, useEffect, type JSX } from "react";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import { Switch } from "@workspace/ui/components/switch";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import { Input } from "@workspace/ui/components/input";
import {
  BsSun,
  BsMoon,
  BsKey,
  BsShieldCheck,
  BsTrash,
  BsPlus,
  BsCheckCircle,
  BsGoogle,
  BsGithub,
  BsDiscord,
} from "react-icons/bs";
import { authClient, useSession } from "@/lib/auth-client";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";

interface Passkey {
  id: string;
  name: string | null;
  createdAt: Date;
  credentialId: string;
}

const AccountPage = (): JSX.Element | null => {
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionLoading } = useSession();

  const [profile, setProfile] = useState({ name: "", email: "" });
  const [originalProfile, setOriginalProfile] = useState({ name: "", email: "" });
  const [saved, setSaved] = useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [passwordForAction, setPasswordForAction] = useState("");

  // Passkey state
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [addPasskeyModalOpen, setAddPasskeyModalOpen] = useState(false);
  const [deletePasskeyModalOpen, setDeletePasskeyModalOpen] = useState(false);
  const [selectedPasskey, setSelectedPasskey] = useState<Passkey | null>(null);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [disableTwoFactorModalOpen, setDisableTwoFactorModalOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (session?.user) {
      const userData = {
        name: session.user.name || "",
        email: session.user.email || "",
      };
      setProfile(userData);
      setOriginalProfile(userData);
      setTwoFactorEnabled((session.user as any).twoFactorEnabled || false);
    }
  }, [session]);

  // Fetch passkeys
  const { data: passkeyData } = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const response = await authClient.passkey.listUserPasskeys();
      return response.data || [];
    },
    enabled: !!session,
  });

  useEffect(() => {
    if (passkeyData) {
      setPasskeys(passkeyData as unknown as Passkey[]);
    }
  }, [passkeyData]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted || sessionLoading) return null;

  const hasProfileChanges = JSON.stringify(profile) !== JSON.stringify(originalProfile);

  const handleSaveProfile = async () => {
    try {
      await authClient.updateUser({ name: profile.name });
      setOriginalProfile({ ...profile });
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["session"] });
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      toast.error("Failed to update profile");
    }
  };

  // 2FA functions
  const handleEnableTwoFactor = async () => {
    if (!passwordForAction) {
      toast.error("Please enter your password");
      return;
    }
    try {
      const response = await authClient.twoFactor.enable({
        password: passwordForAction,
      });
      if (response.data?.totpURI) {
        setTotpUri(response.data.totpURI);
        const qr = await QRCode.toDataURL(response.data.totpURI);
        setTotpQrCode(qr);
        if (response.data.backupCodes) {
          setBackupCodes(response.data.backupCodes);
        }
        setShowTotpSetup(true);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to enable 2FA");
    }
  };

  const handleVerifyTotp = async () => {
    try {
      const response = await authClient.twoFactor.verifyTotp({
        code: verifyCode,
      });
      if (response.data) {
        setTwoFactorEnabled(true);
        setShowTotpSetup(false);
        setShowBackupCodes(true);
        setVerifyCode("");
        setPasswordForAction("");
        queryClient.invalidateQueries({ queryKey: ["session"] });
        toast.success("Two-factor authentication enabled");
      }
    } catch (error: any) {
      toast.error(error?.message || "Invalid verification code");
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!passwordForAction) {
      toast.error("Please enter your password");
      return;
    }
    try {
      await authClient.twoFactor.disable({
        password: passwordForAction,
      });
      setTwoFactorEnabled(false);
      setDisableTwoFactorModalOpen(false);
      setPasswordForAction("");
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Two-factor authentication disabled");
    } catch (error: any) {
      toast.error(error?.message || "Failed to disable 2FA");
    }
  };

  // Passkey functions
  const handleAddPasskey = async () => {
    try {
      const response = await authClient.passkey.addPasskey({
        name: newPasskeyName,
      });
      if (response.data) {
        queryClient.invalidateQueries({ queryKey: ["passkeys"] });
        setAddPasskeyModalOpen(false);
        setNewPasskeyName("");
        toast.success("Passkey added successfully");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to add passkey");
    }
  };

  const handleDeletePasskey = async () => {
    if (!selectedPasskey) return;
    try {
      await authClient.passkey.deletePasskey({
        id: selectedPasskey.id,
      });
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      setDeletePasskeyModalOpen(false);
      setSelectedPasskey(null);
      toast.success("Passkey deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete passkey");
    }
  };

  const openDeletePasskeyModal = (passkey: Passkey) => {
    setSelectedPasskey(passkey);
    setDeletePasskeyModalOpen(true);
  };

  // Social login functions
  const handleSocialSignIn = async (provider: "google" | "github" | "discord") => {
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: window.location.href,
      });
    } catch (error: any) {
      toast.error(error?.message || `Failed to connect ${provider}`);
    }
  };

  return (
    <div
      className={cn(
        "relative min-h-svh transition-colors",
        isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
      )}
    >
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                className={cn(
                  "transition-all hover:scale-110 active:scale-95",
                  isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                )}
              />
              <div>
                <h1
                  className={cn(
                    "text-2xl font-light tracking-wider",
                    isDark ? "text-zinc-100" : "text-zinc-800"
                  )}
                >
                  ACCOUNT SETTINGS
                </h1>
                <p className={cn("mt-1 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  Manage your account and security
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cn(
                "p-2 transition-all hover:scale-110 active:scale-95",
                isDark
                  ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
              )}
            >
              {isDark ? <BsSun className="h-4 w-4" /> : <BsMoon className="h-4 w-4" />}
            </Button>
          </div>

          {/* Profile Section */}
          <div
            className={cn(
              "relative mb-6 border p-6",
              isDark
                ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-2 w-2 border-t border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-2 w-2 border-t border-r",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />

            <h2
              className={cn(
                "mb-6 text-sm font-medium tracking-wider uppercase",
                isDark ? "text-zinc-300" : "text-zinc-700"
              )}
            >
              Profile
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  className={cn(
                    "text-[10px] font-medium tracking-wider uppercase",
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  )}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                  className={cn(
                    "mt-2 w-full border px-3 py-2 text-sm transition-colors outline-none",
                    isDark
                      ? "border-zinc-700/50 bg-zinc-900/50 text-zinc-200 focus:border-zinc-500"
                      : "border-zinc-300 bg-white text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label
                  className={cn(
                    "text-[10px] font-medium tracking-wider uppercase",
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  )}
                >
                  Email Address
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className={cn(
                    "mt-2 w-full border px-3 py-2 text-sm opacity-50 transition-colors outline-none",
                    isDark
                      ? "border-zinc-700/50 bg-zinc-900/50 text-zinc-200"
                      : "border-zinc-300 bg-white text-zinc-800"
                  )}
                />
                <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  Email changes are not yet supported
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveProfile}
              disabled={!hasProfileChanges}
              className={cn(
                "mt-6 gap-2 transition-all",
                saved
                  ? isDark
                    ? "border-green-500/50 text-green-400"
                    : "border-green-400 text-green-600"
                  : isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-40"
              )}
            >
              {saved ? (
                <>
                  <BsCheckCircle className="h-4 w-4" />
                  <span className="text-xs tracking-wider uppercase">Saved</span>
                </>
              ) : (
                <span className="text-xs tracking-wider uppercase">Update Profile</span>
              )}
            </Button>
          </div>

          {/* Connected Accounts Section */}
          <div
            className={cn(
              "relative mb-6 border p-6",
              isDark
                ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-2 w-2 border-t border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-2 w-2 border-t border-r",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />

            <h2
              className={cn(
                "mb-6 text-sm font-medium tracking-wider uppercase",
                isDark ? "text-zinc-300" : "text-zinc-700"
              )}
            >
              Connected Accounts
            </h2>

            <p className={cn("mb-4 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
              Connect your social accounts for quick sign-in.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSocialSignIn("google")}
                className={cn(
                  "gap-2 transition-all",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                <BsGoogle className="h-4 w-4" />
                <span className="text-xs tracking-wider uppercase">Google</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSocialSignIn("github")}
                className={cn(
                  "gap-2 transition-all",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                <BsGithub className="h-4 w-4" />
                <span className="text-xs tracking-wider uppercase">GitHub</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSocialSignIn("discord")}
                className={cn(
                  "gap-2 transition-all",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                <BsDiscord className="h-4 w-4" />
                <span className="text-xs tracking-wider uppercase">Discord</span>
              </Button>
            </div>
          </div>

          {/* Passkeys Section */}
          <div
            className={cn(
              "relative mb-6 border p-6",
              isDark
                ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-2 w-2 border-t border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-2 w-2 border-t border-r",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />

            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BsKey className={cn("h-4 w-4", isDark ? "text-zinc-400" : "text-zinc-600")} />
                <h2
                  className={cn(
                    "text-sm font-medium tracking-wider uppercase",
                    isDark ? "text-zinc-300" : "text-zinc-700"
                  )}
                >
                  Passkeys
                </h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddPasskeyModalOpen(true)}
                className={cn(
                  "gap-2 transition-all",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                <BsPlus className="h-4 w-4" />
                <span className="text-xs tracking-wider uppercase">Add Passkey</span>
              </Button>
            </div>

            <p className={cn("mb-4 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
              Passkeys provide a more secure and convenient way to sign in without passwords.
            </p>

            <div className="space-y-3">
              {passkeys.length === 0 ? (
                <p className={cn("text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  No passkeys registered yet.
                </p>
              ) : (
                passkeys.map((passkey) => (
                  <div
                    key={passkey.id}
                    className={cn(
                      "flex items-center justify-between border p-4",
                      isDark ? "border-zinc-700/50 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50"
                    )}
                  >
                    <div>
                      <div
                        className={cn(
                          "text-sm font-medium",
                          isDark ? "text-zinc-200" : "text-zinc-700"
                        )}
                      >
                        {passkey.name || "Unnamed Passkey"}
                      </div>
                      <div
                        className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}
                      >
                        Added {new Date(passkey.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeletePasskeyModal(passkey)}
                      className={cn(
                        "p-2 transition-all",
                        isDark
                          ? "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
                          : "border-red-300 text-red-600 hover:border-red-400 hover:text-red-700"
                      )}
                    >
                      <BsTrash className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Two-Factor Authentication Section */}
          <div
            className={cn(
              "relative border p-6",
              isDark
                ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-2 w-2 border-t border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-2 w-2 border-t border-r",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />

            <div className="mb-6 flex items-center gap-2">
              <BsShieldCheck
                className={cn("h-4 w-4", isDark ? "text-zinc-400" : "text-zinc-600")}
              />
              <h2
                className={cn(
                  "text-sm font-medium tracking-wider uppercase",
                  isDark ? "text-zinc-300" : "text-zinc-700"
                )}
              >
                Two-Factor Authentication
              </h2>
            </div>

            <p className={cn("mb-4 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
              Add an extra layer of security to your account by requiring a second form of
              verification.
            </p>

            {!showTotpSetup ? (
              <div
                className={cn(
                  "flex items-center justify-between border p-4",
                  isDark ? "border-zinc-700/50 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50"
                )}
              >
                <div>
                  <div
                    className={cn(
                      "text-sm font-medium",
                      isDark ? "text-zinc-200" : "text-zinc-700"
                    )}
                  >
                    Authenticator App
                  </div>
                  <div className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                    {twoFactorEnabled
                      ? "Two-factor authentication is enabled"
                      : "Use an app like Google Authenticator or Authy"}
                  </div>
                </div>
                {twoFactorEnabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDisableTwoFactorModalOpen(true)}
                    className={cn(
                      "transition-all",
                      isDark
                        ? "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
                        : "border-red-300 text-red-600 hover:border-red-400 hover:text-red-700"
                    )}
                  >
                    <span className="text-xs tracking-wider uppercase">Disable</span>
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      placeholder="Password"
                      value={passwordForAction}
                      onChange={(e) => setPasswordForAction(e.target.value)}
                      className={cn(
                        "h-8 w-40 text-sm",
                        isDark
                          ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                          : "border-zinc-300 bg-white text-zinc-900"
                      )}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEnableTwoFactor}
                      disabled={!passwordForAction}
                      className={cn(
                        "transition-all",
                        isDark
                          ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                          : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                      )}
                    >
                      <span className="text-xs tracking-wider uppercase">Enable</span>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className={cn(
                    "border p-4",
                    isDark ? "border-zinc-700/50 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50"
                  )}
                >
                  <p className={cn("mb-4 text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                    Scan this QR code with your authenticator app:
                  </p>
                  {totpQrCode && (
                    <div className="mb-4 flex justify-center">
                      <img src={totpQrCode} alt="TOTP QR Code" className="h-48 w-48" />
                    </div>
                  )}
                  <p className={cn("mb-2 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                    Or enter this code manually:
                  </p>
                  <code
                    className={cn(
                      "block p-2 text-xs break-all",
                      isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-700"
                    )}
                  >
                    {totpUri?.split("secret=")[1]?.split("&")[0] || ""}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    maxLength={6}
                    className={cn(
                      "h-8 w-40 text-sm",
                      isDark
                        ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                        : "border-zinc-300 bg-white text-zinc-900"
                    )}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleVerifyTotp}
                    disabled={verifyCode.length !== 6}
                    className={cn(
                      "transition-all",
                      isDark
                        ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                    )}
                  >
                    <span className="text-xs tracking-wider uppercase">Verify</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowTotpSetup(false);
                      setTotpUri(null);
                      setTotpQrCode(null);
                      setVerifyCode("");
                      setPasswordForAction("");
                    }}
                    className={cn(
                      "transition-all",
                      isDark
                        ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                    )}
                  >
                    <span className="text-xs tracking-wider uppercase">Cancel</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Backup Codes Modal */}
      <FormModal
        open={showBackupCodes}
        onOpenChange={setShowBackupCodes}
        title="Backup Codes"
        description="Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device."
        onSubmit={() => {
          setShowBackupCodes(false);
          setBackupCodes([]);
        }}
        submitLabel="I've saved these codes"
        isDark={isDark}
        isValid={true}
      >
        <div className="space-y-2">
          {backupCodes.map((code, index) => (
            <div
              key={index}
              className={cn(
                "p-2 text-center font-mono text-sm",
                isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-700"
              )}
            >
              {code}
            </div>
          ))}
        </div>
      </FormModal>

      {/* Add Passkey Modal */}
      <FormModal
        open={addPasskeyModalOpen}
        onOpenChange={setAddPasskeyModalOpen}
        title="Add Passkey"
        description="Register a new passkey for passwordless authentication."
        onSubmit={handleAddPasskey}
        submitLabel="Add Passkey"
        isDark={isDark}
        isValid={newPasskeyName.trim().length >= 3}
      >
        <div className="space-y-4">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Passkey Name
            </label>
            <Input
              value={newPasskeyName}
              onChange={(e) => setNewPasskeyName(e.target.value)}
              placeholder="e.g., MacBook Pro - Touch ID"
              className={cn(
                "transition-all",
                isDark
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
                  : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
              )}
            />
            <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
              Enter a name to identify this passkey
            </p>
          </div>
        </div>
      </FormModal>

      {/* Delete Passkey Modal */}
      <ConfirmationModal
        open={deletePasskeyModalOpen}
        onOpenChange={setDeletePasskeyModalOpen}
        title="Delete Passkey"
        description={`Are you sure you want to delete "${selectedPasskey?.name || "this passkey"}"? You will no longer be able to sign in using this passkey.`}
        onConfirm={handleDeletePasskey}
        confirmLabel="Delete"
        variant="danger"
        isDark={isDark}
      />

      {/* Disable 2FA Modal */}
      <FormModal
        open={disableTwoFactorModalOpen}
        onOpenChange={setDisableTwoFactorModalOpen}
        title="Disable Two-Factor Authentication"
        description="Enter your password to disable two-factor authentication. This will make your account less secure."
        onSubmit={handleDisableTwoFactor}
        submitLabel="Disable 2FA"
        isDark={isDark}
        isValid={passwordForAction.length > 0}
      >
        <div className="space-y-4">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Password
            </label>
            <Input
              type="password"
              value={passwordForAction}
              onChange={(e) => setPasswordForAction(e.target.value)}
              placeholder="Enter your password"
              className={cn(
                "transition-all",
                isDark
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
                  : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
              )}
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
};

export default AccountPage;
