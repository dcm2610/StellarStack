"use client";

import { useState, useEffect, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import { BsSun, BsMoon } from "react-icons/bs";
import { signIn } from "@/lib/auth-client";
import { useAuth } from "@/components/auth-provider";
import { setup } from "@/lib/api";
import { toast } from "sonner";

const LoginPage = (): JSX.Element | null => {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useNextTheme();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if system needs setup
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await setup.status();
        if (!status.initialized) {
          // No users exist, redirect to setup
          router.push("/setup");
          return;
        }
      } catch {
        // If check fails, continue to login
      } finally {
        setCheckingSetup(false);
      }
    };
    checkStatus();
  }, [router]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.push("/servers");
    }
  }, [isAuthenticated, authLoading, router]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Invalid email or password");
        toast.error(result.error.message || "Invalid email or password");
      } else {
        toast.success("Signed in successfully");
        router.push("/servers");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted || checkingSetup) {
    return (
      <div
        className={cn(
          "relative flex min-h-svh items-center justify-center transition-colors",
          isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
        )}
      >
        <AnimatedBackground isDark={isDark} />
        <FloatingDots isDark={isDark} count={15} />
        <div
          className={cn(
            "text-sm tracking-wider uppercase",
            isDark ? "text-zinc-500" : "text-zinc-400"
          )}
        >
          Loading...
        </div>
      </div>
    );
  }

  const inputClasses = cn(
    "w-full px-4 py-3 border bg-transparent text-sm transition-colors focus:outline-none",
    isDark
      ? "border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-zinc-500"
      : "border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-zinc-400"
  );

  const labelClasses = cn(
    "block text-xs font-medium uppercase tracking-wider mb-2",
    isDark ? "text-zinc-400" : "text-zinc-600"
  );

  return (
    <div
      className={cn(
        "relative flex min-h-svh items-center justify-center transition-colors",
        isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
      )}
    >
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      {/* Theme toggle */}
      <div className="absolute top-6 right-6 z-10">
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

      {/* Login Card */}
      <div
        className={cn(
          "relative mx-4 w-full max-w-md border p-8 transition-colors",
          isDark
            ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] shadow-lg shadow-black/20"
            : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100 shadow-lg shadow-zinc-400/20"
        )}
      >
        {/* Corner decorations */}
        <div
          className={cn(
            "absolute top-0 left-0 h-3 w-3 border-t border-l",
            isDark ? "border-zinc-500" : "border-zinc-400"
          )}
        />
        <div
          className={cn(
            "absolute top-0 right-0 h-3 w-3 border-t border-r",
            isDark ? "border-zinc-500" : "border-zinc-400"
          )}
        />
        <div
          className={cn(
            "absolute bottom-0 left-0 h-3 w-3 border-b border-l",
            isDark ? "border-zinc-500" : "border-zinc-400"
          )}
        />
        <div
          className={cn(
            "absolute right-0 bottom-0 h-3 w-3 border-r border-b",
            isDark ? "border-zinc-500" : "border-zinc-400"
          )}
        />

        {/* Logo/Title */}
        <div className="mb-8 text-center">
          <h1
            className={cn(
              "text-2xl font-light tracking-wider",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}
          >
            STELLARSTACK
          </h1>
          <p className={cn("mt-2 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
            Sign in to your account
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className={labelClasses}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClasses}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className={labelClasses}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputClasses}
              required
            />
          </div>

          {error && (
            <div className="rounded border border-red-800 bg-red-900/20 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className={cn(
              "w-full py-3 text-xs font-medium tracking-wider uppercase transition-all",
              isDark
                ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500"
                : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:bg-zinc-300 disabled:text-zinc-500"
            )}
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {/* Footer */}
        <div
          className={cn(
            "mt-6 border-t pt-6 text-center text-xs",
            isDark ? "border-zinc-800 text-zinc-600" : "border-zinc-200 text-zinc-400"
          )}
        >
          Don&apos;t have an account?{" "}
          <button
            type="button"
            className={cn(
              "underline transition-colors",
              isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-600 hover:text-zinc-800"
            )}
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
