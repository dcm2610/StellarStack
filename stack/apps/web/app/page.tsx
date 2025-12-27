"use client";

import { useState, useEffect, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { BsSun, BsMoon } from "react-icons/bs";
import { signIn } from "@/lib/auth-client";
import { useAuth } from "@/components/auth-provider";
import { toast } from "sonner";

const LoginPage = (): JSX.Element | null => {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useNextTheme();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) return null;

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
    <div className={cn(
      "min-h-svh transition-colors relative flex items-center justify-center",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      {/* Theme toggle */}
      <div className="absolute top-6 right-6 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className={cn(
            "transition-all hover:scale-110 active:scale-95 p-2",
            isDark
              ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
              : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
          )}
        >
          {isDark ? <BsSun className="w-4 h-4" /> : <BsMoon className="w-4 h-4" />}
        </Button>
      </div>

      {/* Login Card */}
      <div className={cn(
        "relative w-full max-w-md mx-4 p-8 border transition-colors",
        isDark
          ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-lg shadow-black/20"
          : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300 shadow-lg shadow-zinc-400/20"
      )}>
        {/* Corner decorations */}
        <div className={cn(
          "absolute top-0 left-0 w-3 h-3 border-t border-l",
          isDark ? "border-zinc-500" : "border-zinc-400"
        )} />
        <div className={cn(
          "absolute top-0 right-0 w-3 h-3 border-t border-r",
          isDark ? "border-zinc-500" : "border-zinc-400"
        )} />
        <div className={cn(
          "absolute bottom-0 left-0 w-3 h-3 border-b border-l",
          isDark ? "border-zinc-500" : "border-zinc-400"
        )} />
        <div className={cn(
          "absolute bottom-0 right-0 w-3 h-3 border-b border-r",
          isDark ? "border-zinc-500" : "border-zinc-400"
        )} />

        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className={cn(
            "text-2xl font-light tracking-wider",
            isDark ? "text-zinc-100" : "text-zinc-800"
          )}>
            STELLARSTACK
          </h1>
          <p className={cn(
            "text-sm mt-2",
            isDark ? "text-zinc-500" : "text-zinc-500"
          )}>
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
            <div className="p-3 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className={cn(
              "w-full py-3 text-xs font-medium uppercase tracking-wider transition-all",
              isDark
                ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500"
                : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:bg-zinc-300 disabled:text-zinc-500"
            )}
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {/* Footer */}
        <div className={cn(
          "mt-6 pt-6 border-t text-center text-xs",
          isDark ? "border-zinc-800 text-zinc-600" : "border-zinc-200 text-zinc-400"
        )}>
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
