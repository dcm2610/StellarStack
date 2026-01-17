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
  BsCheckCircle,
  BsCircle,
  BsArrowRight,
} from "react-icons/bs";
import { Footer } from "@/components/Footer";
import { Navigation } from "@/components/Navigation";

type RoadmapStatus = "completed" | "in-progress" | "planned";

interface RoadmapItem {
  title: string;
  description: string;
  status: RoadmapStatus;
}

interface RoadmapQuarter {
  quarter: string;
  items: RoadmapItem[];
}

const roadmap: RoadmapQuarter[] = [
  {
    quarter: "Q4 2025",
    items: [
      { title: "Frontend Development", description: "Next.js frontend with real-time dashboard and server management UI", status: "in-progress" },
      { title: "Core API", description: "Hono-based REST API with TypeScript for all panel operations", status: "in-progress" },
      { title: "Authentication System", description: "Better-auth integration with 2FA and session management", status: "in-progress" },
      { title: "Database Schema", description: "PostgreSQL schema design with Prisma ORM", status: "in-progress" },
    ],
  },
  {
    quarter: "Q1 2026",
    items: [
      { title: "Rust Daemon", description: "High-performance daemon for container orchestration and WebSocket communication", status: "planned" },
      { title: "Docker Integration", description: "Full Docker container lifecycle management", status: "planned" },
      { title: "Real-time Console", description: "WebSocket-powered console with live log streaming", status: "planned" },
      { title: "File Manager", description: "Full-featured file browser with editing and SFTP support", status: "planned" },
    ],
  },
  {
    quarter: "Q2 2026",
    items: [
      { title: "Game Blueprints", description: "Pre-configured templates for 50+ games", status: "planned" },
      { title: "Multi-node Support", description: "Connect and manage multiple daemon nodes", status: "planned" },
      { title: "API & Webhooks", description: "Complete REST API with webhook integrations", status: "planned" },
      { title: "User Permissions", description: "Granular RBAC with subuser support", status: "planned" },
    ],
  },
  {
    quarter: "Q3 2026",
    items: [
      { title: "Monitoring & Alerts", description: "Prometheus/Grafana integration with alerting", status: "planned" },
      { title: "White-label Support", description: "Custom branding and theming options", status: "planned" },
      { title: "SSO Integration", description: "OIDC/SAML single sign-on support", status: "planned" },
      { title: "Mobile App", description: "React Native companion app", status: "planned" },
    ],
  },
];

const statusConfig = {
  completed: {
    label: "Completed",
    icon: BsCheckCircle,
    color: "text-green-500",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  "in-progress": {
    label: "In Progress",
    icon: BsCircle,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  planned: {
    label: "Planned",
    icon: BsCircle,
    color: "text-zinc-500",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
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

const RoadmapPage = (): JSX.Element => {
  return (
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
              Roadmap
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed text-zinc-400"
            >
              Our development timeline and upcoming features. Follow along as we build the future of game server management.
            </motion.p>
          </div>

          {/* Status Legend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-6 mt-10"
          >
            {Object.entries(statusConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-2">
                <config.icon className={cn("w-4 h-4", config.color)} />
                <span className="text-sm text-zinc-400">
                  {config.label}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Roadmap Timeline */}
      <section className="relative py-16 px-6">
        <div className="max-w-4xl mx-auto">
          {roadmap.map((quarter, qi) => (
            <AnimatedSection key={quarter.quarter} delay={qi * 0.1} className="mb-16 last:mb-0">
              <div className="flex items-center gap-4 mb-6">
                <div className="px-4 py-2 border font-mono text-sm border-zinc-700 bg-zinc-800/50 text-zinc-300">
                  {quarter.quarter}
                </div>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              <div className="space-y-4">
                {quarter.items.map((item, ii) => {
                  const config = statusConfig[item.status];
                  return (
                    <div
                      key={ii}
                      className="relative p-6 border transition-all border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <config.icon className={cn("w-4 h-4", config.color)} />
                            <h3 className="text-base font-medium text-zinc-100">
                              {item.title}
                            </h3>
                          </div>
                          <p className="text-sm pl-7 text-zinc-400">
                            {item.description}
                          </p>
                        </div>
                        <span className={cn(
                          "text-xs px-2 py-1 border shrink-0",
                          config.bg,
                          config.border,
                          config.color
                        )}>
                          {config.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6">
        <AnimatedSection className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-extralight tracking-tight mb-6 text-zinc-100">
            Want to Contribute?
          </h2>
          <p className="text-lg mb-10 max-w-xl mx-auto text-zinc-400">
            StellarStack is open source. Join our community and help shape the future.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/stellarstack/stellarstack"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                className="text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02] bg-zinc-100 text-zinc-900 hover:bg-white"
              >
                <BsGithub className="w-4 h-4" />
                Contribute on GitHub
              </Button>
            </a>
            <a href="https://discord.gg/stellarstack" target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                className="text-sm uppercase tracking-wider px-8 py-6 gap-2 border-zinc-700 text-zinc-300 hover:border-zinc-500"
              >
                Join Discord
                <BsArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </AnimatedSection>
      </section>

      <Footer />
    </div>
  );
};

export default RoadmapPage;
