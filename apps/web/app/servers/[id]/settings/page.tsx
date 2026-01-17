"use client";

import { useState, useEffect, useCallback, type JSX } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog";
import { Spinner } from "@workspace/ui/components/spinner";
import { Slider } from "@workspace/ui/components/slider";
import {
  BsExclamationTriangle,
  BsCheckCircle,
  BsGlobe,
  BsGeoAlt,
  BsCheck,
  BsLayers,
} from "react-icons/bs";
import { servers } from "@/lib/api";
import { useServer } from "@/components/server-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { ServerSuspendedPlaceholder } from "@/components/server-suspended-placeholder";
import { toast } from "sonner";

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
  {
    id: "us-west-1",
    name: "US West 1",
    city: "Los Angeles",
    country: "USA",
    region: "North America",
    flag: "🇺🇸",
  },
  {
    id: "us-west-2",
    name: "US West 2",
    city: "Seattle",
    country: "USA",
    region: "North America",
    flag: "🇺🇸",
  },
  {
    id: "us-central-1",
    name: "US Central",
    city: "Dallas",
    country: "USA",
    region: "North America",
    flag: "🇺🇸",
  },
  {
    id: "us-east-1",
    name: "US East 1",
    city: "New York",
    country: "USA",
    region: "North America",
    flag: "🇺🇸",
  },
  {
    id: "us-east-2",
    name: "US East 2",
    city: "Miami",
    country: "USA",
    region: "North America",
    flag: "🇺🇸",
  },
  {
    id: "ca-central-1",
    name: "Canada Central",
    city: "Toronto",
    country: "Canada",
    region: "North America",
    flag: "🇨🇦",
  },
  // Europe
  {
    id: "eu-west-1",
    name: "EU West 1",
    city: "London",
    country: "UK",
    region: "Europe",
    flag: "🇬🇧",
  },
  {
    id: "eu-west-2",
    name: "EU West 2",
    city: "Paris",
    country: "France",
    region: "Europe",
    flag: "🇫🇷",
  },
  {
    id: "eu-west-3",
    name: "EU West 3",
    city: "Amsterdam",
    country: "Netherlands",
    region: "Europe",
    flag: "🇳🇱",
  },
  {
    id: "eu-central-1",
    name: "EU Central 1",
    city: "Frankfurt",
    country: "Germany",
    region: "Europe",
    flag: "🇩🇪",
  },
  {
    id: "eu-central-2",
    name: "EU Central 2",
    city: "Warsaw",
    country: "Poland",
    region: "Europe",
    flag: "🇵🇱",
  },
  {
    id: "eu-north-1",
    name: "EU North",
    city: "Stockholm",
    country: "Sweden",
    region: "Europe",
    flag: "🇸🇪",
  },
  {
    id: "eu-south-1",
    name: "EU South",
    city: "Milan",
    country: "Italy",
    region: "Europe",
    flag: "🇮🇹",
  },
  // Asia Pacific
  {
    id: "ap-east-1",
    name: "Asia Pacific East",
    city: "Hong Kong",
    country: "Hong Kong",
    region: "Asia Pacific",
    flag: "🇭🇰",
  },
  {
    id: "ap-southeast-1",
    name: "Asia Pacific SE 1",
    city: "Singapore",
    country: "Singapore",
    region: "Asia Pacific",
    flag: "🇸🇬",
  },
  {
    id: "ap-southeast-2",
    name: "Asia Pacific SE 2",
    city: "Sydney",
    country: "Australia",
    region: "Asia Pacific",
    flag: "🇦🇺",
  },
  {
    id: "ap-northeast-1",
    name: "Asia Pacific NE 1",
    city: "Tokyo",
    country: "Japan",
    region: "Asia Pacific",
    flag: "🇯🇵",
  },
  {
    id: "ap-northeast-2",
    name: "Asia Pacific NE 2",
    city: "Seoul",
    country: "South Korea",
    region: "Asia Pacific",
    flag: "🇰🇷",
  },
  {
    id: "ap-south-1",
    name: "Asia Pacific South",
    city: "Mumbai",
    country: "India",
    region: "Asia Pacific",
    flag: "🇮🇳",
  },
  // South America
  {
    id: "sa-east-1",
    name: "South America East",
    city: "São Paulo",
    country: "Brazil",
    region: "South America",
    flag: "🇧🇷",
  },
  {
    id: "sa-west-1",
    name: "South America West",
    city: "Santiago",
    country: "Chile",
    region: "South America",
    flag: "🇨🇱",
  },
  // Africa & Middle East
  {
    id: "me-south-1",
    name: "Middle East",
    city: "Dubai",
    country: "UAE",
    region: "Middle East",
    flag: "🇦🇪",
  },
  {
    id: "af-south-1",
    name: "Africa South",
    city: "Cape Town",
    country: "South Africa",
    region: "Africa",
    flag: "🇿🇦",
  },
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
const serverTypesByCategory = serverTypes.reduce<Record<string, ServerTypeOption[]>>(
  (acc, type) => {
    const category = type.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category]!.push(type);
    return acc;
  },
  {}
);

const SettingsPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server, isInstalling } = useServer();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<ServerSettings>(defaultSettings);
  const [originalSettings, setOriginalSettings] = useState<ServerSettings>(defaultSettings);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reinstallModalOpen, setReinstallModalOpen] = useState(false);
  const [isReinstalling, setIsReinstalling] = useState(false);
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

  // Simulate pinging locations one by one when modal opens
  const startPinging = useCallback(() => {
    if (isPinging || pingCooldown > 0) return;

    setIsPinging(true);

    // Initialize all locations as pending
    const initialPings: LocationPing[] = locations.map((loc) => ({
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
        setLocationPings((prev) =>
          prev.map((p) => (p.locationId === location.id ? { ...p, status: "pinging" } : p))
        );
      }, index * 150);

      // Complete with random ping value
      setTimeout(
        () => {
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

          setLocationPings((prev) =>
            prev.map((p) =>
              p.locationId === location.id
                ? {
                    ...p,
                    ping: hasError ? null : Math.round(ping),
                    status: hasError ? "error" : "done",
                  }
                : p
            )
          );
        },
        index * 150 + 300 + Math.random() * 200
      );
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
        setPingCooldown((prev) => prev - 1);
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
    if (ping === null) return "text-red-400";
    if (ping < 50) return "text-green-400";
    if (ping < 100) return "text-amber-400";
    return "text-red-400";
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

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        {/* Background is now rendered in the layout for persistence */}
        <ServerInstallingPlaceholder serverName={server?.name} />
      </div>
    );
  }

  if (server?.status === "SUSPENDED") {
    return (
      <div className="min-h-svh">
        <ServerSuspendedPlaceholder serverName={server?.name} />
      </div>
    );
  }

  const handleSettingChange = <K extends keyof ServerSettings>(
    key: K,
    value: ServerSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
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

  const handleReinstall = async () => {
    setIsReinstalling(true);
    try {
      await servers.reinstall(serverId);
      setReinstallModalOpen(false);
      toast.success("Server reinstalled successfully");
    } catch (error) {
      toast.error("Failed to reinstall server");
    } finally {
      setIsReinstalling(false);
    }
  };

  // Server split handler
  const handleSplitServer = () => {
    // Would trigger server split here
    setSplitModalOpen(false);
  };

  return (
    <div className="relative min-h-full transition-colors">
      {/* Background is now rendered in the layout for persistence */}

      <div className="relative p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                className={cn(
                  "transition-all hover:scale-110 active:scale-95",
                  "text-zinc-400 hover:text-zinc-100"
                )}
              />
              <div>
                <h1
                  className={cn(
                    "text-2xl font-light tracking-wider",
                    "text-zinc-100"
                  )}
                >
                  SERVER SETTINGS
                </h1>
                <p className={cn("mt-1 text-sm", "text-zinc-500")}>
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
                    "gap-2 transition-all",
                    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  )}
                >
                  <span className="text-xs tracking-wider uppercase">Reset</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveModalOpen(true)}
                disabled={!hasChanges}
                className={cn(
                  "gap-2 transition-all",
                  saved
                    ? "border-green-500/50 text-green-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
                )}
              >
                {saved ? (
                  <>
                    <BsCheckCircle className="h-4 w-4" />
                    <span className="text-xs tracking-wider uppercase">Saved</span>
                  </>
                ) : (
                  <span className="text-xs tracking-wider uppercase">Save Changes</span>
                )}
              </Button>

            </div>
          </div>

          {/* General Settings */}
          <div
            className={cn(
              "relative mb-6 border p-6",
              "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-2 w-2 border-t border-l",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-2 w-2 border-t border-r",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                "border-zinc-500"
              )}
            />

            <h2
              className={cn(
                "mb-6 text-sm font-medium tracking-wider uppercase",
                "text-zinc-300"
              )}
            >
              General
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  className={cn(
                    "text-[10px] font-medium tracking-wider uppercase",
                    "text-zinc-500"
                  )}
                >
                  Server Name
                </label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => handleSettingChange("name", e.target.value)}
                  className={cn(
                    "mt-2 w-full border px-3 py-2 text-sm transition-colors outline-none",
                    "border-zinc-700/50 bg-zinc-900/50 text-zinc-200 focus:border-zinc-500"
                  )}
                />
              </div>
              <div>
                <label
                  className={cn(
                    "text-[10px] font-medium tracking-wider uppercase",
                    "text-zinc-500"
                  )}
                >
                  Description
                </label>
                <textarea
                  value={settings.description}
                  onChange={(e) => handleSettingChange("description", e.target.value)}
                  rows={3}
                  className={cn(
                    "mt-2 w-full resize-none border px-3 py-2 text-sm transition-colors outline-none",
                    "border-zinc-700/50 bg-zinc-900/50 text-zinc-200 focus:border-zinc-500"
                  )}
                />
              </div>
              <div>
                <label
                  className={cn(
                    "text-[10px] font-medium tracking-wider uppercase",
                    "text-zinc-500"
                  )}
                >
                  Server Type
                </label>
                <select
                  value={settings.serverType}
                  onChange={(e) => handleSettingChange("serverType", e.target.value)}
                  className={cn(
                    "mt-2 w-full cursor-pointer border px-3 py-2 text-sm transition-colors outline-none",
                    "border-zinc-700/50 bg-zinc-900/50 text-zinc-200 focus:border-zinc-500"
                  )}
                >
                  {Object.entries(serverTypesByCategory).map(([category, types]) => (
                    <optgroup
                      key={category}
                      label={category}
                      className={"bg-zinc-900 text-zinc-400"}
                    >
                      {types.map((type) => (
                        <option
                          key={type.id}
                          value={type.id}
                          className={
                            "bg-zinc-900 text-zinc-200"
                          }
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

          {/* Resource Limits - DISABLED: User cannot modify resource limits from settings */}
          {/* Server Location - DISABLED: Server transfer feature is not yet implemented */}
          {/* Server Splitting - DISABLED: Server splitting feature is not yet implemented */}

          {/* Danger Zone */}
          <div
            className={cn(
              "relative border p-6",
              "border-red-900/30 bg-gradient-to-b from-red-950/20 via-[#0f0f0f] to-[#0a0a0a]"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-2 w-2 border-t border-l",
                "border-red-800"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-2 w-2 border-t border-r",
                "border-red-800"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                "border-red-800"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                "border-red-800"
              )}
            />

            <div className="mb-6 flex items-center gap-2">
              <BsExclamationTriangle
                className={cn("h-4 w-4", "text-red-400")}
              />
              <h2
                className={cn(
                  "text-sm font-medium tracking-wider uppercase",
                  "text-red-400"
                )}
              >
                Danger Zone
              </h2>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3
                  className={cn("text-sm font-medium", "text-zinc-200")}
                >
                  Reinstall Server
                </h3>
                <p className={cn("mt-1 text-xs", "text-zinc-500")}>
                  This will reinstall the server with its current configuration
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReinstallModalOpen(true)}
                className={cn(
                  "transition-all",
                  "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
                )}
              >
                <span className="text-xs tracking-wider uppercase">Reinstall</span>
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
      />

      {/* Reinstall Confirmation Modal */}
      <ConfirmationModal
        open={reinstallModalOpen}
        onOpenChange={setReinstallModalOpen}
        title="Reinstall Server"
        description="Are you sure you want to reinstall this server? This will stop the server and run the installation script again with your current configuration. Existing server files will be preserved but may be overwritten by the installation."
        onConfirm={handleReinstall}
        confirmLabel="Reinstall"
        variant="danger"
        isLoading={isReinstalling}
      />

      {/* Transfer Server Modal */}
      <Dialog
        open={transferModalOpen}
        onOpenChange={(open) => !isTransferring && setTransferModalOpen(open)}
      >
        <DialogContent
          className={cn(
            "flex max-h-[85vh] flex-col overflow-hidden sm:max-w-5xl",
            "border-zinc-800 bg-[#0f0f0f]"
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn(
                "flex items-center gap-2 text-lg font-light tracking-wider",
                "text-zinc-100"
              )}
            >
              <BsGlobe className="h-5 w-5" />
              TRANSFER SERVER
            </DialogTitle>
            <DialogDescription
              className={cn("text-sm", "text-zinc-500")}
            >
              Select a new location for your server. Latency is measured from your current position.
            </DialogDescription>
          </DialogHeader>

          {isTransferring ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
              <Spinner className={cn("h-8 w-8", "text-zinc-400")} />
              <p className={cn("text-sm", "text-zinc-400")}>
                Transferring server to {locations.find((l) => l.id === selectedLocation)?.city}...
              </p>
              <p className={cn("text-xs", "text-zinc-600")}>
                This may take several minutes. Do not close this window.
              </p>
            </div>
          ) : (
            <>
              {/* Current Location */}
              <div
                className={cn(
                  "mb-4 border px-4 py-3",
                  "border-zinc-800 bg-zinc-900/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <BsGeoAlt className={cn("h-4 w-4", "text-zinc-400")} />
                  <div>
                    <span
                      className={cn(
                        "text-[10px] tracking-wider uppercase",
                        "text-zinc-500"
                      )}
                    >
                      Current Location
                    </span>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        "text-zinc-200"
                      )}
                    >
                      {locations.find((l) => l.id === currentLocation)?.flag}{" "}
                      {locations.find((l) => l.id === currentLocation)?.city},{" "}
                      {locations.find((l) => l.id === currentLocation)?.country}
                    </p>
                  </div>
                </div>
              </div>

              {/* Location Grid */}
              <div className="flex-1 space-y-6 overflow-y-auto pr-2">
                {Object.entries(locationsByRegion).map(([region, regionLocations]) => (
                  <div key={region}>
                    <h3
                      className={cn(
                        "sticky top-0 mb-2 py-1 text-[10px] font-medium tracking-wider uppercase",
                        "bg-[#0f0f0f] text-zinc-500"
                      )}
                    >
                      {region}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {regionLocations.map((location) => {
                        const pingData = locationPings.find((p) => p.locationId === location.id);
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
                              "relative flex items-center justify-between border px-3 py-2.5 text-left transition-all",
                              isDisabled
                                ? "cursor-not-allowed border-zinc-800 bg-zinc-900/30 opacity-50"
                                : isSelected
                                  ? "border-amber-600 bg-amber-950/30"
                                  : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-800/50"
                            )}
                            whileHover={!isDisabled ? { scale: 1.01 } : undefined}
                            whileTap={!isDisabled ? { scale: 0.99 } : undefined}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-base">{location.flag}</span>
                              <div>
                                <p
                                  className={cn(
                                    "text-sm font-medium",
                                    "text-zinc-200"
                                  )}
                                >
                                  {location.city}
                                </p>
                                <p
                                  className={cn(
                                    "text-[10px]",
                                    "text-zinc-500"
                                  )}
                                >
                                  {location.country}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {pingData?.status === "pending" && (
                                <span
                                  className={cn(
                                    "text-xs",
                                    "text-zinc-600"
                                  )}
                                >
                                  --
                                </span>
                              )}
                              {pingData?.status === "pinging" && (
                                <Spinner
                                  className={cn(
                                    "h-3 w-3",
                                    "text-zinc-500"
                                  )}
                                />
                              )}
                              {pingData?.status === "done" && (
                                <span
                                  className={cn("font-mono text-xs", getPingColor(pingData.ping))}
                                >
                                  {pingData.ping}ms
                                </span>
                              )}
                              {pingData?.status === "error" && (
                                <span
                                  className={cn(
                                    "text-xs",
                                    "text-red-400"
                                  )}
                                >
                                  Error
                                </span>
                              )}
                              {isSelected && (
                                <BsCheck
                                  className={cn(
                                    "h-4 w-4",
                                    "text-amber-400"
                                  )}
                                />
                              )}
                              {isCurrentLocation && (
                                <span
                                  className={cn(
                                    "text-[10px] tracking-wider uppercase",
                                    "text-zinc-600"
                                  )}
                                >
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
              <div
                className={cn(
                  "mt-4 flex items-center justify-between border-t pt-4",
                  "border-zinc-800"
                )}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startPinging}
                  disabled={isPinging || pingCooldown > 0}
                  className={cn(
                    "gap-2",
                    "border-zinc-700 text-zinc-400 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                  )}
                >
                  <span className="text-xs tracking-wider uppercase">
                    {isPinging
                      ? "Pinging..."
                      : pingCooldown > 0
                        ? `Wait ${pingCooldown}s`
                        : "Refresh Ping"}
                  </span>
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferModalOpen(false)}
                    className={cn(
                      "border-zinc-700 text-zinc-400 hover:text-zinc-100"
                    )}
                  >
                    <span className="text-xs tracking-wider uppercase">Cancel</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTransfer}
                    disabled={!selectedLocation}
                    className={cn(
                      "gap-2",
                      "border-amber-700 text-amber-400 hover:border-amber-600 hover:text-amber-300 disabled:opacity-40"
                    )}
                  >
                    <BsGlobe className="h-3 w-3" />
                    <span className="text-xs tracking-wider uppercase">Transfer</span>
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
        description={`Are you sure you want to transfer this server to ${locations.find((l) => l.id === selectedLocation)?.city}, ${locations.find((l) => l.id === selectedLocation)?.country}? The server will be stopped during the transfer process.`}
        onConfirm={confirmTransfer}
        confirmLabel="Transfer"
        variant="danger"
      />

      {/* Server Split Modal */}
      <Dialog open={splitModalOpen} onOpenChange={setSplitModalOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-lg",
            "border-zinc-800 bg-[#0f0f0f]"
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn(
                "flex items-center gap-2 text-lg font-light tracking-wider",
                "text-zinc-100"
              )}
            >
              <BsLayers className="h-5 w-5" />
              SPLIT SERVER
            </DialogTitle>
            <DialogDescription
              className={cn("text-sm", "text-zinc-500")}
            >
              Divide this server&apos;s resources into two separate instances.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div
              className={cn(
                "border p-3 text-xs",
                "border-amber-900/50 bg-amber-950/20 text-amber-400/80"
              )}
            >
              Splitting will create a new server with the allocated resources. The original server
              will retain the remaining resources.
            </div>

            {/* CPU Split */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label
                  className={cn(
                    "text-[10px] font-medium tracking-wider uppercase",
                    "text-zinc-500"
                  )}
                >
                  CPU Allocation
                </label>
                <span
                  className={cn("font-mono text-xs", "text-zinc-400")}
                >
                  {splitResources.cpu}% / {100 - splitResources.cpu}%
                </span>
              </div>
              <Slider
                min={10}
                max={90}
                step={5}
                value={[splitResources.cpu]}
                onValueChange={(value) =>
                  setSplitResources((prev) => ({ ...prev, cpu: value[0] ?? prev.cpu }))
                }
              />
              <div className="mt-2 flex justify-between">
                <span className={cn("text-[10px]", "text-zinc-600")}>
                  New Server
                </span>
                <span className={cn("text-[10px]", "text-zinc-600")}>
                  This Server
                </span>
              </div>
            </div>

            {/* Memory Split */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label
                  className={cn(
                    "text-[10px] font-medium tracking-wider uppercase",
                    "text-zinc-500"
                  )}
                >
                  Memory Allocation
                </label>
                <span
                  className={cn("font-mono text-xs", "text-zinc-400")}
                >
                  {Math.round((settings.memoryLimit * splitResources.memory) / 100)} MB /{" "}
                  {Math.round((settings.memoryLimit * (100 - splitResources.memory)) / 100)} MB
                </span>
              </div>
              <Slider
                min={10}
                max={90}
                step={5}
                value={[splitResources.memory]}
                onValueChange={(value) =>
                  setSplitResources((prev) => ({ ...prev, memory: value[0] ?? prev.memory }))
                }
              />
              <div className="mt-2 flex justify-between">
                <span className={cn("text-[10px]", "text-zinc-600")}>
                  New Server
                </span>
                <span className={cn("text-[10px]", "text-zinc-600")}>
                  This Server
                </span>
              </div>
            </div>

            {/* Disk Split */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label
                  className={cn(
                    "text-[10px] font-medium tracking-wider uppercase",
                    "text-zinc-500"
                  )}
                >
                  Disk Allocation
                </label>
                <span
                  className={cn("font-mono text-xs", "text-zinc-400")}
                >
                  {Math.round((settings.diskLimit * splitResources.disk) / 100)} MB /{" "}
                  {Math.round((settings.diskLimit * (100 - splitResources.disk)) / 100)} MB
                </span>
              </div>
              <Slider
                min={10}
                max={90}
                step={5}
                value={[splitResources.disk]}
                onValueChange={(value) =>
                  setSplitResources((prev) => ({ ...prev, disk: value[0] ?? prev.disk }))
                }
              />
              <div className="mt-2 flex justify-between">
                <span className={cn("text-[10px]", "text-zinc-600")}>
                  New Server
                </span>
                <span className={cn("text-[10px]", "text-zinc-600")}>
                  This Server
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSplitModalOpen(false)}
              className={cn(
                "border-zinc-700 text-zinc-400 hover:text-zinc-100"
              )}
            >
              <span className="text-xs tracking-wider uppercase">Cancel</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSplitServer}
              className={cn(
                "gap-2",
                "border-zinc-600 text-zinc-300 hover:text-zinc-100"
              )}
            >
              <BsLayers className="h-3 w-3" />
              <span className="text-xs tracking-wider uppercase">Split Server</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
