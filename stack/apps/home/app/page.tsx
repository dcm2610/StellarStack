"use client";

import { useState, useEffect, useRef, type JSX } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme as useNextTheme } from "next-themes";
import { motion, useInView } from "framer-motion";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import "swiper/css";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import {
  CpuCard,
  UsageMetricCard,
  NetworkUsageCard,
  InstanceNameCard,
  ContainerControlsCard,
} from "@workspace/ui/components/shared/DashboardCards";
import { Console } from "@workspace/ui/components/shared/Console";
import { DragDropGrid, GridItem } from "@workspace/ui/components/shared/DragDropGrid";
import type { GridItemConfig } from "@workspace/ui/components/shared/DragDropGrid";
import {
  BsServer,
  BsShieldCheck,
  BsLightningCharge,
  BsGlobe,
  BsGithub,
  BsDiscord,
  BsTwitterX,
  BsArrowRight,
  BsCheckCircle,
  BsTerminal,
  BsDatabase,
  BsHddNetwork,
  BsPeople,
  BsPersonWorkspace,
  BsCodeSlash,
  BsImage,
  BsShieldLock,
  BsKey,
  BsLock,
  BsFileEarmarkLock,
} from "react-icons/bs";
import {
  SiNextdotjs,
  SiReact,
  SiTypescript,
  SiPostgresql,
  SiPrisma,
  SiDocker,
  SiTailwindcss,
  SiHono,
  SiRedis,
  SiNodedotjs,
  SiTurborepo,
  SiRust,
  SiStorybook,
  SiTraefikproxy,
  SiPrometheus,
  SiGrafana,
} from "react-icons/si";
import { Footer } from "@/components/Footer";
import { Navigation } from "@/components/Navigation";

// Technology stack
const technologies = [
  { name: "Next.js", Icon: SiNextdotjs },
  { name: "React", Icon: SiReact },
  { name: "TypeScript", Icon: SiTypescript },
  { name: "PostgreSQL", Icon: SiPostgresql },
  { name: "Prisma", Icon: SiPrisma },
  { name: "Docker", Icon: SiDocker },
  { name: "Traefik", Icon: SiTraefikproxy },
  { name: "Tailwind CSS", Icon: SiTailwindcss },
  { name: "Hono", Icon: SiHono },
  { name: "Redis", Icon: SiRedis },
  { name: "Node.js", Icon: SiNodedotjs },
  { name: "Turborepo", Icon: SiTurborepo },
  { name: "Rust", Icon: SiRust },
  { name: "Prometheus", Icon: SiPrometheus },
  { name: "Grafana", Icon: SiGrafana },
  { name: "Storybook", Icon: SiStorybook },
];

const features = [
  {
    icon: BsServer,
    title: "Multi-Game Support",
    description: "Deploy and manage servers for Minecraft, Rust, Valheim, ARK, and dozens more games with pre-configured blueprints.",
  },
  {
    icon: BsShieldCheck,
    title: "Enterprise Security",
    description: "Role-based access control, API key management, 2FA support, and comprehensive audit logging.",
  },
  {
    icon: BsLightningCharge,
    title: "Instant Deployment",
    description: "Spin up new game servers in seconds with automated provisioning and configuration.",
  },
  {
    icon: BsGlobe,
    title: "Global Infrastructure",
    description: "Deploy nodes across multiple regions for low-latency gaming experiences worldwide.",
  },
  {
    icon: BsTerminal,
    title: "Real-time Console",
    description: "Full console access with WebSocket-powered real-time log streaming and command execution.",
  },
  {
    icon: BsDatabase,
    title: "Database Management",
    description: "Built-in MySQL, PostgreSQL, and MongoDB database provisioning for game servers.",
  },
];

const highlights = [
  "Open Source & Self-Hosted",
  "Docker-based Isolation",
  "Automated Backups",
  "Custom Blueprints",
  "REST API & Webhooks",
  "White-label Ready",
];

// Target users
const targetUsers = [
  {
    icon: BsServer,
    title: "VPS & Dedicated",
    description: "Got a VPS or dedicated server? Run the install script and have a full game server panel in minutes.",
  },
  {
    icon: BsPeople,
    title: "Gaming Communities",
    description: "Self-host servers for your clan or guild with role-based permissions and member access control.",
  },
  {
    icon: BsPersonWorkspace,
    title: "Homelab Enthusiasts",
    description: "Run game servers on your own hardware. Perfect for those who prefer full control over their infrastructure.",
  },
  {
    icon: BsCodeSlash,
    title: "Developers",
    description: "Contribute to the project, build custom blueprints, or extend functionality with the REST API.",
  },
];

