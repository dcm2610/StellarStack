import { create } from "zustand";
import type {
  ContainerStatus,
  ServerInstance,
  ConsoleEntry,
  CpuInfo,
  MemoryInfo,
  DiskInfo,
  NetworkInfo,
} from "../types/server";

const HISTORY_LENGTH = 20;

// Generate initial history data
const generateHistory = (base: number, volatility: number, length: number = HISTORY_LENGTH): number[] => {
  const history: number[] = [];
  let current = base;
  for (let i = 0; i < length; i++) {
    current = Math.max(0, Math.min(100, current + (Math.random() - 0.5) * volatility));
    history.push(Math.round(current));
  }
  return history;
};

// Default server instance
const createDefaultServer = (): ServerInstance => ({
  id: "1",
  name: "A Minecraft Server",
  status: "running",
  cpu: {
    usage: {
      current: 45,
      limit: 100,
      percentage: 45,
      history: generateHistory(45, 20),
    },
    cores: 16,
    frequency: 4.2,
    model: "AMD Ryzen 9 9950X3D",
    architecture: "Zen 5",
    baseFrequency: 4.3,
    boostFrequency: 5.7,
    tdp: 170,
    cache: "144MB",
  },
  memory: {
    usage: {
      current: 12,
      limit: 32,
      percentage: 37.5,
      history: generateHistory(37.5, 15),
    },
    used: 12,
    total: 32,
    type: "DDR5",
    speed: 6000,
    channels: "Dual Channel",
    slots: "2 / 4",
    timings: "CL30-38-38",
  },
  disk: {
    usage: {
      current: 450,
      limit: 1000,
      percentage: 45,
      history: generateHistory(45, 1),
    },
    used: 450,
    total: 1000,
    type: "NVMe SSD",
    model: "Samsung 990 Pro",
    interface: "PCIe 4.0 x4",
    readSpeed: "7,450 MB/s",
    writeSpeed: "6,900 MB/s",
    health: 98,
  },
  network: {
    download: 45,
    upload: 12,
    downloadHistory: generateHistory(45, 25),
    uploadHistory: generateHistory(12, 15),
    ip: "192.168.1.100",
    port: 25565,
    protocol: "TCP/UDP",
  },
  networkConfig: {
    hostname: "mc.example.com",
    ipAddress: "192.168.1.100",
    port: 25565,
    protocol: "TCP/UDP",
  },
  system: {
    os: "Debian",
    osVersion: "12 (Bookworm)",
    kernel: "6.1.0-18-amd64",
    uptime: 1234567,
    dockerVersion: "24.0.7",
  },
});

interface ServerStore {
  // Connection status
  isOffline: boolean;
  setOffline: (offline: boolean) => void;

  // Server data
  server: ServerInstance;
  setServer: (server: ServerInstance) => void;

  // Container status
  setContainerStatus: (status: ContainerStatus) => void;

  // Resource updates
  updateCpu: (updates: Partial<CpuInfo>) => void;
  updateMemory: (updates: Partial<MemoryInfo>) => void;
  updateDisk: (updates: Partial<DiskInfo>) => void;
  updateNetwork: (updates: Partial<NetworkInfo>) => void;

  // Bulk resource update (for simulation tick)
  tickResources: () => void;

  // Console
  consoleLines: ConsoleEntry[];
  addConsoleLine: (line: ConsoleEntry) => void;
  clearConsole: () => void;
}

export const useServerStore = create<ServerStore>((set, get) => ({
  isOffline: false,
  setOffline: (offline) => set({ isOffline: offline }),

  server: createDefaultServer(),
  setServer: (server) => set({ server }),

  setContainerStatus: (status) =>
    set((state) => ({
      server: { ...state.server, status },
    })),

  updateCpu: (updates) =>
    set((state) => ({
      server: {
        ...state.server,
        cpu: { ...state.server.cpu, ...updates },
      },
    })),

  updateMemory: (updates) =>
    set((state) => ({
      server: {
        ...state.server,
        memory: { ...state.server.memory, ...updates },
      },
    })),

  updateDisk: (updates) =>
    set((state) => ({
      server: {
        ...state.server,
        disk: { ...state.server.disk, ...updates },
      },
    })),

  updateNetwork: (updates) =>
    set((state) => ({
      server: {
        ...state.server,
        network: { ...state.server.network, ...updates },
      },
    })),

  tickResources: () => {
    const { server, isOffline } = get();
    if (isOffline) return;

    const isRunning = server.status === "running";
    const isStopped = server.status === "stopped";

    const isStopping = server.status === "stopping";
    const isStarting = server.status === "starting";

    // Helper to vary values based on container state
    const vary = (current: number, min: number, max: number, volatility: number) => {
      if (isStopped) {
        // When fully stopped, values should be 0
        return 0;
      }
      if (isStopping) {
        // When stopping, rapidly decay towards 0
        return Math.max(0, current * 0.5); // Halve each tick for fast decay
      }
      if (isStarting) {
        // When starting, values should gradually increase from 0
        const target = min + (max - min) * 0.4; // Target ~40% while starting
        return current + (target - current) * 0.3;
      }
      // Normal running variation
      const spike = Math.random() < 0.12;
      const drop = Math.random() < 0.08;
      let change: number;
      if (spike) {
        change = Math.random() * volatility * 4;
      } else if (drop) {
        change = -Math.random() * volatility * 3;
      } else {
        change = (Math.random() - 0.5) * volatility * 1.5;
      }
      return Math.min(max, Math.max(min, current + change));
    };

    const newCpuPercentage = vary(server.cpu.usage.percentage, 2, 95, 12);
    const newMemoryPercentage = vary(server.memory.usage.percentage, 5, 95, 8);
    const newDiskPercentage = server.disk.usage.percentage + (Math.random() - 0.5) * 0.3;
    const newDownload = vary(server.network.download, 0, 100, 15);
    const newUpload = vary(server.network.upload, 0, 60, 10);

    set({
      server: {
        ...server,
        cpu: {
          ...server.cpu,
          usage: {
            ...server.cpu.usage,
            percentage: Math.round(newCpuPercentage),
            history: [...server.cpu.usage.history.slice(1), Math.round(newCpuPercentage)],
          },
          frequency: +(3.0 + (newCpuPercentage / 100) * 1.2).toFixed(1),
        },
        memory: {
          ...server.memory,
          usage: {
            ...server.memory.usage,
            percentage: Math.round(newMemoryPercentage),
            history: [...server.memory.usage.history.slice(1), Math.round(newMemoryPercentage)],
          },
          used: +((newMemoryPercentage / 100) * server.memory.total).toFixed(1),
        },
        disk: {
          ...server.disk,
          usage: {
            ...server.disk.usage,
            percentage: Math.round(Math.max(0, Math.min(100, newDiskPercentage))),
            history: [...server.disk.usage.history.slice(1), Math.round(newDiskPercentage)],
          },
        },
        network: {
          ...server.network,
          download: Math.round(newDownload),
          upload: Math.round(newUpload),
          downloadHistory: [...server.network.downloadHistory.slice(1), Math.round(newDownload)],
          uploadHistory: [...server.network.uploadHistory.slice(1), Math.round(newUpload)],
        },
      },
    });
  },

  consoleLines: [],
  addConsoleLine: (line) =>
    set((state) => ({
      consoleLines: [...state.consoleLines.slice(-99), line],
    })),
  clearConsole: () => set({ consoleLines: [] }),
}));

// Alias for backwards compatibility
export const useConnectionStore = useServerStore;
