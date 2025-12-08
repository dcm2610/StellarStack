"use client";

import { useState, useEffect, useCallback, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { motion } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog";
import { Spinner } from "@workspace/ui/components/spinner";
import { Slider } from "@workspace/ui/components/slider";
import { BsSun, BsMoon, BsExclamationTriangle, BsCheckCircle, BsGlobe, BsGeoAlt, BsCheck, BsLayers } from "react-icons/bs";

interface ServerSettings {
  name: string;
  description: string;
  serverType: string;
  cpuLimit: number;
  memoryLimit: number;
  diskLimit: number;
  oomDisabled: boolean;
}

interface ServerTypeOption {
  id: string;
  name: string;
  category: string;
}

const serverTypes: ServerTypeOption[] = [
  // Minecraft
  { id: "mc-paper", name: "Paper", category: "Minecraft" },
  { id: "mc-spigot", name: "Spigot", category: "Minecraft" },
  { id: "mc-bukkit", name: "Bukkit", category: "Minecraft" },
  { id: "mc-vanilla", name: "Vanilla", category: "Minecraft" },
  { id: "mc-forge", name: "Forge", category: "Minecraft" },
  { id: "mc-fabric", name: "Fabric", category: "Minecraft" },
  { id: "mc-purpur", name: "Purpur", category: "Minecraft" },
  { id: "mc-bungeecord", name: "BungeeCord", category: "Minecraft" },
  { id: "mc-velocity", name: "Velocity", category: "Minecraft" },
  // Survival/Sandbox
  { id: "rust", name: "Rust", category: "Survival" },
  { id: "ark", name: "ARK: Survival Evolved", category: "Survival" },
  { id: "valheim", name: "Valheim", category: "Survival" },
  { id: "terraria", name: "Terraria", category: "Survival" },
  { id: "7dtd", name: "7 Days to Die", category: "Survival" },
  // Factory/Building
  { id: "satisfactory", name: "Satisfactory", category: "Factory" },
  { id: "factorio", name: "Factorio", category: "Factory" },
  // FPS/Shooters
  { id: "csgo", name: "Counter-Strike 2", category: "FPS" },
  { id: "tf2", name: "Team Fortress 2", category: "FPS" },
  { id: "gmod", name: "Garry's Mod", category: "FPS" },
  // Other
  { id: "palworld", name: "Palworld", category: "Other" },
  { id: "vrising", name: "V Rising", category: "Other" },
  { id: "projectzomboid", name: "Project Zomboid", category: "Other" },
];

interface Location {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
  flag: string;
}

interface LocationPing {
  locationId: string;
  ping: number | null;
  status: "pending" | "pinging" | "done" | "error";
}

const locations: Location[] = [
  // North America
  { id: "us-west-1", name: "US West 1", city: "Los Angeles", country: "USA", region: "North America", flag: "🇺🇸" },
  { id: "us-west-2", name: "US West 2", city: "Seattle", country: "USA", region: "North America", flag: "🇺🇸" },
  { id: "us-central-1", name: "US Central", city: "Dallas", country: "USA", region: "North America", flag: "🇺🇸" },
  { id: "us-east-1", name: "US East 1", city: "New York", country: "USA", region: "North America", flag: "🇺🇸" },
  { id: "us-east-2", name: "US East 2", city: "Miami", country: "USA", region: "North America", flag: "🇺🇸" },
  { id: "ca-central-1", name: "Canada Central", city: "Toronto", country: "Canada", region: "North America", flag: "🇨🇦" },
  // Europe
  { id: "eu-west-1", name: "EU West 1", city: "London", country: "UK", region: "Europe", flag: "🇬🇧" },
  { id: "eu-west-2", name: "EU West 2", city: "Paris", country: "France", region: "Europe", flag: "🇫🇷" },
  { id: "eu-west-3", name: "EU West 3", city: "Amsterdam", country: "Netherlands", region: "Europe", flag: "🇳🇱" },
  { id: "eu-central-1", name: "EU Central 1", city: "Frankfurt", country: "Germany", region: "Europe", flag: "🇩🇪" },
  { id: "eu-central-2", name: "EU Central 2", city: "Warsaw", country: "Poland", region: "Europe", flag: "🇵🇱" },
  { id: "eu-north-1", name: "EU North", city: "Stockholm", country: "Sweden", region: "Europe", flag: "🇸🇪" },
  { id: "eu-south-1", name: "EU South", city: "Milan", country: "Italy", region: "Europe", flag: "🇮🇹" },
  // Asia Pacific
  { id: "ap-east-1", name: "Asia Pacific East", city: "Hong Kong", country: "Hong Kong", region: "Asia Pacific", flag: "🇭🇰" },
  { id: "ap-southeast-1", name: "Asia Pacific SE 1", city: "Singapore", country: "Singapore", region: "Asia Pacific", flag: "🇸🇬" },
  { id: "ap-southeast-2", name: "Asia Pacific SE 2", city: "Sydney", country: "Australia", region: "Asia Pacific", flag: "🇦🇺" },
  { id: "ap-northeast-1", name: "Asia Pacific NE 1", city: "Tokyo", country: "Japan", region: "Asia Pacific", flag: "🇯🇵" },
  { id: "ap-northeast-2", name: "Asia Pacific NE 2", city: "Seoul", country: "South Korea", region: "Asia Pacific", flag: "🇰🇷" },
  { id: "ap-south-1", name: "Asia Pacific South", city: "Mumbai", country: "India", region: "Asia Pacific", flag: "🇮🇳" },
  // South America
  { id: "sa-east-1", name: "South America East", city: "São Paulo", country: "Brazil", region: "South America", flag: "🇧🇷" },
  { id: "sa-west-1", name: "South America West", city: "Santiago", country: "Chile", region: "South America", flag: "🇨🇱" },
  // Africa & Middle East
  { id: "me-south-1", name: "Middle East", city: "Dubai", country: "UAE", region: "Middle East", flag: "🇦🇪" },
  { id: "af-south-1", name: "Africa South", city: "Cape Town", country: "South Africa", region: "Africa", flag: "🇿🇦" },
];

const defaultSettings: ServerSettings = {
  name: "US-WEST-NODE-1",
  description: "Primary Minecraft server for US West region",
  serverType: "mc-paper",
  cpuLimit: 200,
  memoryLimit: 4096,
  diskLimit: 10240,
  oomDisabled: false,
};

// Group server types by category
const serverTypesByCategory = serverTypes.reduce<Record<string, ServerTypeOption[]>>((acc, type) => {
  const category = type.category;
  if (!acc[category]) {
    acc[category] = [];
  }
  acc[category]!.push(type);
  return acc;
}, {});

const SettingsPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<ServerSettings>(defaultSettings);
  const [originalSettings, setOriginalSettings] = useState<ServerSettings>(defaultSettings);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reinstallModalOpen, setReinstallModalOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  // Transfer modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [locationPings, setLocationPings] = useState<LocationPing[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [currentLocation] = useState("us-west-1"); // Current server location
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingCooldown, setPingCooldown] = useState(0);

  // Server splitting state
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitResources, setSplitResources] = useState({
    cpu: 50,
    memory: 50,
    disk: 50,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  // Simulate pinging locations one by one when modal opens
  const startPinging = useCallback(() => {
    if (isPinging || pingCooldown > 0) return;

    setIsPinging(true);

    // Initialize all locations as pending
    const initialPings: LocationPing[] = locations.map(loc => ({
      locationId: loc.id,
      ping: null,
      status: "pending",
    }));
    setLocationPings(initialPings);
    setSelectedLocation(null);

    // Calculate total ping duration
    const totalDuration = locations.length * 150 + 500;

    // Ping each location with a staggered delay
    locations.forEach((location, index) => {
      // Mark as pinging
      setTimeout(() => {
        setLocationPings(prev => prev.map(p =>
          p.locationId === location.id ? { ...p, status: "pinging" } : p
        ));
      }, index * 150);

      // Complete with random ping value
      setTimeout(() => {
        const basePing = Math.random() * 150 + 20; // 20-170ms base
        // Add regional variation
        let ping = basePing;
        if (location.region === "North America") ping = Math.random() * 60 + 15;
        else if (location.region === "Europe") ping = Math.random() * 80 + 40;
        else if (location.region === "Asia Pacific") ping = Math.random() * 100 + 80;
        else if (location.region === "South America") ping = Math.random() * 80 + 100;
        else ping = Math.random() * 100 + 120;

        // Small chance of error
        const hasError = Math.random() < 0.05;

        setLocationPings(prev => prev.map(p =>
          p.locationId === location.id
            ? { ...p, ping: hasError ? null : Math.round(ping), status: hasError ? "error" : "done" }
            : p
        ));
      }, index * 150 + 300 + Math.random() * 200);
    });

    // Set pinging to false and start cooldown after all pings complete
    setTimeout(() => {
      setIsPinging(false);
      setPingCooldown(10); // 10 second cooldown
    }, totalDuration);
  }, [isPinging, pingCooldown]);

  // Cooldown timer
  useEffect(() => {
    if (pingCooldown > 0) {
      const timer = setTimeout(() => {
        setPingCooldown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [pingCooldown]);

  useEffect(() => {
    if (transferModalOpen) {
      startPinging();
    }
  }, [transferModalOpen, startPinging]);

  const handleTransfer = () => {
    if (!selectedLocation) return;
    setTransferConfirmOpen(true);
  };

  const confirmTransfer = () => {
    setIsTransferring(true);
    setTransferConfirmOpen(false);
    // Simulate transfer
    setTimeout(() => {
      setIsTransferring(false);
      setTransferModalOpen(false);
      // Would update server location here
    }, 3000);
  };

  const getPingColor = (ping: number | null) => {
    if (ping === null) return isDark ? "text-red-400" : "text-red-600";
    if (ping < 50) return isDark ? "text-green-400" : "text-green-600";
    if (ping < 100) return isDark ? "text-amber-400" : "text-amber-600";
    return isDark ? "text-red-400" : "text-red-600";
  };

  // Group locations by region
  const locationsByRegion = locations.reduce<Record<string, Location[]>>((acc, location) => {
    const region = location.region;
    if (!acc[region]) {
      acc[region] = [];
    }
    acc[region]!.push(location);
    return acc;
  }, {});

  if (!mounted) return null;

  const handleSettingChange = <K extends keyof ServerSettings>(key: K, value: ServerSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const handleSave = () => {
    setOriginalSettings({ ...settings });
    setSaveModalOpen(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings({ ...originalSettings });
  };

  const handleReinstall = () => {
    setReinstallModalOpen(false);
    // Would trigger reinstall here
  };

  // Server split handler
  const handleSplitServer = () => {
    // Would trigger server split here
    setSplitModalOpen(false);
  };

  return (
    <div className={cn(
      "min-h-full transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <SidebarTrigger className={cn(
                "transition-all hover:scale-110 active:scale-95",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )} />
              <div>
                <h1 className={cn(
                  "text-2xl font-light tracking-wider",
                  isDark ? "text-zinc-100" : "text-zinc-800"
                )}>
                  SERVER SETTINGS
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  Server {serverId} • Configuration
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className={cn(
                    "transition-all gap-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                  )}
                >
                  <span className="text-xs uppercase tracking-wider">Reset</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveModalOpen(true)}
                disabled={!hasChanges}
                className={cn(
                  "transition-all gap-2",
                  saved
                    ? isDark
                      ? "border-green-500/50 text-green-400"
                      : "border-green-400 text-green-600"
                    : isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 disabled:opacity-40"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400 disabled:opacity-40"
                )}
              >
                {saved ? (
                  <>
                    <BsCheckCircle className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-wider">Saved</span>
                  </>
                ) : (
                  <span className="text-xs uppercase tracking-wider">Save Changes</span>
                )}
              </Button>
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

          {/* General Settings */}
          <div className={cn(
            "relative p-6 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-sm font-medium uppercase tracking-wider mb-6",
              isDark ? "text-zinc-300" : "text-zinc-700"
            )}>
              General
            </h2>

            <div className="space-y-4">
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Server Name
                </label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => handleSettingChange("name", e.target.value)}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Description
                </label>
                <textarea
                  value={settings.description}
                  onChange={(e) => handleSettingChange("description", e.target.value)}
                  rows={3}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors resize-none",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Server Type
                </label>
                <select
                  value={settings.serverType}
                  onChange={(e) => handleSettingChange("serverType", e.target.value)}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors cursor-pointer",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                >
                  {Object.entries(serverTypesByCategory).map(([category, types]) => (
                    <optgroup
                      key={category}
                      label={category}
                      className={isDark ? "bg-zinc-900 text-zinc-400" : "bg-white text-zinc-500"}
                    >
                      {types.map((type) => (
                        <option
                          key={type.id}
                          value={type.id}
                          className={isDark ? "bg-zinc-900 text-zinc-200" : "bg-white text-zinc-800"}
                        >
                          {type.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Resource Limits */}
          <div className={cn(
            "relative p-6 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-sm font-medium uppercase tracking-wider mb-6",
              isDark ? "text-zinc-300" : "text-zinc-700"
            )}>
              Resource Limits
            </h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  CPU Limit (%)
                </label>
                <input
                  type="number"
                  value={settings.cpuLimit}
                  onChange={(e) => handleSettingChange("cpuLimit", parseInt(e.target.value))}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Memory (MB)
                </label>
                <input
                  type="number"
                  value={settings.memoryLimit}
                  onChange={(e) => handleSettingChange("memoryLimit", parseInt(e.target.value))}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Disk (MB)
                </label>
                <input
                  type="number"
                  value={settings.diskLimit}
                  onChange={(e) => handleSettingChange("diskLimit", parseInt(e.target.value))}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.oomDisabled}
                  onChange={(e) => handleSettingChange("oomDisabled", e.target.checked)}
                  className={cn(
                    "w-4 h-4 border appearance-none cursor-pointer checked:bg-zinc-500",
                    isDark ? "border-zinc-600 bg-zinc-800" : "border-zinc-400 bg-white"
                  )}
                />
                <span className={cn(
                  "text-sm",
                  isDark ? "text-zinc-300" : "text-zinc-700"
                )}>
                  Disable OOM Killer
                </span>
              </label>
            </div>
          </div>

          {/* Server Location */}
          <div className={cn(
            "relative p-6 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-sm font-medium uppercase tracking-wider mb-6",
              isDark ? "text-zinc-300" : "text-zinc-700"
            )}>
              Server Location
            </h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 flex items-center justify-center border",
                  isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                )}>
                  <BsGlobe className={cn("w-5 h-5", isDark ? "text-zinc-400" : "text-zinc-500")} />
                </div>
                <div>
                  <p className={cn(
                    "text-sm font-medium",
                    isDark ? "text-zinc-200" : "text-zinc-700"
                  )}>
                    {locations.find(l => l.id === currentLocation)?.flag}{" "}
                    {locations.find(l => l.id === currentLocation)?.city},{" "}
                    {locations.find(l => l.id === currentLocation)?.country}
                  </p>
                  <p className={cn(
                    "text-xs",
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  )}>
                    {locations.find(l => l.id === currentLocation)?.region}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransferModalOpen(true)}
                className={cn(
                  "transition-all gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                <BsGeoAlt className="w-3 h-3" />
                <span className="text-xs uppercase tracking-wider">Transfer</span>
              </Button>
            </div>
          </div>

          {/* Server Splitting */}
          <div className={cn(
            "relative p-6 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-sm font-medium uppercase tracking-wider mb-6",
              isDark ? "text-zinc-300" : "text-zinc-700"
            )}>
              Server Splitting
            </h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 flex items-center justify-center border",
                  isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                )}>
                  <BsLayers className={cn("w-5 h-5", isDark ? "text-zinc-400" : "text-zinc-500")} />
                </div>
                <div>
                  <p className={cn(
                    "text-sm font-medium",
                    isDark ? "text-zinc-200" : "text-zinc-700"
                  )}>
                    Split Server Resources
                  </p>
                  <p className={cn(
                    "text-xs",
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  )}>
                    Divide this server into two separate instances
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSplitModalOpen(true)}
                className={cn(
                  "transition-all gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                <BsLayers className="w-3 h-3" />
                <span className="text-xs uppercase tracking-wider">Split Server</span>
              </Button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className={cn(
            "relative p-6 border",
            isDark
              ? "bg-gradient-to-b from-red-950/20 via-[#0f0f0f] to-[#0a0a0a] border-red-900/30"
              : "bg-gradient-to-b from-red-50 via-zinc-50 to-zinc-100 border-red-200"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-red-800" : "border-red-300")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-red-800" : "border-red-300")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-red-800" : "border-red-300")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-red-800" : "border-red-300")} />

            <div className="flex items-center gap-2 mb-6">
              <BsExclamationTriangle className={cn("w-4 h-4", isDark ? "text-red-400" : "text-red-600")} />
              <h2 className={cn(
                "text-sm font-medium uppercase tracking-wider",
                isDark ? "text-red-400" : "text-red-700"
              )}>
                Danger Zone
              </h2>
            </div>

            <div className="flex items-center justify-between">
                <div>
                  <h3 className={cn(
                    "text-sm font-medium",
                    isDark ? "text-zinc-200" : "text-zinc-700"
                  )}>
                    Reinstall Server
                  </h3>
                  <p className={cn(
                    "text-xs mt-1",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    This will reinstall the server with its current configuration
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReinstallModalOpen(true)}
                  className={cn(
                    "transition-all",
                    isDark
                      ? "border-red-900/60 text-red-400/80 hover:text-red-300 hover:border-red-700"
                      : "border-red-300 text-red-600 hover:text-red-700 hover:border-red-400"
                  )}
                >
                  <span className="text-xs uppercase tracking-wider">Reinstall</span>
                </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Save Confirmation Modal */}
      <ConfirmationModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        title="Save Settings"
        description="Are you sure you want to save these settings? Some changes may require a server restart to take effect."
        onConfirm={handleSave}
        confirmLabel="Save"
        isDark={isDark}
      />

      {/* Reinstall Confirmation Modal */}
      <ConfirmationModal
        open={reinstallModalOpen}
        onOpenChange={setReinstallModalOpen}
        title="Reinstall Server"
        description="Are you sure you want to reinstall this server? This will stop the server and reinstall it with its current configuration. All server files may be lost."
        onConfirm={handleReinstall}
        confirmLabel="Reinstall"
        variant="danger"
        isDark={isDark}
      />

      {/* Transfer Server Modal */}
      <Dialog open={transferModalOpen} onOpenChange={(open) => !isTransferring && setTransferModalOpen(open)}>
        <DialogContent className={cn(
          "sm:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col",
          isDark ? "bg-[#0f0f0f] border-zinc-800" : "bg-white border-zinc-200"
        )}>
          <DialogHeader>
            <DialogTitle className={cn(
              "text-lg font-light tracking-wider flex items-center gap-2",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}>
              <BsGlobe className="w-5 h-5" />
              TRANSFER SERVER
            </DialogTitle>
            <DialogDescription className={cn(
              "text-sm",
              isDark ? "text-zinc-500" : "text-zinc-500"
            )}>
              Select a new location for your server. Latency is measured from your current position.
            </DialogDescription>
          </DialogHeader>

          {isTransferring ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
              <Spinner className={cn("w-8 h-8", isDark ? "text-zinc-400" : "text-zinc-600")} />
              <p className={cn("text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}>
                Transferring server to {locations.find(l => l.id === selectedLocation)?.city}...
              </p>
              <p className={cn("text-xs", isDark ? "text-zinc-600" : "text-zinc-400")}>
                This may take several minutes. Do not close this window.
              </p>
            </div>
          ) : (
            <>
              {/* Current Location */}
              <div className={cn(
                "px-4 py-3 border mb-4",
                isDark ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50"
              )}>
                <div className="flex items-center gap-3">
                  <BsGeoAlt className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-zinc-500")} />
                  <div>
                    <span className={cn(
                      "text-[10px] uppercase tracking-wider",
                      isDark ? "text-zinc-500" : "text-zinc-400"
                    )}>
                      Current Location
                    </span>
                    <p className={cn(
                      "text-sm font-medium",
                      isDark ? "text-zinc-200" : "text-zinc-700"
                    )}>
                      {locations.find(l => l.id === currentLocation)?.flag}{" "}
                      {locations.find(l => l.id === currentLocation)?.city},{" "}
                      {locations.find(l => l.id === currentLocation)?.country}
                    </p>
                  </div>
                </div>
              </div>

              {/* Location Grid */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                {Object.entries(locationsByRegion).map(([region, regionLocations]) => (
                  <div key={region}>
                    <h3 className={cn(
                      "text-[10px] font-medium uppercase tracking-wider mb-2 sticky top-0 py-1",
                      isDark ? "text-zinc-500 bg-[#0f0f0f]" : "text-zinc-400 bg-white"
                    )}>
                      {region}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {regionLocations.map((location) => {
                        const pingData = locationPings.find(p => p.locationId === location.id);
                        const isCurrentLocation = location.id === currentLocation;
                        const isSelected = location.id === selectedLocation;
                        const hasError = pingData?.status === "error";
                        const isDisabled = isCurrentLocation || hasError;

                        return (
                          <motion.button
                            key={location.id}
                            onClick={() => !isDisabled && setSelectedLocation(location.id)}
                            disabled={isDisabled}
                            className={cn(
                              "relative flex items-center justify-between px-3 py-2.5 border text-left transition-all",
                              isDisabled
                                ? isDark
                                  ? "border-zinc-800 bg-zinc-900/30 opacity-50 cursor-not-allowed"
                                  : "border-zinc-200 bg-zinc-100/50 opacity-50 cursor-not-allowed"
                                : isSelected
                                  ? isDark
                                    ? "border-amber-600 bg-amber-950/30"
                                    : "border-amber-400 bg-amber-50"
                                  : isDark
                                    ? "border-zinc-800 hover:border-zinc-600 bg-zinc-900/30 hover:bg-zinc-800/50"
                                    : "border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50"
                            )}
                            whileHover={!isDisabled ? { scale: 1.01 } : undefined}
                            whileTap={!isDisabled ? { scale: 0.99 } : undefined}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-base">{location.flag}</span>
                              <div>
                                <p className={cn(
                                  "text-sm font-medium",
                                  isDark ? "text-zinc-200" : "text-zinc-700"
                                )}>
                                  {location.city}
                                </p>
                                <p className={cn(
                                  "text-[10px]",
                                  isDark ? "text-zinc-500" : "text-zinc-400"
                                )}>
                                  {location.country}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {pingData?.status === "pending" && (
                                <span className={cn(
                                  "text-xs",
                                  isDark ? "text-zinc-600" : "text-zinc-400"
                                )}>
                                  --
                                </span>
                              )}
                              {pingData?.status === "pinging" && (
                                <Spinner className={cn(
                                  "w-3 h-3",
                                  isDark ? "text-zinc-500" : "text-zinc-400"
                                )} />
                              )}
                              {pingData?.status === "done" && (
                                <span className={cn("text-xs font-mono", getPingColor(pingData.ping))}>
                                  {pingData.ping}ms
                                </span>
                              )}
                              {pingData?.status === "error" && (
                                <span className={cn("text-xs", isDark ? "text-red-400" : "text-red-600")}>
                                  Error
                                </span>
                              )}
                              {isSelected && (
                                <BsCheck className={cn(
                                  "w-4 h-4",
                                  isDark ? "text-amber-400" : "text-amber-600"
                                )} />
                              )}
                              {isCurrentLocation && (
                                <span className={cn(
                                  "text-[10px] uppercase tracking-wider",
                                  isDark ? "text-zinc-600" : "text-zinc-400"
                                )}>
                                  Current
                                </span>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className={cn(
                "flex items-center justify-between pt-4 mt-4 border-t",
                isDark ? "border-zinc-800" : "border-zinc-200"
              )}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startPinging}
                  disabled={isPinging || pingCooldown > 0}
                  className={cn(
                    "gap-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <span className="text-xs uppercase tracking-wider">
                    {isPinging ? "Pinging..." : pingCooldown > 0 ? `Wait ${pingCooldown}s` : "Refresh Ping"}
                  </span>
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferModalOpen(false)}
                    className={cn(
                      isDark
                        ? "border-zinc-700 text-zinc-400 hover:text-zinc-100"
                        : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    <span className="text-xs uppercase tracking-wider">Cancel</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTransfer}
                    disabled={!selectedLocation}
                    className={cn(
                      "gap-2",
                      isDark
                        ? "border-amber-700 text-amber-400 hover:text-amber-300 hover:border-amber-600 disabled:opacity-40"
                        : "border-amber-400 text-amber-600 hover:text-amber-700 disabled:opacity-40"
                    )}
                  >
                    <BsGlobe className="w-3 h-3" />
                    <span className="text-xs uppercase tracking-wider">Transfer</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer Confirmation Modal */}
      <ConfirmationModal
        open={transferConfirmOpen}
        onOpenChange={setTransferConfirmOpen}
        title="Confirm Transfer"
        description={`Are you sure you want to transfer this server to ${locations.find(l => l.id === selectedLocation)?.city}, ${locations.find(l => l.id === selectedLocation)?.country}? The server will be stopped during the transfer process.`}
        onConfirm={confirmTransfer}
        confirmLabel="Transfer"
        variant="danger"
        isDark={isDark}
      />

      {/* Server Split Modal */}
      <Dialog open={splitModalOpen} onOpenChange={setSplitModalOpen}>
        <DialogContent className={cn(
          "sm:max-w-lg",
          isDark ? "bg-[#0f0f0f] border-zinc-800" : "bg-white border-zinc-200"
        )}>
          <DialogHeader>
            <DialogTitle className={cn(
              "text-lg font-light tracking-wider flex items-center gap-2",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}>
              <BsLayers className="w-5 h-5" />
              SPLIT SERVER
            </DialogTitle>
            <DialogDescription className={cn(
              "text-sm",
              isDark ? "text-zinc-500" : "text-zinc-500"
            )}>
              Divide this server&apos;s resources into two separate instances.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className={cn(
              "p-3 border text-xs",
              isDark ? "border-amber-900/50 bg-amber-950/20 text-amber-400/80" : "border-amber-200 bg-amber-50 text-amber-700"
            )}>
              Splitting will create a new server with the allocated resources. The original server will retain the remaining resources.
            </div>

            {/* CPU Split */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  CPU Allocation
                </label>
                <span className={cn(
                  "text-xs font-mono",
                  isDark ? "text-zinc-400" : "text-zinc-600"
                )}>
                  {splitResources.cpu}% / {100 - splitResources.cpu}%
                </span>
              </div>
              <Slider
                min={10}
                max={90}
                step={5}
                value={[splitResources.cpu]}
                onValueChange={(value) => setSplitResources(prev => ({ ...prev, cpu: value[0] ?? prev.cpu }))}
                isDark={isDark}
              />
              <div className="flex justify-between mt-2">
                <span className={cn("text-[10px]", isDark ? "text-zinc-600" : "text-zinc-400")}>New Server</span>
                <span className={cn("text-[10px]", isDark ? "text-zinc-600" : "text-zinc-400")}>This Server</span>
              </div>
            </div>

            {/* Memory Split */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Memory Allocation
                </label>
                <span className={cn(
                  "text-xs font-mono",
                  isDark ? "text-zinc-400" : "text-zinc-600"
                )}>
                  {Math.round(settings.memoryLimit * splitResources.memory / 100)} MB / {Math.round(settings.memoryLimit * (100 - splitResources.memory) / 100)} MB
                </span>
              </div>
              <Slider
                min={10}
                max={90}
                step={5}
                value={[splitResources.memory]}
                onValueChange={(value) => setSplitResources(prev => ({ ...prev, memory: value[0] ?? prev.memory }))}
                isDark={isDark}
              />
              <div className="flex justify-between mt-2">
                <span className={cn("text-[10px]", isDark ? "text-zinc-600" : "text-zinc-400")}>New Server</span>
                <span className={cn("text-[10px]", isDark ? "text-zinc-600" : "text-zinc-400")}>This Server</span>
              </div>
            </div>

            {/* Disk Split */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Disk Allocation
                </label>
                <span className={cn(
                  "text-xs font-mono",
                  isDark ? "text-zinc-400" : "text-zinc-600"
                )}>
                  {Math.round(settings.diskLimit * splitResources.disk / 100)} MB / {Math.round(settings.diskLimit * (100 - splitResources.disk) / 100)} MB
                </span>
              </div>
              <Slider
                min={10}
                max={90}
                step={5}
                value={[splitResources.disk]}
                onValueChange={(value) => setSplitResources(prev => ({ ...prev, disk: value[0] ?? prev.disk }))}
                isDark={isDark}
              />
              <div className="flex justify-between mt-2">
                <span className={cn("text-[10px]", isDark ? "text-zinc-600" : "text-zinc-400")}>New Server</span>
                <span className={cn("text-[10px]", isDark ? "text-zinc-600" : "text-zinc-400")}>This Server</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSplitModalOpen(false)}
              className={cn(
                isDark
                  ? "border-zinc-700 text-zinc-400 hover:text-zinc-100"
                  : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
              )}
            >
              <span className="text-xs uppercase tracking-wider">Cancel</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSplitServer}
              className={cn(
                "gap-2",
                isDark
                  ? "border-zinc-600 text-zinc-300 hover:text-zinc-100"
                  : "border-zinc-400 text-zinc-700 hover:text-zinc-900"
              )}
            >
              <BsLayers className="w-3 h-3" />
              <span className="text-xs uppercase tracking-wider">Split Server</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