// Security features
const securityFeatures = [
  {
    icon: BsKey,
    title: "Bcrypt Password Hashing",
    description: "Industry-standard bcrypt algorithm with adaptive cost factor for secure password storage.",
  },
  {
    icon: BsLock,
    title: "AES-256-CBC Encryption",
    description: "Military-grade encryption for sensitive data at rest, including API tokens and secrets.",
  },
  {
    icon: BsShieldLock,
    title: "HTTPS Everywhere",
    description: "TLS 1.3 support out of the box with automatic certificate management via Caddy.",
  },
  {
    icon: BsFileEarmarkLock,
    title: "mTLS Communication",
    description: "Mutual TLS authentication between control plane and daemon nodes for zero-trust security.",
  },
];

// Security layers
const securityLayers = [
  { layer: "Edge", items: ["DDoS Protection", "WAF Rules", "Rate Limiting", "Bot Protection"] },
  { layer: "Application", items: ["Authentication", "RBAC", "Input Validation", "CSRF Protection"] },
  { layer: "Infrastructure", items: ["Network Segmentation", "Firewall Rules", "Encrypted Storage", "Audit Logging"] },
  { layer: "Container", items: ["Resource Limits", "Network Isolation", "No Privileged Mode", "Seccomp Profiles"] },
];

// Initial sample server data
const initialServerData = {
  name: "US-WEST-MC-01",
  cpu: {
    usage: { percentage: 74, history: [45, 52, 48, 55, 62, 58, 65, 72, 68, 75, 70, 73, 78, 82, 76, 79, 85, 80, 77, 74] },
    cores: 8,
    frequency: 3.6,
  },
  memory: {
    usage: { percentage: 88, history: [60, 62, 65, 63, 68, 70, 72, 75, 73, 78, 76, 79, 82, 80, 85, 83, 87, 84, 86, 88] },
    used: 14.1,
    total: 16,
    type: "DDR4",
  },
  disk: {
    usage: { percentage: 51, history: [42, 42, 43, 43, 44, 44, 45, 45, 46, 46, 47, 47, 48, 48, 49, 49, 50, 50, 51, 51] },
    used: 51,
    total: 100,
    type: "NVMe SSD",
  },
  network: {
    download: 340,
    upload: 165,
    downloadHistory: [120, 145, 130, 180, 165, 200, 175, 220, 190, 240, 210, 260, 230, 280, 250, 300, 270, 320, 290, 340],
    uploadHistory: [45, 52, 48, 65, 58, 72, 62, 85, 70, 95, 78, 105, 85, 120, 92, 135, 100, 150, 110, 165],
  },
  networkConfig: {
    publicIp: "45.33.128.72",
    privateIp: "192.168.1.100",
    openPorts: [{ port: 25565, protocol: "TCP" }, { port: 25575, protocol: "TCP" }],
    macAddress: "00:1A:2B:3C:4D:5E",
  },
  node: {
    id: "node-us-west-1",
    name: "US West 1",
    location: "Los Angeles, CA",
    region: "us-west",
    zone: "us-west-1a",
    provider: "Hetzner",
  },
};

// Grid items config for the landing page preview
const previewGridItems: GridItemConfig[] = [
  { i: "instance-name", size: "xxs-wide", minSize: "xxs-wide", maxSize: "xxs-wide" },
  { i: "container-controls", size: "xxs-wide", minSize: "xxs-wide", maxSize: "xxs-wide" },
  { i: "cpu", size: "xxs", minSize: "xxs", maxSize: "lg" },
  { i: "ram", size: "xxs", minSize: "xxs", maxSize: "sm" },
  { i: "disk", size: "xxs", minSize: "xxs", maxSize: "sm" },
  { i: "network-usage", size: "xxs", minSize: "xxs", maxSize: "sm" },
  { i: "console", size: "xl", minSize: "md", maxSize: "xxl" },
];

// Sample console messages
const sampleConsoleMessages = [
  "Server tick took 48ms",
  "Saving world chunks...",
  "World saved successfully",
  "Player Steve moved to chunk [12, -5]",
  "Entity count: 847",
  "Memory usage: 2.4GB / 4GB",
  "TPS: 19.8",
  "Autosave completed in 234ms",
  "Player Alex joined the game",
  "Player Steve: Hello everyone!",
  "Loaded 24 chunks for player Alex",
  "Garbage collection freed 128MB",
  "Processing 12 pending block updates",
  "Weather changed to rain",
  "Player Steve earned achievement [Getting Wood]",
];

interface ConsoleLine {
  id: string;
  timestamp: number;
  message: string;
  level: "info" | "error" | "default";
}

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
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

