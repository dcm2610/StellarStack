"use client";

import { useState, useEffect, useRef, type JSX } from "react";
import Link from "next/link";
import Image from "next/image";

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
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import { LiquidMetal } from "@paper-design/shaders-react";
import { CpuCard } from "@workspace/ui/components/cpu-card";
import { UsageMetricCard } from "@workspace/ui/components/usage-metric-card";
import { NetworkUsageCard } from "@workspace/ui/components/network-usage-card";
import { InstanceNameCard } from "@workspace/ui/components/instance-name-card";
import { ContainerControlsCard } from "@workspace/ui/components/container-controls-card";
import { Console } from "@workspace/ui/components/console";
import { DragDropGrid, GridItem } from "@workspace/ui/components/drag-drop-grid";
import type { GridItemConfig } from "@workspace/ui/components/drag-drop-grid";
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
  BsCheck,
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
    description:
      "Deploy and manage servers for Minecraft, Rust, Valheim, ARK, and dozens more games with pre-configured blueprints.",
  },
  {
    icon: BsShieldCheck,
    title: "Enterprise Security",
    description:
      "Role-based access control, API key management, 2FA support, and comprehensive audit logging.",
  },
  {
    icon: BsLightningCharge,
    title: "Instant Deployment",
    description:
      "Spin up new game servers in seconds with automated provisioning and configuration.",
  },
  {
    icon: BsTerminal,
    title: "Real-time Console",
    description:
      "Full console access with WebSocket-powered real-time log streaming and command execution.",
  },
  {
    icon: BsDatabase,
    title: "Database Management",
    description: "Built-in MySQL, PostgreSQL, and MongoDB database provisioning for game servers.",
  },
];

// Target users
const targetUsers = [
  {
    icon: BsServer,
    title: "VPS & Dedicated",
    description:
      "Got a VPS or dedicated server? Run the install script and have a full game server panel in minutes.",
  },
  {
    icon: BsPeople,
    title: "Gaming Communities",
    description:
      "Self-host servers for your clan or guild with role-based permissions and member access control.",
  },
  {
    icon: BsPersonWorkspace,
    title: "Homelab Enthusiasts",
    description:
      "Run game servers on your own hardware. Perfect for those who prefer full control over their infrastructure.",
  },
  {
    icon: BsCodeSlash,
    title: "Developers",
    description:
      "Contribute to the project, build custom blueprints, or extend functionality with the REST API.",
  },
];

// Security features
const securityFeatures = [
  {
    icon: BsKey,
    title: "Bcrypt Password Hashing",
    description:
      "Industry-standard bcrypt algorithm with adaptive cost factor for secure password storage.",
  },
  {
    icon: BsLock,
    title: "AES-256-CBC Encryption",
    description:
      "Military-grade encryption for sensitive data at rest, including API tokens and secrets.",
  },
  {
    icon: BsShieldLock,
    title: "HTTPS Everywhere",
    description: "TLS 1.3 support out of the box with automatic certificate management via Caddy.",
  },
  {
    icon: BsFileEarmarkLock,
    title: "mTLS Communication",
    description:
      "Mutual TLS authentication between control plane and daemon nodes for zero-trust security.",
  },
];

// Security layers
const securityLayers = [
  { layer: "Edge", items: ["DDoS Protection", "WAF Rules", "Rate Limiting", "Bot Protection"] },
  {
    layer: "Application",
    items: ["Authentication", "RBAC", "Input Validation", "CSRF Protection"],
  },
  {
    layer: "Infrastructure",
    items: ["Network Segmentation", "Firewall Rules", "Encrypted Storage", "Audit Logging"],
  },
  {
    layer: "Container",
    items: ["Resource Limits", "Network Isolation", "No Privileged Mode", "Seccomp Profiles"],
  },
];

