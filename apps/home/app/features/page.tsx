"use client";

import { useRef, type JSX } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import {
  BsServer,
  BsShieldCheck,
  BsLightningCharge,
  BsGlobe,
  BsGithub,
  BsTerminal,
  BsDatabase,
  BsArrowRight,
  BsCheckCircle,
  BsGear,
  BsGraphUp,
  BsPlug,
  BsCloudUpload,
  BsPeople,
  BsKey,
} from "react-icons/bs";
import { Footer } from "@/components/Footer";
import { Navigation } from "@/components/Navigation";
import { useIsMounted } from "@/hooks/useIsMounted";

const features = [
  {
    icon: BsServer,
    title: "Multi-Game Support",
    description: "Deploy and manage servers for Minecraft, Rust, Valheim, ARK, and dozens more games with pre-configured blueprints.",
    details: [
      "50+ supported games out of the box",
      "Custom game blueprint creation",
      "Automatic game updates",
      "Version management per server",
    ],
  },
  {
    icon: BsTerminal,
    title: "Real-time Console",
    description: "Full console access with WebSocket-powered real-time log streaming and command execution.",
    details: [
      "Live log streaming",
      "Command history",
      "Multi-user console access",
      "Filterable output",
    ],
  },
  {
    icon: BsShieldCheck,
    title: "Enterprise Security",
    description: "Role-based access control, API key management, 2FA support, and comprehensive audit logging.",
    details: [
      "Role-based permissions (RBAC)",
      "Two-factor authentication",
      "API key scoping",
      "Full audit trail",
    ],
  },
  {
    icon: BsLightningCharge,
    title: "Instant Deployment",
    description: "Spin up new game servers in seconds with automated provisioning and configuration.",
    details: [
      "One-click server creation",
      "Automated Docker provisioning",
      "Pre-configured templates",
      "Bulk deployment support",
    ],
  },
  {
    icon: BsGlobe,
    title: "Multi-Node Architecture",
    description: "Deploy nodes across multiple regions for low-latency gaming experiences worldwide.",
    details: [
      "Unlimited node connections",
      "Geographic distribution",
      "Load balancing ready",
      "Node health monitoring",
    ],
  },
  {
    icon: BsDatabase,
    title: "Database Management",
    description: "Built-in MySQL, PostgreSQL, and MongoDB database provisioning for game servers.",
    details: [
      "One-click database creation",
      "Automatic backups",
      "Connection string management",
      "Resource isolation",
    ],
  },
  {
    icon: BsGear,
    title: "File Manager",
    description: "Full-featured file manager with editing, uploading, and permission management.",
    details: [
      "Drag & drop uploads",
      "In-browser file editing",
      "Archive extraction",
      "SFTP access",
    ],
  },
  {
    icon: BsGraphUp,
    title: "Resource Monitoring",
    description: "Real-time CPU, memory, disk, and network monitoring with historical data.",
    details: [
      "Live resource graphs",
      "Historical data retention",
      "Alert thresholds",
      "Prometheus integration",
    ],
  },
  {
    icon: BsCloudUpload,
    title: "Automated Backups",
    description: "Schedule automatic backups with flexible retention policies and restore options.",
    details: [
      "Scheduled backups",
      "S3-compatible storage",
      "One-click restore",
      "Backup encryption",
    ],
  },
  {
    icon: BsPlug,
    title: "REST API & Webhooks",
    description: "Complete REST API for automation and webhooks for real-time event notifications.",
    details: [
      "Full REST API coverage",
      "Webhook integrations",
      "Rate limiting",
      "OpenAPI documentation",
    ],
  },
  {
    icon: BsPeople,
    title: "User Management",
    description: "Multi-tenant user system with subusers, permissions, and organization support.",
    details: [
      "Subuser permissions",
      "Organization accounts",
      "SSO support (OIDC)",
      "Invite system",
    ],
  },
  {
    icon: BsKey,
    title: "White-label Ready",
    description: "Fully customizable branding, theming, and domain configuration.",
    details: [
      "Custom branding",
      "Theme customization",
      "Custom domain support",
      "Email templates",
    ],
  },
];

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

const FeaturesPage = (): JSX.Element => {
    <div className="min-h-svh transition-colors relative bg-[#0b0b0a]">
      <AnimatedBackground />
      <FloatingDots count={20} />
      <Navigation />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-6xl font-extralight tracking-tight mb-6 text-zinc-100"
            >
              Everything You Need
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed text-zinc-400"
            >
              A complete, self-hosted solution for game server management with powerful features out of the box.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 0.05} className="h-full">
                <div className="relative p-8 border transition-all hover:scale-[1.02] group h-full flex flex-col border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50">
                  {/* Corner decorations */}
                  <div className="absolute top-0 left-0 w-3 h-3 border-t border-l transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t border-r transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r transition-colors border-zinc-700 group-hover:border-zinc-500" />

                  <feature.icon className="w-8 h-8 mb-4 flex-shrink-0 text-zinc-400" />
                  <h3 className="text-lg font-medium mb-2 flex-shrink-0 text-zinc-100">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed mb-4 text-zinc-400">
                    {feature.description}
                  </p>
                  <ul className="mt-auto space-y-2">
                    {feature.details.map((detail, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <BsCheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
                        <span className="text-xs text-zinc-500">
                          {detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6">
        <AnimatedSection className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-extralight tracking-tight mb-6 text-zinc-100">
            Ready to Get Started?
          </h2>
          <p className="text-lg mb-10 max-w-xl mx-auto text-zinc-400">
            Deploy StellarStack on your own infrastructure in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://docs.stellarstack.app" target="_blank" rel="noopener noreferrer">
              <Button
                className="text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02] bg-zinc-100 text-zinc-900 hover:bg-white"
              >
                Read the Docs
                <BsArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <a
              href="https://github.com/stellarstack/stellarstack"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                className="text-sm uppercase tracking-wider px-8 py-6 gap-2 border-zinc-700 text-zinc-300 hover:border-zinc-500"
              >
                <BsGithub className="w-4 h-4" />
                View on GitHub
              </Button>
            </a>
          </div>
        </AnimatedSection>
      </section>

      <Footer />
    </div>
  );
};

export default FeaturesPage;
