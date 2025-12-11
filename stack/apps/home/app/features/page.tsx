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

const FeaturesPage = (): JSX.Element | null => {
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
                isDark ? "text-zinc-100" : "text-zinc-900"
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
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
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
      <section className="relative pt-32 pb-20 px-6">
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
              Everything You Need
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
                <div className={cn(
                  "relative p-8 border transition-all hover:scale-[1.02] group h-full flex flex-col",
                  isDark
                    ? "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-lg"
                )}>
                  {/* Corner decorations */}
                  <div className={cn(
                    "absolute top-0 left-0 w-3 h-3 border-t border-l transition-colors",
                    isDark
                      ? "border-zinc-700 group-hover:border-zinc-500"
                      : "border-zinc-300 group-hover:border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute top-0 right-0 w-3 h-3 border-t border-r transition-colors",
                    isDark
                      ? "border-zinc-700 group-hover:border-zinc-500"
                      : "border-zinc-300 group-hover:border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute bottom-0 left-0 w-3 h-3 border-b border-l transition-colors",
                    isDark
                      ? "border-zinc-700 group-hover:border-zinc-500"
                      : "border-zinc-300 group-hover:border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute bottom-0 right-0 w-3 h-3 border-b border-r transition-colors",
                    isDark
                      ? "border-zinc-700 group-hover:border-zinc-500"
                      : "border-zinc-300 group-hover:border-zinc-400"
                  )} />

                  <feature.icon className={cn(
                    "w-8 h-8 mb-4 flex-shrink-0",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )} />
                  <h3 className={cn(
                    "text-lg font-medium mb-2 flex-shrink-0",
                    isDark ? "text-zinc-100" : "text-zinc-900"
                  )}>
                    {feature.title}
                  </h3>
                  <p className={cn(
                    "text-sm leading-relaxed mb-4",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )}>
                    {feature.description}
                  </p>
                  <ul className="mt-auto space-y-2">
                    {feature.details.map((detail, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <BsCheckCircle className={cn(
                          "w-3.5 h-3.5 flex-shrink-0",
                          isDark ? "text-green-500" : "text-green-600"
                        )} />
                        <span className={cn(
                          "text-xs",
                          isDark ? "text-zinc-500" : "text-zinc-500"
                        )}>
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
          <h2 className={cn(
            "text-3xl md:text-4xl font-extralight tracking-tight mb-6",
            isDark ? "text-zinc-100" : "text-zinc-900"
          )}>
            Ready to Get Started?
          </h2>
          <p className={cn(
            "text-lg mb-10 max-w-xl mx-auto",
            isDark ? "text-zinc-400" : "text-zinc-600"
          )}>
            Deploy StellarStack on your own infrastructure in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://docs.stellarstack.app" target="_blank" rel="noopener noreferrer">
              <Button
                className={cn(
                  "text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02]",
                  isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                    : "bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                )}
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
                className={cn(
                  "text-sm uppercase tracking-wider px-8 py-6 gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-700 hover:border-zinc-400"
                )}
              >
                <BsGithub className="w-4 h-4" />
                View on GitHub
              </Button>
            </a>
          </div>
        </AnimatedSection>
      </section>

      <Footer isDark={isDark} />
    </div>
  );
};

export default FeaturesPage;
