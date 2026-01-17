"use client";

import { useRef, type JSX } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import {
  BsGithub,
  BsArrowRight,
  BsTag,
  BsPlus,
  BsWrench,
  BsBug,
} from "react-icons/bs";
import { Footer } from "@/components/Footer";
import { Navigation } from "@/components/Navigation";
import { useIsMounted } from "@/hooks/useIsMounted";

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

const ChangelogPage = (): JSX.Element => {
    <div className="min-h-svh transition-colors relative bg-[#0b0b0a]">
      <AnimatedBackground />
      <FloatingDots count={20} />
      <Navigation />

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-6xl font-extralight tracking-tight mb-6 text-zinc-100"
            >
              Changelog
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed text-zinc-400"
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
              <div className="relative p-8 border border-zinc-800 bg-zinc-900/30">
                {/* Corner decorations */}
                <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-zinc-600" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-zinc-600" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-zinc-600" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-zinc-600" />

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-dashed border-zinc-700">
                  <div className="flex items-center gap-3">
                    <BsTag className="w-5 h-5 text-zinc-400" />
                    <h2 className="text-2xl font-mono font-medium text-zinc-100">
                      {release.version}
                    </h2>
                  </div>
                  <span className="text-sm font-mono text-zinc-500">
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
                        <span className="text-sm text-zinc-300">
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
          <h2 className="text-3xl md:text-4xl font-extralight tracking-tight mb-6 text-zinc-100">
            Stay Updated
          </h2>
          <p className="text-lg mb-10 max-w-xl mx-auto text-zinc-400">
            Star the repo on GitHub to get notified about new releases.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/stellarstack/stellarstack/releases"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                className="text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02] bg-zinc-100 text-zinc-900 hover:bg-white"
              >
                <BsGithub className="w-4 h-4" />
                View All Releases
              </Button>
            </a>
            <Link href="/roadmap">
              <Button
                variant="outline"
                className="text-sm uppercase tracking-wider px-8 py-6 gap-2 border-zinc-700 text-zinc-300 hover:border-zinc-500"
              >
                View Roadmap
                <BsArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </AnimatedSection>
      </section>

      <Footer />
    </div>
  );
};

export default ChangelogPage;