const LandingPage = (): JSX.Element | null => {
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [isEnterpriseArch, setIsEnterpriseArch] = useState(false);
  const [serverData, setServerData] = useState(initialServerData);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([
    { id: "1", timestamp: Date.now() - 5000, message: "Server started on port 25565", level: "info" },
    { id: "2", timestamp: Date.now() - 4000, message: "Loading world \"survival\"...", level: "default" },
    { id: "3", timestamp: Date.now() - 3000, message: "Done! Server ready for connections", level: "info" },
    { id: "4", timestamp: Date.now() - 2000, message: "Player \"Steve\" joined the game", level: "default" },
  ]);
  const lineIdRef = useRef(5);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Randomly update server data and add console lines
  useEffect(() => {
    if (!mounted) return;

    const interval = setInterval(() => {
      setServerData((prev) => {
        const newCpu = Math.max(20, Math.min(95, prev.cpu.usage.percentage + (Math.random() - 0.5) * 10));
        const newRam = Math.max(40, Math.min(95, prev.memory.usage.percentage + (Math.random() - 0.5) * 8));
        const newDisk = Math.max(30, Math.min(80, prev.disk.usage.percentage + (Math.random() - 0.3) * 2));
        const newDownload = Math.max(50, Math.min(500, prev.network.download + (Math.random() - 0.5) * 100));
        const newUpload = Math.max(20, Math.min(250, prev.network.upload + (Math.random() - 0.5) * 50));

        return {
          ...prev,
          cpu: {
            ...prev.cpu,
            usage: {
              percentage: Math.round(newCpu),
              history: [...prev.cpu.usage.history.slice(1), Math.round(newCpu)],
            },
          },
          memory: {
            ...prev.memory,
            usage: {
              percentage: Math.round(newRam),
              history: [...prev.memory.usage.history.slice(1), Math.round(newRam)],
            },
          },
          disk: {
            ...prev.disk,
            usage: {
              percentage: Math.round(newDisk),
              history: [...prev.disk.usage.history.slice(1), Math.round(newDisk)],
            },
          },
          network: {
            ...prev.network,
            download: Math.round(newDownload),
            upload: Math.round(newUpload),
            downloadHistory: [...prev.network.downloadHistory.slice(1), Math.round(newDownload)],
            uploadHistory: [...prev.network.uploadHistory.slice(1), Math.round(newUpload)],
          },
        };
      });

      // Add a new console line randomly
      if (Math.random() > 0.3) {
        const randomMessage = sampleConsoleMessages[Math.floor(Math.random() * sampleConsoleMessages.length)] ?? "Server tick completed";
        const newLine: ConsoleLine = {
          id: String(lineIdRef.current++),
          timestamp: Date.now(),
          message: randomMessage,
          level: Math.random() > 0.9 ? "info" : "default",
        };
        setConsoleLines((prev) => [...prev.slice(-50), newLine]);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [mounted]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  const homeNavLinks = [
    { href: "#features", label: "Features", isAnchor: true },
    { href: "#security", label: "Security", isAnchor: true },
    { href: "#tech", label: "Tech Stack", isAnchor: true },
  ];

  return (
    <div className={cn(
      "min-h-svh transition-colors relative scroll-smooth",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={20} />
      <Navigation links={homeNavLinks} />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge - Git Commit Hash */}
            <motion.a
              href="https://github.com/stellarstack/stellarstack/commit/6170dde"
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 border mb-8 transition-colors",
                isDark
                  ? "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                  : "border-zinc-300 bg-white/50 text-zinc-600 hover:border-zinc-400 hover:text-zinc-700"
              )}
            >
              <BsGithub className="w-4 h-4" />
              <span className="text-xs font-mono tracking-wider">6170dde</span>
            </motion.a>

            {/* Main Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-5xl md:text-7xl font-extralight tracking-tight leading-[1.1] mb-6"
            >
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: isDark
                    ? "linear-gradient(135deg, #ffffff 0%, #a1a1aa 50%, #71717a 100%)"
                    : "linear-gradient(135deg, #18181b 0%, #3f3f46 50%, #52525b 100%)",
                }}
              >
                Deploy Game Servers
              </span>
              <br />
              <span
                className="font-light bg-clip-text text-transparent"
                style={{
                  backgroundImage: isDark
                    ? "linear-gradient(135deg, #a1a1aa 0%, #71717a 50%, #52525b 100%)"
                    : "linear-gradient(135deg, #52525b 0%, #71717a 50%, #a1a1aa 100%)",
                }}
              >
                in Seconds
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className={cn(
                "text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              The modern, open-source game server management panel. Self-host on your VPS or
              dedicated server with our install scripts. Works out of the box for anyone comfortable with Linux.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
            >
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
                    "text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02]",
                    isDark
                      ? "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/50"
                      : "border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-white"
                  )}
                >
                  <BsGithub className="w-4 h-4" />
                  View on GitHub
                </Button>
              </a>
            </motion.div>

            {/* Highlights */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
            >
              {highlights.map((highlight, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.5 + i * 0.05 }}
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}
                >
                  <BsCheckCircle className={cn(
                    "w-4 h-4",
                    isDark ? "text-green-500" : "text-green-600"
                  )} />
                  {highlight}
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Hero Image/Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="relative mt-20 mx-auto max-w-7xl"
          >
            {/* Floating Interactive Hint */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
              <div className={cn(
                "relative px-4 py-2 border backdrop-blur-sm",
                isDark
                  ? "border-zinc-700 bg-zinc-900/90 text-zinc-300"
                  : "border-zinc-300 bg-white/90 text-zinc-700"
              )}>
                {/* Corner accents */}
                <div className={cn("absolute -top-px -left-px w-2 h-2 border-t border-l", isDark ? "border-green-500" : "border-green-600")} />
                <div className={cn("absolute -top-px -right-px w-2 h-2 border-t border-r", isDark ? "border-green-500" : "border-green-600")} />
                <div className={cn("absolute -bottom-px -left-px w-2 h-2 border-b border-l", isDark ? "border-green-500" : "border-green-600")} />
                <div className={cn("absolute -bottom-px -right-px w-2 h-2 border-b border-r", isDark ? "border-green-500" : "border-green-600")} />

                <div className="flex items-center gap-3">
                  <span className="relative flex h-2 w-2">
                    <span className={cn(
                      "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                      isDark ? "bg-green-400" : "bg-green-500"
                    )} />
                    <span className={cn(
                      "relative inline-flex rounded-full h-2 w-2",
                      isDark ? "bg-green-500" : "bg-green-600"
                    )} />
                  </span>
                  <span className="text-xs uppercase tracking-wider font-medium">
                    Interactive Demo
                  </span>
                  <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    —
                  </span>
                  <span className={cn("text-xs", isDark ? "text-zinc-400" : "text-zinc-500")}>
                    Drag cards & resize
                  </span>
                </div>

                {/* Animated arrow pointing down */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 animate-bounce">
                  <svg
                    width="12"
                    height="8"
                    viewBox="0 0 12 8"
                    className={isDark ? "text-green-500" : "text-green-600"}
                    fill="currentColor"
                  >
                    <path d="M6 8L0 0h12L6 8z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Preview Container */}
            <div className={cn(
              "relative border overflow-hidden",
              isDark
                ? "border-zinc-800 bg-zinc-900/50 shadow-2xl shadow-black/50"
                : "border-zinc-200 bg-white shadow-2xl shadow-zinc-400/20"
            )}>
            {/* Window Controls */}
            <div className={cn(
              "flex items-center gap-2 px-4 py-3 border-b",
              isDark ? "border-zinc-800 bg-zinc-900" : "border-zinc-200 bg-zinc-50"
            )}>
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className={cn(
                "ml-4 text-xs",
                isDark ? "text-zinc-500" : "text-zinc-400"
              )}>
                app.stellarstack.app/servers
              </span>
            </div>
            {/* Dashboard Preview with Actual Components - matches default overview layout */}
            <div className="p-6">
              <DragDropGrid
                className="w-full"
                items={previewGridItems}
                allItems={previewGridItems}
                rowHeight={50}
                gap={16}
                isEditing={true}
                isDark={isDark}
                isDroppable={false}
              >
                <div key="instance-name" className="h-full">
                  <GridItem itemId="instance-name" showRemoveHandle={false}>
                    <InstanceNameCard itemId="instance-name" isDark={isDark} instanceName={serverData.name} />
                  </GridItem>
                </div>

                <div key="container-controls" className="h-full">
                  <GridItem itemId="container-controls" showRemoveHandle={false}>
                    <ContainerControlsCard
                      itemId="container-controls"
                      isDark={isDark}
                      isOffline={false}
                      status="running"
                      onStart={() => {}}
                      onStop={() => {}}
                      onKill={() => {}}
                      onRestart={() => {}}
                      labels={{ start: "Start", stop: "Stop", kill: "Kill", restart: "Restart" }}
                    />
                  </GridItem>
                </div>

                <div key="cpu" className="h-full">
                  <GridItem itemId="cpu" showRemoveHandle={false}>
                    <CpuCard
                      itemId="cpu"
                      percentage={serverData.cpu.usage.percentage}
                      details={[`${serverData.cpu.cores} CORES`, `${serverData.cpu.frequency} GHz`]}
                      history={serverData.cpu.usage.history}
                      isDark={isDark}
                      isOffline={false}
                      labels={{ title: "CPU", coreUsage: "Core Usage", cores: "Cores" }}
                    />
                  </GridItem>
                </div>

                <div key="ram" className="h-full">
                  <GridItem itemId="ram" showRemoveHandle={false}>
                    <UsageMetricCard
                      itemId="ram"
                      percentage={serverData.memory.usage.percentage}
                      details={[`${serverData.memory.used} / ${serverData.memory.total} GB`, serverData.memory.type]}
                      history={serverData.memory.usage.history}
                      isDark={isDark}
                      isOffline={false}
                      labels={{ title: "RAM" }}
                    />
                  </GridItem>
                </div>

                <div key="disk" className="h-full">
                  <GridItem itemId="disk" showRemoveHandle={false}>
                    <UsageMetricCard
                      itemId="disk"
                      percentage={serverData.disk.usage.percentage}
                      details={[`${serverData.disk.used} / ${serverData.disk.total} GB`, serverData.disk.type]}
                      history={serverData.disk.usage.history}
                      isDark={isDark}
                      isOffline={false}
                      labels={{ title: "DISK" }}
                    />
                  </GridItem>
                </div>

                <div key="network-usage" className="h-full">
                  <GridItem itemId="network-usage" showRemoveHandle={false}>
                    <NetworkUsageCard
                      itemId="network-usage"
                      download={serverData.network.download}
                      upload={serverData.network.upload}
                      downloadHistory={serverData.network.downloadHistory}
                      uploadHistory={serverData.network.uploadHistory}
                      isDark={isDark}
                      isOffline={false}
                      labels={{ title: "NETWORK", download: "Download", upload: "Upload" }}
                    />
                  </GridItem>
                </div>

                <div key="console" className="h-full">
                  <GridItem itemId="console" showRemoveHandle={false}>
                    <Console lines={consoleLines} isDark={isDark} isOffline={false} />
                  </GridItem>
                </div>
              </DragDropGrid>
            </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className={cn(
              "text-3xl md:text-5xl font-extralight tracking-tight mb-4",
              isDark ? "text-zinc-100" : "text-zinc-900"
            )}>
              Everything You Need
            </h2>
            <p className={cn(
              "text-lg max-w-2xl mx-auto",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              A complete solution for game server hosting with powerful features out of the box.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="h-full">
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
                  "w-8 h-8 mb-6 flex-shrink-0",
                  isDark ? "text-zinc-400" : "text-zinc-600"
                )} />
                <h3 className={cn(
                  "text-lg font-medium mb-3 flex-shrink-0",
                  isDark ? "text-zinc-100" : "text-zinc-900"
                )}>
                  {feature.title}
                </h3>
                <p className={cn(
                  "text-sm leading-relaxed flex-grow",
                  isDark ? "text-zinc-400" : "text-zinc-600"
                )}>
                  {feature.description}
                </p>
              </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For Section */}
      <section className={cn(
          "relative py-32 px-6 border-y",
          isDark ? "border-zinc-800 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50"
      )}>
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className={cn(
              "text-3xl md:text-5xl font-extralight tracking-tight mb-4",
              isDark ? "text-zinc-100" : "text-zinc-900"
            )}>
              Built For Everyone
            </h2>
            <p className={cn(
              "text-lg max-w-2xl mx-auto",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              Whether you&apos;re running a hosting business or managing servers for your gaming community.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {targetUsers.map((user, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="h-full">
                <div className={cn(
                  "relative p-6 border transition-all hover:scale-[1.02] group h-full flex flex-col text-center",
                  isDark
                    ? "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-lg"
                )}>
                  <div className={cn(
                    "w-14 h-14 mx-auto mb-4 flex items-center justify-center border",
                    isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-200 bg-zinc-50"
                  )}>
                    <user.icon className={cn(
                      "w-7 h-7",
                      isDark ? "text-zinc-400" : "text-zinc-600"
                    )} />
                  </div>
                  <h3 className={cn(
                    "text-base font-medium mb-2 flex-shrink-0",
                    isDark ? "text-zinc-100" : "text-zinc-900"
                  )}>
                    {user.title}
                  </h3>
                  <p className={cn(
                    "text-sm leading-relaxed flex-grow",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )}>
                    {user.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section className="relative py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            {/* Left: Text Content */}
            <AnimatedSection>
              <h2 className={cn(
                "text-3xl md:text-4xl font-extralight tracking-tight mb-6",
                isDark ? "text-zinc-100" : "text-zinc-900"
              )}>
                Modern Architecture
              </h2>
              <p className={cn(
                "text-lg mb-8 leading-relaxed",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}>
                StellarStack separates your control plane from your game server nodes. Deploy the panel on your central server, then connect unlimited nodes running our lightweight Rust daemon.
              </p>
              <div className="space-y-4">
                {[
                  {
                    title: "Containerized Services",
                    description: "Each service (Next.js, Hono API, PostgreSQL, Redis) runs in its own Docker container with Traefik for routing.",
                  },
                  {
                    title: "Multi-Node Support",
                    description: "Connect unlimited nodes (dedicated servers, VPS, home machines) via Rust daemons.",
                  },
                  {
                    title: "Built-in Monitoring",
                    description: "Prometheus + Grafana for metrics and dashboards, with Watchtower for automatic container updates.",
                  },
                  {
                    title: "Zero-Trust Security",
                    description: "mTLS between components, signed JWT tokens for console access, and comprehensive audit logging.",
                  },
                ].map((feature, i) => (
                  <div key={i} className="flex gap-4">
                    <div className={cn(
                      "w-6 h-6 flex-shrink-0 flex items-center justify-center border mt-0.5",
                      isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-white"
                    )}>
                      <BsCheckCircle className={cn(
                        "w-3.5 h-3.5",
                        isDark ? "text-green-500" : "text-green-600"
                      )} />
                    </div>
                    <div>
                      <h4 className={cn(
                        "text-sm font-medium mb-1",
                        isDark ? "text-zinc-200" : "text-zinc-800"
                      )}>
                        {feature.title}
                      </h4>
                      <p className={cn(
                        "text-sm",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}>
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Architecture Toggle */}
              <div className="flex items-center gap-4 mt-8 pt-6 border-t border-zinc-700/50">
                <Label
                  htmlFor="arch-toggle"
                  className={cn(
                    "text-sm font-medium cursor-pointer transition-colors",
                    !isEnterpriseArch
                      ? isDark ? "text-zinc-100" : "text-zinc-900"
                      : isDark ? "text-zinc-500" : "text-zinc-400"
                  )}
                >
                  Single Node
                </Label>
                <Switch
                  id="arch-toggle"
                  checked={isEnterpriseArch}
                  onCheckedChange={setIsEnterpriseArch}
                />
                <Label
                  htmlFor="arch-toggle"
                  className={cn(
                    "text-sm font-medium cursor-pointer transition-colors",
                    isEnterpriseArch
                      ? isDark ? "text-zinc-100" : "text-zinc-900"
                      : isDark ? "text-zinc-500" : "text-zinc-400"
                  )}
                >
                  Multi-Node
                </Label>
              </div>
            </AnimatedSection>

            {/* Right: Architecture Diagram */}
            <AnimatedSection delay={0.2}>
              <div className={cn(
                "relative p-6 border font-mono text-xs",
                isDark
                  ? "border-zinc-700 bg-zinc-900/50"
                  : "border-zinc-300 bg-white"
              )}>
                {/* Corner decorations */}
                <div className={cn("absolute top-0 left-0 w-3 h-3 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                <div className={cn("absolute top-0 right-0 w-3 h-3 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
                <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

                {/* Traefik */}
                <div className={cn(
                  "border p-2 mb-3 text-center",
                  isDark ? "border-blue-500/50 bg-blue-900/20" : "border-blue-300 bg-blue-50"
                )}>
                  <div className={cn("text-[10px] uppercase tracking-widest", isDark ? "text-blue-400" : "text-blue-600")}>
                    Traefik — Reverse Proxy + SSL
                  </div>
                </div>

                {/* Connection Line */}
                <div className="flex justify-center mb-3">
                  <div className={cn("h-4 border-l-2 border-dashed", isDark ? "border-zinc-600" : "border-zinc-300")} />
                </div>

                {/* Control Plane with Watchtower */}
                <div className={cn(
                  "border p-4 mb-3 relative",
                  isDark ? "border-zinc-700 bg-zinc-800/30" : "border-zinc-200 bg-zinc-50"
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("text-[9px] uppercase tracking-widest", isDark ? "text-zinc-400" : "text-zinc-500")}>
                      Control Plane
                    </div>
                    <div className={cn(
                      "text-[8px] uppercase tracking-widest px-2 py-0.5 border",
                      isDark ? "border-green-500/50 bg-green-900/20 text-green-400" : "border-green-300 bg-green-50 text-green-600"
                    )}>
                      Watchtower
                    </div>
                  </div>

                  {/* Control Plane Services */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: "Next.js", desc: "Frontend" },
                      { name: "Hono", desc: "API" },
                      { name: "PostgreSQL", desc: "Database" },
                      { name: "Redis", desc: "Cache" },
                    ].map((s) => (
                      <div key={s.name} className={cn("text-center p-2 border", isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50")}>
                        <div className={isDark ? "text-zinc-300" : "text-zinc-700"}>{s.name}</div>
                        <div className={cn("text-[8px]", isDark ? "text-zinc-600" : "text-zinc-400")}>{s.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connection indicator */}
                <div className="flex justify-center mb-3">
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1 border",
                    isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-100"
                  )}>
                    <div className={cn("h-px w-6", isDark ? "bg-zinc-600" : "bg-zinc-300")} />
                    <div className={cn("text-[9px] uppercase tracking-wider", isDark ? "text-zinc-400" : "text-zinc-500")}>
                      mTLS + WebSocket
                    </div>
                    <div className={cn("h-px w-6", isDark ? "bg-zinc-600" : "bg-zinc-300")} />
                  </div>
                </div>

                {/* Game Node(s) with Watchtower */}
                <div className={cn(
                  "border p-4 mb-3 relative",
                  isDark ? "border-zinc-700 bg-zinc-800/30" : "border-zinc-200 bg-zinc-50"
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("text-[9px] uppercase tracking-widest", isDark ? "text-zinc-400" : "text-zinc-500")}>
                      {isEnterpriseArch ? "Game Nodes" : "Game Node"}
                    </div>
                    <div className={cn(
                      "text-[8px] uppercase tracking-widest px-2 py-0.5 border",
                      isDark ? "border-green-500/50 bg-green-900/20 text-green-400" : "border-green-300 bg-green-50 text-green-600"
                    )}>
                      Watchtower
                    </div>
                  </div>

                  {isEnterpriseArch ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { name: "Node 1", location: "US" },
                        { name: "Node 2", location: "EU" },
                        { name: "Node 3", location: "Asia" },
                      ].map((node) => (
                        <div key={node.name} className={cn("text-center p-2 border", isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50")}>
                          <BsServer className={cn("w-3 h-3 mx-auto mb-1", isDark ? "text-zinc-500" : "text-zinc-400")} />
                          <div className={cn("text-[9px]", isDark ? "text-zinc-300" : "text-zinc-700")}>Rust Daemon</div>
                          <div className={cn("text-[8px]", isDark ? "text-zinc-600" : "text-zinc-400")}>{node.location}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={cn("text-center p-3 border", isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50")}>
                      <BsServer className={cn("w-4 h-4 mx-auto mb-1", isDark ? "text-zinc-500" : "text-zinc-400")} />
                      <div className={isDark ? "text-zinc-300" : "text-zinc-700"}>Rust Daemon</div>
                      <div className={cn("text-[8px]", isDark ? "text-zinc-600" : "text-zinc-400")}>Manages game servers</div>
                    </div>
                  )}
                </div>

                {/* Monitoring */}
                <div className={cn(
                  "border p-2 text-center",
                  isDark ? "border-yellow-500/30 bg-yellow-900/10" : "border-yellow-200 bg-yellow-50"
                )}>
                  <div className={cn("text-[9px] uppercase tracking-widest", isDark ? "text-yellow-400" : "text-yellow-600")}>
                    Prometheus + Grafana
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section id="gallery" className="relative py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className={cn(
              "text-3xl md:text-5xl font-extralight tracking-tight mb-4",
              isDark ? "text-zinc-100" : "text-zinc-900"
            )}>
              See It In Action
            </h2>
            <p className={cn(
              "text-lg max-w-2xl mx-auto",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              Screenshots and demos showcasing the StellarStack experience. Click to zoom.
            </p>
          </AnimatedSection>

          {/* Gallery Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { id: 1, title: "Dashboard Overview", image: "https://placehold.co/800x450/18181b/71717a?text=Dashboard+Overview" },
              { id: 2, title: "Server Console", image: "https://placehold.co/800x450/18181b/71717a?text=Server+Console" },
              { id: 3, title: "File Manager", image: "https://placehold.co/800x450/18181b/71717a?text=File+Manager" },
              { id: 4, title: "Node Management", image: "https://placehold.co/800x450/18181b/71717a?text=Node+Management" },
              { id: 5, title: "User Permissions", image: "https://placehold.co/800x450/18181b/71717a?text=User+Permissions" },
              { id: 6, title: "Monitoring", image: "https://placehold.co/800x450/18181b/71717a?text=Monitoring" },
            ].map((item) => (
              <AnimatedSection key={item.id} delay={item.id * 0.05} className="h-full">
                <div className={cn(
                  "relative border transition-all hover:scale-[1.02] group",
                  isDark
                    ? "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                )}>
                  {item.image ? (
                    <Zoom>
                      <img
                        src={item.image}
                        alt={item.title}
                        width={800}
                        height={450}
                        className="w-full h-auto block"
                      />
                    </Zoom>
                  ) : (
                    /* Placeholder content */
                    <div className="aspect-video flex flex-col items-center justify-center">
                      <BsImage className={cn(
                        "w-12 h-12 mb-3",
                        isDark ? "text-zinc-700" : "text-zinc-300"
                      )} />
                      <span className={cn(
                        "text-sm font-medium mb-1",
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      )}>
                        {item.title}
                      </span>
                      <span className={cn(
                        "text-xs uppercase tracking-wider",
                        isDark ? "text-zinc-600" : "text-zinc-400"
                      )}>
                        Coming Soon
                      </span>
                    </div>
                  )}
                  {/* Corner decorations */}
                  <div className={cn(
                    "absolute top-0 left-0 w-3 h-3 border-t border-l transition-colors pointer-events-none",
                    isDark ? "border-zinc-700 group-hover:border-zinc-500" : "border-zinc-300 group-hover:border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute top-0 right-0 w-3 h-3 border-t border-r transition-colors pointer-events-none",
                    isDark ? "border-zinc-700 group-hover:border-zinc-500" : "border-zinc-300 group-hover:border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute bottom-0 left-0 w-3 h-3 border-b border-l transition-colors pointer-events-none",
                    isDark ? "border-zinc-700 group-hover:border-zinc-500" : "border-zinc-300 group-hover:border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute bottom-0 right-0 w-3 h-3 border-b border-r transition-colors pointer-events-none",
                    isDark ? "border-zinc-700 group-hover:border-zinc-500" : "border-zinc-300 group-hover:border-zinc-400"
                  )} />
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack Carousel */}
      <section id="tech" className={cn(
        "relative py-24 border-y",
        isDark ? "border-zinc-800 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50"
      )}>
        <AnimatedSection className="max-w-7xl mx-auto px-6 mb-12">
          <div className="text-center">
            <h2 className={cn(
              "text-2xl md:text-3xl font-extralight tracking-tight mb-4",
              isDark ? "text-zinc-100" : "text-zinc-900"
            )}>
              Built with Modern Technology
            </h2>
            <p className={cn(
              "text-sm max-w-xl mx-auto",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              Powered by the best tools in the ecosystem for performance, reliability, and developer experience.
            </p>
          </div>
        </AnimatedSection>

        {/* Swiper Carousel */}
        <div className="relative">
          {/* Fade edges */}
          <div className={cn(
            "absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none",
            isDark
              ? "bg-gradient-to-r from-[#0b0b0a] to-transparent"
              : "bg-gradient-to-r from-zinc-50 to-transparent"
          )} />
          <div className={cn(
            "absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none",
            isDark
              ? "bg-gradient-to-l from-[#0b0b0a] to-transparent"
              : "bg-gradient-to-l from-zinc-50 to-transparent"
          )} />

          <Swiper
            modules={[Autoplay]}
            slidesPerView="auto"
            spaceBetween={48}
            loop={true}
            speed={8000}
            autoplay={{
              delay: 1,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
            }}
            onSwiper={(swiper) => {
              swiper.autoplay.start();
            }}
            allowTouchMove={false}
            className="[&_.swiper-wrapper]:!ease-linear"
          >
            {[...technologies, ...technologies, ...technologies].map((tech, i) => (
              <SwiperSlide key={i} className="!w-auto">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex items-center justify-center cursor-pointer transition-all hover:scale-110",
                        isDark ? "text-zinc-500 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-700"
                      )}
                    >
                      <tech.Icon className="w-10 h-10" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {tech.name}
                  </TooltipContent>
                </Tooltip>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-32 px-6">
        <AnimatedSection className="max-w-4xl mx-auto text-center">
          <h2 className={cn(
            "text-3xl md:text-5xl font-extralight tracking-tight mb-6",
            isDark ? "text-zinc-100" : "text-zinc-900"
          )}>
            Ready to Self-Host?
          </h2>
          <p className={cn(
            "text-lg mb-10 max-w-xl mx-auto",
            isDark ? "text-zinc-400" : "text-zinc-600"
          )}>
            Run the install script on your VPS or dedicated server. Basic Linux knowledge required. Free and open source forever.
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

export default LandingPage;