// Initial sample server data
const initialServerData = {
  name: "US-WEST-MC-01",
  cpu: {
    usage: {
      percentage: 74,
      history: [45, 52, 48, 55, 62, 58, 65, 72, 68, 75, 70, 73, 78, 82, 76, 79, 85, 80, 77, 74],
    },
    cores: 8,
    frequency: 3.6,
  },
  memory: {
    usage: {
      percentage: 88,
      history: [60, 62, 65, 63, 68, 70, 72, 75, 73, 78, 76, 79, 82, 80, 85, 83, 87, 84, 86, 88],
    },
    used: 14.1,
    total: 16,
    type: "DDR4",
  },
  disk: {
    usage: {
      percentage: 51,
      history: [42, 42, 43, 43, 44, 44, 45, 45, 46, 46, 47, 47, 48, 48, 49, 49, 50, 50, 51, 51],
    },
    used: 51,
    total: 100,
    type: "NVMe SSD",
  },
  network: {
    download: 340,
    upload: 165,
    downloadHistory: [
      120, 145, 130, 180, 165, 200, 175, 220, 190, 240, 210, 260, 230, 280, 250, 300, 270, 320, 290,
      340,
    ],
    uploadHistory: [
      45, 52, 48, 65, 58, 72, 62, 85, 70, 95, 78, 105, 85, 120, 92, 135, 100, 150, 110, 165,
    ],
  },
  networkConfig: {
    publicIp: "45.33.128.72",
    privateIp: "192.168.1.100",
    openPorts: [
      { port: 25565, protocol: "TCP" },
      { port: 25575, protocol: "TCP" },
    ],
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
  { i: "cpu", size: "xs", minSize: "xxs", maxSize: "lg" },
  { i: "ram", size: "xs", minSize: "xxs", maxSize: "sm" },
  { i: "disk", size: "xs", minSize: "xxs", maxSize: "sm" },
  { i: "network-usage", size: "xs", minSize: "xxs", maxSize: "sm" },
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
const AnimatedSection = ({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) => {
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

const LandingPage = (): JSX.Element => {
  const [isEnterpriseArch, setIsEnterpriseArch] = useState(false);
  const [serverData, setServerData] = useState(initialServerData);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([
    {
      id: "1",
      timestamp: Date.now() - 5000,
      message: "Server started on port 25565",
      level: "info",
    },
    {
      id: "2",
      timestamp: Date.now() - 4000,
      message: 'Loading world "survival"...',
      level: "default",
    },
    {
      id: "3",
      timestamp: Date.now() - 3000,
      message: "Done! Server ready for connections",
      level: "info",
    },
    {
      id: "4",
      timestamp: Date.now() - 2000,
      message: 'Player "Steve" joined the game',
      level: "default",
    },
  ]);
  const lineIdRef = useRef(5);



  // Randomly update server data and add console lines
  useEffect(() => {

    const interval = setInterval(() => {
      setServerData((prev) => {
        const newCpu = Math.max(
          20,
          Math.min(95, prev.cpu.usage.percentage + (Math.random() - 0.5) * 10)
        );
        const newRam = Math.max(
          40,
          Math.min(95, prev.memory.usage.percentage + (Math.random() - 0.5) * 8)
        );
        const newDisk = Math.max(
          30,
          Math.min(80, prev.disk.usage.percentage + (Math.random() - 0.3) * 2)
        );
        const newDownload = Math.max(
          50,
          Math.min(500, prev.network.download + (Math.random() - 0.5) * 100)
        );
        const newUpload = Math.max(
          20,
          Math.min(250, prev.network.upload + (Math.random() - 0.5) * 50)
        );

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
        const randomMessage =
          sampleConsoleMessages[Math.floor(Math.random() * sampleConsoleMessages.length)] ??
          "Server tick completed";
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
  }, []);



  const homeNavLinks = [
    { href: "#features", label: "Features", isAnchor: true },
    { href: "#security", label: "Security", isAnchor: true },
    { href: "#tech", label: "Tech Stack", isAnchor: true },
  ];

  return (
    <div
      className="relative min-h-svh scroll-smooth transition-colors bg-[#0b0b0a]"
    >
      <AnimatedBackground />
      <FloatingDots count={20} />
      <Navigation links={homeNavLinks} />

      <section className="relative px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mt-24 max-w-4xl text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-6 text-5xl leading-[1.1] font-extralight tracking-tight md:text-7xl"
            >
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(135deg, #ffffff 0%, #a1a1aa 50%, #71717a 100%)",
                }}
              >
                Deploy Game Servers
              </span>
              <br />
              <span
                className="bg-clip-text font-light text-transparent"
                style={{
                  backgroundImage: "linear-gradient(135deg, #a1a1aa 0%, #71717a 50%, #52525b 100%)",
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
              className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed md:text-xl text-zinc-400"
            >
              The modern, open-source game server management panel. Self-host on your VPS or
              dedicated server with our install scripts. Works out of the box for anyone comfortable
              with Linux.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row"
            >
              {/* Liquid Metal Border Button - Docs */}
              <a href="https://docs.stellarstack.app" target="_blank" rel="noopener noreferrer">
                <div className="group relative h-[56px] w-[220px] transition-all hover:scale-[1.02]">
                  {/* Liquid Metal Border */}
                  <div className="absolute inset-0 overflow-hidden">
                    <LiquidMetal
                      width={220}
                      height={56}
                      colorBack="#aaaaac00"
                      colorTint="#ffffff"
                      shape="none"
                      repetition={2}
                      softness={0.1}
                      shiftRed={0}
                      shiftBlue={0}
                      distortion={0.07}
                      contour={0.4}
                      angle={70}
                      speed={0.2}
                      scale={5}
                      rotation={0}
                      fit="contain"
                    />
                  </div>
                  {/* Inner Button */}
                  <div
                    className="absolute inset-[2px] flex items-center justify-center gap-2 text-sm font-medium tracking-wider uppercase bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] text-zinc-100"
                  >
                    Read the Docs
                    <BsArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </a>

              {/* Regular Outline Button - GitHub */}
              <a
                href="https://github.com/stellarstack/stellarstack"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="outline"
                  className="gap-2 px-8 py-6 text-sm tracking-wider uppercase transition-all hover:scale-[1.02] border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/50"
                >
                  <BsGithub className="h-4 w-4" />
                  View on GitHub
                </Button>
              </a>
            </motion.div>
          </div>

          {/* Hero Image/Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="relative mx-auto mt-20 max-w-7xl"
          >
            {/* Floating Interactive Hint */}
            <div className="absolute -top-3 left-1/2 z-20 -translate-x-1/2">
              <div
                className="relative border px-4 py-2 backdrop-blur-sm border-zinc-700 bg-zinc-900/90 text-zinc-300"
              >
                {/* Corner accents */}
                <div className="absolute -top-px -left-px h-2 w-2 border-t border-l border-green-500" />
                <div className="absolute -top-px -right-px h-2 w-2 border-t border-r border-green-500" />
                <div className="absolute -bottom-px -left-px h-2 w-2 border-b border-l border-green-500" />
                <div className="absolute -right-px -bottom-px h-2 w-2 border-r border-b border-green-500" />

                <div className="flex items-center gap-3">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 bg-green-400" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  <span className="text-xs font-medium tracking-wider uppercase">
                    Interactive Demo
                  </span>
                  <span className="text-xs text-zinc-500">—</span>
                  <span className="text-xs text-zinc-400">
                    Drag cards & resize
                  </span>
                </div>

                {/* Animated arrow pointing down */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 animate-bounce">
                  <svg
                    width="12"
                    height="8"
                    viewBox="0 0 12 8"
                    className="text-green-500"
                    fill="currentColor"
                  >
                    <path d="M6 8L0 0h12L6 8z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Preview Container */}
            <div
              className="relative overflow-hidden border border-zinc-800 bg-zinc-900/50 shadow-2xl shadow-black/50"
            >
              {/* Window Controls */}
              <div
                className="flex items-center gap-2 border-b px-4 py-3 border-zinc-800 bg-zinc-900"
              >
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
                <span className="ml-4 text-xs text-zinc-500">
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
                  isDroppable={false}
                >
                  <div key="instance-name" className="h-full">
                    <GridItem itemId="instance-name" showRemoveHandle={false}>
                      <InstanceNameCard
                        itemId="instance-name"
                        instanceName={serverData.name}
                      />
                    </GridItem>
                  </div>

                  <div key="container-controls" className="h-full">
                    <GridItem itemId="container-controls" showRemoveHandle={false}>
                      <ContainerControlsCard
                        itemId="container-controls"
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
                        details={[
                          `${serverData.cpu.cores} CORES`,
                          `${serverData.cpu.frequency} GHz`,
                        ]}
                        history={serverData.cpu.usage.history}
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
                        details={[
                          `${serverData.memory.used} / ${serverData.memory.total} GB`,
                          serverData.memory.type,
                        ]}
                        history={serverData.memory.usage.history}
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
                        details={[
                          `${serverData.disk.used} / ${serverData.disk.total} GB`,
                          serverData.disk.type,
                        ]}
                        history={serverData.disk.usage.history}
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
                        isOffline={false}
                        labels={{ title: "NETWORK", download: "Download", upload: "Upload" }}
                      />
                    </GridItem>
                  </div>

                  <div key="console" className="h-full">
                    <GridItem itemId="console" showRemoveHandle={false}>
                      <Console lines={consoleLines} isOffline={false} />
                    </GridItem>
                  </div>
                </DragDropGrid>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <AnimatedSection className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extralight tracking-tight md:text-5xl text-zinc-100">
              Everything You Need
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-zinc-400">
              A complete solution for game server hosting with powerful features out of the box.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="h-full">
                <div className="group relative flex h-full flex-col border p-8 transition-all hover:scale-[1.02] border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50">
                  {/* Corner decorations */}
                  <div className="absolute top-0 left-0 h-3 w-3 border-t border-l transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="absolute top-0 right-0 h-3 w-3 border-t border-r transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="absolute bottom-0 left-0 h-3 w-3 border-b border-l transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="absolute right-0 bottom-0 h-3 w-3 border-r border-b transition-colors border-zinc-700 group-hover:border-zinc-500" />

                  <feature.icon className="mb-6 h-8 w-8 flex-shrink-0 text-zinc-400" />
                  <h3 className="mb-3 flex-shrink-0 text-lg font-medium text-zinc-100">
                    {feature.title}
                  </h3>
                  <p className="flex-grow text-sm leading-relaxed text-zinc-400">
                    {feature.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative border-y px-6 py-20 border-zinc-800 bg-zinc-900/50">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: "100%", label: "Open Source" },
              { value: "50+", label: "Game Templates" },
              { value: "MIT", label: "Licensed" },
              { value: "∞", label: "Self-Hosted" },
            ].map((stat, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="text-center">
                <div className="mb-2 text-4xl font-light md:text-5xl text-zinc-100">
                  {stat.value}
                </div>
                <div className="text-sm tracking-wider uppercase text-zinc-500">
                  {stat.label}
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For Section */}
      <section className="relative border-y px-6 py-32 border-zinc-800 bg-zinc-900/30">
        <div className="mx-auto max-w-7xl">
          <AnimatedSection className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extralight tracking-tight md:text-5xl text-zinc-100">
              Built For Everyone
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-zinc-400">
              Whether you&apos;re running a hosting business or managing servers for your gaming
              community.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {targetUsers.map((user, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="h-full">
                <div className="group relative flex h-full flex-col border p-6 text-center transition-all hover:scale-[1.02] border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border border-zinc-700 bg-zinc-800/50">
                    <user.icon className="h-7 w-7 text-zinc-400" />
                  </div>
                  <h3 className="mb-2 flex-shrink-0 text-base font-medium text-zinc-100">
                    {user.title}
                  </h3>
                  <p className="flex-grow text-sm leading-relaxed text-zinc-400">
                    {user.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section id="gallery" className="relative px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <AnimatedSection className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extralight tracking-tight md:text-5xl text-zinc-100">
              See It In Action
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-zinc-400">
              Screenshots and demos showcasing the StellarStack experience. Click to zoom.
            </p>
          </AnimatedSection>

          {/* Gallery Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                id: 1,
                title: "Dashboard Overview",
                image: "https://placehold.co/800x450/18181b/71717a?text=Dashboard+Overview",
              },
              {
                id: 2,
                title: "Server Console",
                image: "https://placehold.co/800x450/18181b/71717a?text=Server+Console",
              },
              {
                id: 3,
                title: "File Manager",
                image: "https://placehold.co/800x450/18181b/71717a?text=File+Manager",
              },
              {
                id: 4,
                title: "Node Management",
                image: "https://placehold.co/800x450/18181b/71717a?text=Node+Management",
              },
              {
                id: 5,
                title: "User Permissions",
                image: "https://placehold.co/800x450/18181b/71717a?text=User+Permissions",
              },
              {
                id: 6,
                title: "Monitoring",
                image: "https://placehold.co/800x450/18181b/71717a?text=Monitoring",
              },
            ].map((item) => (
              <AnimatedSection key={item.id} delay={item.id * 0.05} className="h-full">
                <div
                  className="group relative border transition-all hover:scale-[1.02] border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                >
                  {item.image ? (
                    <Zoom>
                      <img
                        src={item.image}
                        alt={item.title}
                        width={800}
                        height={450}
                        className="block h-auto w-full"
                      />
                    </Zoom>
                  ) : (
                    /* Placeholder content */
                    <div className="flex aspect-video flex-col items-center justify-center">
                      <BsImage className="mb-3 h-12 w-12 text-zinc-700" />
                      <span className="mb-1 text-sm font-medium text-zinc-500">
                        {item.title}
                      </span>
                      <span className="text-xs tracking-wider uppercase text-zinc-600">
                        Coming Soon
                      </span>
                    </div>
                  )}
                  {/* Corner decorations */}
                  <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t border-l transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t border-r transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l transition-colors border-zinc-700 group-hover:border-zinc-500" />
                  <div className="pointer-events-none absolute right-0 bottom-0 h-3 w-3 border-r border-b transition-colors border-zinc-700 group-hover:border-zinc-500" />
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack Carousel */}
      <section id="tech" className="relative border-y py-24 border-zinc-800 bg-zinc-900/30">
        <AnimatedSection className="mx-auto mb-12 max-w-7xl px-6">
          <div className="text-center">
            <h2 className="mb-4 text-2xl font-extralight tracking-tight md:text-3xl text-zinc-100">
              Built with Modern Technology
            </h2>
            <p className="mx-auto max-w-xl text-sm text-zinc-400">
              Powered by the best tools in the ecosystem for performance, reliability, and developer
              experience.
            </p>
          </div>
        </AnimatedSection>

        {/* Swiper Carousel */}
        <div className="relative">
          {/* Fade edges */}
          <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-24 bg-gradient-to-r from-[#0b0b0a] to-transparent" />
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-24 bg-gradient-to-l from-[#0b0b0a] to-transparent" />

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
                    <div className="flex cursor-pointer items-center justify-center transition-all hover:scale-110 text-zinc-500 hover:text-zinc-200">
                      <tech.Icon className="h-10 w-10" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{tech.name}</TooltipContent>
                </Tooltip>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="relative px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <AnimatedSection className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extralight tracking-tight md:text-5xl text-zinc-100">
              Why StellarStack?
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-zinc-400">
              See how we compare to other game server management solutions.
            </p>
          </AnimatedSection>

          <AnimatedSection delay={0.2}>
            <div className="overflow-x-auto border border-zinc-800">
              {/* Table Header */}
              <div className="grid grid-cols-[2fr_repeat(6,1fr)] gap-0 border-b text-xs font-medium border-zinc-800 bg-zinc-900/50 text-zinc-300">
                <div className="border-r p-4 border-zinc-800">
                  Feature
                </div>
                <div className="border-r p-4 text-center border-zinc-800 bg-green-900/20">
                  StellarStack
                </div>
                <div className="border-r p-4 text-center border-zinc-800">
                  Pterodactyl
                </div>
                <div className="border-r p-4 text-center border-zinc-800">
                  Pelican
                </div>
                <div className="border-r p-4 text-center border-zinc-800">
                  PufferPanel
                </div>
                <div className="border-r p-4 text-center border-zinc-800">
                  Crafty
                </div>
                <div className="p-4 text-center">AMP</div>
              </div>

              {/* Table Rows */}
              {[
                {
                  feature: "Free & Open Source",
                  stellar: true,
                  ptero: true,
                  pelican: true,
                  puffer: true,
                  crafty: true,
                  amp: false,
                },
                {
                  feature: "File Manager",
                  stellar: true,
                  ptero: true,
                  pelican: true,
                  puffer: true,
                  crafty: true,
                  amp: true,
                },
                {
                  feature: "Scheduled Tasks",
                  stellar: true,
                  ptero: true,
                  pelican: true,
                  puffer: false,
                  crafty: true,
                  amp: true,
                },
                {
                  feature: "Database Management",
                  stellar: true,
                  ptero: true,
                  pelican: true,
                  puffer: false,
                  crafty: false,
                  amp: true,
                },
                {
                  feature: "OAuth / SSO",
                  stellar: true,
                  ptero: false,
                  pelican: true,
                  puffer: true,
                  crafty: true,
                  amp: true,
                },
                {
                  feature: "Webhooks",
                  stellar: true,
                  ptero: false,
                  pelican: true,
                  puffer: false,
                  crafty: true,
                  amp: true,
                },
                {
                  feature: "Roles & Permissions",
                  stellar: true,
                  ptero: false,
                  pelican: true,
                  puffer: false,
                  crafty: true,
                  amp: true,
                },
                {
                  feature: "Remote Backups",
                  stellar: true,
                  ptero: true,
                  pelican: true,
                  puffer: false,
                  crafty: false,
                  amp: true,
                },
                {
                  feature: "One-Command Install",
                  stellar: true,
                  ptero: false,
                  pelican: false,
                  puffer: false,
                  crafty: false,
                  amp: false,
                },
                {
                  feature: "Modern Stack (Next.js)",
                  stellar: true,
                  ptero: false,
                  pelican: false,
                  puffer: false,
                  crafty: false,
                  amp: false,
                },
                {
                  feature: "Rust Daemon",
                  stellar: true,
                  ptero: false,
                  pelican: false,
                  puffer: false,
                  crafty: false,
                  amp: false,
                },
                {
                  feature: "Built-in Monitoring",
                  stellar: true,
                  ptero: false,
                  pelican: false,
                  puffer: false,
                  crafty: false,
                  amp: false,
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className={cn(
                    "grid grid-cols-[2fr_repeat(6,1fr)] gap-0 border-b text-xs last:border-b-0 border-zinc-800",
                    i % 2 === 0 ? "bg-zinc-900/30" : "bg-zinc-900/10"
                  )}
                >
                  <div className="border-r p-4 border-zinc-800 text-zinc-300">
                    {row.feature}
                  </div>
                  <div className="border-r p-4 text-center border-zinc-800 bg-green-900/10">
                    {row.stellar ? (
                      <BsCheck className="mx-auto h-5 w-5 text-green-500" />
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </div>
                  {[row.ptero, row.pelican, row.puffer, row.crafty, row.amp].map((val, j) => (
                    <div
                      key={j}
                      className="border-r p-4 text-center last:border-r-0 border-zinc-800"
                    >
                      {val ? (
                        <BsCheck className="mx-auto h-5 w-5 text-zinc-500" />
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative border-t px-6 py-32 border-zinc-800">
        <AnimatedSection className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-3xl font-extralight tracking-tight md:text-5xl text-zinc-100">
            Ready to Self-Host?
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-zinc-400">
            Run the install script on your VPS or dedicated server. Basic Linux knowledge required.
            Free and open source forever.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="https://docs.stellarstack.app" target="_blank" rel="noopener noreferrer">
              <Button className="gap-2 px-8 py-6 text-sm tracking-wider uppercase transition-all hover:scale-[1.02] bg-zinc-100 text-zinc-900 hover:bg-white">
                Read the Docs
                <BsArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <a
              href="https://github.com/stellarstack/stellarstack"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                className="gap-2 px-8 py-6 text-sm tracking-wider uppercase border-zinc-700 text-zinc-300 hover:border-zinc-500"
              >
                <BsGithub className="h-4 w-4" />
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

export default LandingPage;
