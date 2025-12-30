"use client";

import { useState, useEffect, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import { BsSun, BsMoon, BsCheck2, BsArrowRight } from "react-icons/bs";
import { setup, ApiError } from "@/lib/api";
import { signIn } from "@/lib/auth-client";
import { toast } from "sonner";

const SetupPage = (): JSX.Element | null => {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if system is already initialized
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await setup.status();
        if (status.initialized) {
          // System already has users, redirect to login
          router.push("/");
        }
      } catch {
        // If status check fails, allow setup to proceed
      } finally {
        setCheckingStatus(false);
      }
    };
    checkStatus();
  }, [router]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (step === 1) {
      // Validate step 1
      if (!name.trim()) {
        setError("Name is required");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      // Validate step 2
      if (!email.trim()) {
        setError("Email is required");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email address");
        return;
      }
      setStep(3);
      return;
    }

    // Step 3 - Create account
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      // Create admin account
      await setup.createAdmin({ name, email, password });
      setIsComplete(true);
      toast.success("Admin account created successfully!");

      // Auto sign in after short delay
      setTimeout(async () => {
        try {
          await signIn.email({ email, password });
          router.push("/admin");
        } catch {
          // If auto sign-in fails, redirect to login
          router.push("/");
        }
      }, 2000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create admin account");
      }
      toast.error("Failed to create admin account");
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted || checkingStatus) {
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

  const StepIndicator = ({
    number,
    active,
    complete,
  }: {
    number: number;
    active: boolean;
    complete: boolean;
  }) => (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all",
        complete
          ? isDark
            ? "border border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
            : "border border-emerald-500/50 bg-emerald-500/20 text-emerald-600"
          : active
            ? isDark
              ? "bg-zinc-100 text-zinc-900"
              : "bg-zinc-800 text-zinc-100"
            : isDark
              ? "border border-zinc-700 bg-zinc-800 text-zinc-500"
              : "border border-zinc-300 bg-zinc-200 text-zinc-500"
      )}
    >
      {complete ? <BsCheck2 className="h-4 w-4" /> : number}
    </div>
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

      {/* Setup Card */}
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

        {isComplete ? (
          // Success state
          <div className="py-8 text-center">
            <div
              className={cn(
                "mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full",
                isDark ? "bg-emerald-500/20" : "bg-emerald-500/20"
              )}
            >
              <BsCheck2
                className={cn("h-8 w-8", isDark ? "text-emerald-400" : "text-emerald-600")}
              />
            </div>
            <h2
              className={cn(
                "mb-2 text-xl font-light tracking-wider",
                isDark ? "text-zinc-100" : "text-zinc-800"
              )}
            >
              Setup Complete!
            </h2>
            <p className={cn("mb-4 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
              Your admin account has been created.
            </p>
            <p className={cn("text-xs", isDark ? "text-zinc-600" : "text-zinc-400")}>
              Redirecting to admin panel...
            </p>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="mb-6 text-center">
              <h1
                className={cn(
                  "text-2xl font-light tracking-wider",
                  isDark ? "text-zinc-100" : "text-zinc-800"
                )}
              >
                STELLARSTACK
              </h1>
              <p className={cn("mt-2 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                Initial Setup
              </p>
            </div>

            {/* Step indicators */}
            <div className="mb-8 flex items-center justify-center gap-2">
              <StepIndicator number={1} active={step === 1} complete={step > 1} />
              <div className={cn("h-px w-8", isDark ? "bg-zinc-700" : "bg-zinc-300")} />
              <StepIndicator number={2} active={step === 2} complete={step > 2} />
              <div className={cn("h-px w-8", isDark ? "bg-zinc-700" : "bg-zinc-300")} />
              <StepIndicator number={3} active={step === 3} complete={false} />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {step === 1 && (
                <>
                  <div className="mb-4 text-center">
                    <h2
                      className={cn(
                        "text-sm font-medium tracking-wider uppercase",
                        isDark ? "text-zinc-300" : "text-zinc-700"
                      )}
                    >
                      Welcome
                    </h2>
                    <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                      Let&apos;s create your administrator account
                    </p>
                  </div>
                  <div>
                    <label htmlFor="name" className={labelClasses}>
                      Your Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className={inputClasses}
                      autoFocus
                    />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="mb-4 text-center">
                    <h2
                      className={cn(
                        "text-sm font-medium tracking-wider uppercase",
                        isDark ? "text-zinc-300" : "text-zinc-700"
                      )}
                    >
                      Account Details
                    </h2>
                    <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                      Enter your email address
                    </p>
                  </div>
                  <div>
                    <label htmlFor="email" className={labelClasses}>
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className={inputClasses}
                      autoFocus
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="mb-4 text-center">
                    <h2
                      className={cn(
                        "text-sm font-medium tracking-wider uppercase",
                        isDark ? "text-zinc-300" : "text-zinc-700"
                      )}
                    >
                      Security
                    </h2>
                    <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                      Create a strong password
                    </p>
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
                      autoFocus
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className={labelClasses}>
                      Confirm Password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputClasses}
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="rounded border border-red-800 bg-red-900/20 p-3 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                {step > 1 && (
                  <Button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    variant="outline"
                    className={cn(
                      "flex-1 py-3 text-xs font-medium tracking-wider uppercase",
                      isDark
                        ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                    )}
                  >
                    Back
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium tracking-wider uppercase transition-all",
                    isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500"
                      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:bg-zinc-300 disabled:text-zinc-500"
                  )}
                >
                  {isLoading ? (
                    "Creating..."
                  ) : step < 3 ? (
                    <>
                      Continue
                      <BsArrowRight className="h-3 w-3" />
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default SetupPage;
