import type { ReactNode } from "react";

export type ContainerStatus = "running" | "stopped" | "starting" | "stopping";

export interface CardProps {
  itemId: string;
}

export interface CpuCardLabels {
  title: string;
  coreUsage: string;
  cores: string;
}

export interface UsageMetricCardLabels {
  title: string;
}

export interface NetworkUsageCardLabels {
  title: string;
  download: string;
  upload: string;
  interface?: string;
  adapter?: string;
  speed?: string;
  ipv4?: string;
  gateway?: string;
  dns?: string;
}

export interface NetworkInfoCardLabels {
  title: string;
  titleShort: string;
  publicIp: string;
  publicIpShort: string;
  privateIp: string;
  openPorts: string;
  portsShort: string;
  macAddress: string;
}

export interface SystemInfoCardLabels {
  title: string;
  titleShort: string;
  name: string;
  nodeId: string;
  nodeIdShort: string;
  location: string;
  regionZone: string;
  provider: string;
}

export interface ContainerControlsCardLabels {
  start: string;
  stop: string;
  kill: string;
  restart: string;
}

export interface ContainerUptimeCardLabels {
  title: string;
  titleShort: string;
  containerStopped: string;
}

export interface PlayersOnlineCardLabels {
  title: string;
  titleShort: string;
  online: string;
}

export interface RecentLogsCardLabels {
  title: string;
}

export interface ConsoleLabels {
  title: string;
  placeholder: string;
  autoScroll: string;
  clear: string;
}

export interface CoreUsage {
  id: number;
  percentage: number;
  frequency: number;
}

export interface UsageMetricCardProps extends CardProps {
  percentage: number;
  details: string[];
  tooltipContent?: ReactNode;
  history?: number[];
  color?: string;
}

export interface CpuCardProps extends CardProps {
  percentage: number;
  details: string[];
  tooltipContent?: ReactNode;
  history?: number[];
  coreUsage?: CoreUsage[];
}

export interface NetworkUsageCardProps extends CardProps {
  download: number;
  upload: number;
  downloadHistory?: number[];
  uploadHistory?: number[];
}

export interface NetworkTooltipData {
  interface: string;
  adapter: string;
  speed: string;
  ipv4: string;
  gateway: string;
  dns: string;
}

export interface CpuCoreGridProps {
  cores: CoreUsage[];
  isDark: boolean;
  isOffline: boolean;
}

export interface CardMetadata {
  name: string;
  description: string;
}

export interface CardPreviewProps {
  cardId: string;
  isDark: boolean;
}

export interface ServerPreviewData {
  name: string;
  cpu: { usage: { percentage: number; history: number[] } };
  memory: { usage: { percentage: number; history: number[] } };
  disk: { usage: { percentage: number; history: number[] } };
  network: { download: number; upload: number; downloadHistory: number[]; uploadHistory: number[] };
  networkConfig: { ipAddress: string; port: number };
  system: { os: string; osVersion: string };
}

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
}

export interface LogEntry {
  level: string;
  message: string;
  time: string;
}

export interface NodeData {
  id: string;
  name: string;
  location: string;
  region: string;
  zone: string;
  provider: string;
}

export interface NetworkInfoData {
  publicIp: string;
  privateIp: string;
  openPorts: PortInfo[];
  macAddress: string;
}

export interface PortInfo {
  port: number;
  protocol: string;
}
