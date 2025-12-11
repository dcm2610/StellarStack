"use client";

import { useState, useEffect, useRef, type JSX } from "react";
import Link from "next/link";
import { useTheme as useNextTheme } from "next-themes";
import { motion, useInView } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import {
  BsSun,
  BsMoon,
  BsGithub,
  BsArrowRight,
  BsTag,
  BsPlus,
  BsWrench,
  BsBug,
} from "react-icons/bs";
import { Footer } from "@/components/Footer";

type ChangeType = "feature" | "improvement" | "fix";

interface Change {
  type: ChangeType;
  description: string;
}

interface Release {
  version: string;
  date: string;
  changes: Change[];
}

const releases: Release[] = [
  {
    version: "0.1.0-alpha",
    date: "December 2025",
    changes: [
      { type: "feature", description: "Initial frontend release of StellarStack panel" },
      { type: "feature", description: "Real-time dashboard UI with live metrics visualization" },
      { type: "feature", description: "Interactive console component with log display" },
      { type: "feature", description: "Dark and light theme support" },
      { type: "feature", description: "Responsive design for mobile and desktop" },
      { type: "feature", description: "Drag-and-drop dashboard grid layout" },
      { type: "feature", description: "Landing page with interactive demo" },
      { type: "feature", description: "Features, Roadmap, About, Careers, and Changelog pages" },
      { type: "improvement", description: "Optimized bundle size with code splitting" },
    ],
  },
];

const changeTypeConfig = {
  feature: {
    label: "New",
    icon: BsPlus,
    color: "text-green-500",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  improvement: {
    label: "Improved",
    icon: BsWrench,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  fix: {
    label: "Fixed",
    icon: BsBug,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
};

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

// Animated section wrapper
const AnimatedSection = ({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const ChangelogPage = (): JSX.Element | null => {
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={20} />

      {/* Navigation */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md",
        isDark
          ? "bg-[#0b0b0a]/80 border-zinc-800"
          : "bg-[#f5f5f4]/80 border-zinc-200"
      )}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className={cn(
            "text-lg font-light tracking-[0.2em]",
            isDark ? "text-zinc-100" : "text-zinc-800"
          )}>
            STELLARSTACK
          </Link>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6">
              <Link href="/features" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )}>
                Features
              </Link>
              <Link href="/roadmap" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )}>
                Roadmap
              </Link>
              <Link href="/changelog" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-100" : "text-zinc-900"
              )}>
                Changelog
              </Link>
              <a
                href="https://github.com/stellarstack/stellarstack"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "text-xs uppercase tracking-wider transition-colors flex items-center gap-2",
                  isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                <BsGithub className="w-4 h-4" />
                GitHub
              </a>
            </div>

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
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className={cn(
                "text-4xl md:text-6xl font-extralight tracking-tight mb-6",
                isDark ? "text-zinc-100" : "text-zinc-900"
              )}
            >
              Changelog
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className={cn(
                "text-lg md:text-xl max-w-2xl mx-auto leading-relaxed",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Track our progress and see what&apos;s new in each release.
            </motion.p>
          </div>

          {/* Legend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-6 mt-10"
          >
            {Object.entries(changeTypeConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={cn(
                  "text-xs px-2 py-0.5 border",
                  config.bg,
                  config.border,
                  config.color
                )}>
                  {config.label}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Releases */}
      <section className="relative py-16 px-6">
        <div className="max-w-4xl mx-auto">
          {releases.map((release, ri) => (
            <AnimatedSection key={release.version} delay={ri * 0.1} className="mb-16 last:mb-0">
              <div className={cn(
                "relative p-8 border",
                isDark ? "border-zinc-800 bg-zinc-900/30" : "border-zinc-200 bg-white"
              )}>
                {/* Corner decorations */}
                <div className={cn("absolute top-0 left-0 w-3 h-3 border-t border-l", isDark ? "border-zinc-600" : "border-zinc-400")} />
                <div className={cn("absolute top-0 right-0 w-3 h-3 border-t border-r", isDark ? "border-zinc-600" : "border-zinc-400")} />
                <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-b border-l", isDark ? "border-zinc-600" : "border-zinc-400")} />
                <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-b border-r", isDark ? "border-zinc-600" : "border-zinc-400")} />

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-dashed border-zinc-700">
                  <div className="flex items-center gap-3">
                    <BsTag className={cn("w-5 h-5", isDark ? "text-zinc-400" : "text-zinc-600")} />
                    <h2 className={cn(
                      "text-2xl font-mono font-medium",
                      isDark ? "text-zinc-100" : "text-zinc-900"
                    )}>
                      {release.version}
                    </h2>
                  </div>
                  <span className={cn(
                    "text-sm font-mono",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    {release.date}
                  </span>
                </div>

                {/* Changes */}
                <ul className="space-y-3">
                  {release.changes.map((change, ci) => {
                    const config = changeTypeConfig[change.type];
                    return (
                      <li key={ci} className="flex items-start gap-3">
                        <span className={cn(
                          "text-xs px-2 py-0.5 border shrink-0 mt-0.5",
                          config.bg,
                          config.border,
                          config.color
                        )}>
                          {config.label}
                        </span>
                        <span className={cn(
                          "text-sm",
                          isDark ? "text-zinc-300" : "text-zinc-700"
                        )}>
                          {change.description}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6">
        <AnimatedSection className="max-w-4xl mx-auto text-center">
          <h2 className={cn(
            "text-3xl md:text-4xl font-extralight tracking-tight mb-6",
            isDark ? "text-zinc-100" : "text-zinc-900"
          )}>
            Stay Updated
          </h2>
          <p className={cn(
            "text-lg mb-10 max-w-xl mx-auto",
            isDark ? "text-zinc-400" : "text-zinc-600"
          )}>
            Star the repo on GitHub to get notified about new releases.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/stellarstack/stellarstack/releases"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                className={cn(
                  "text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02]",
                  isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                    : "bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                )}
              >
                <BsGithub className="w-4 h-4" />
                View All Releases
              </Button>
            </a>
            <Link href="/roadmap">
              <Button
                variant="outline"
                className={cn(
                  "text-sm uppercase tracking-wider px-8 py-6 gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-700 hover:border-zinc-400"
                )}
              >
                View Roadmap
                <BsArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </AnimatedSection>
      </section>

      <Footer isDark={isDark} />
    </div>
  );
};

export default ChangelogPage;
