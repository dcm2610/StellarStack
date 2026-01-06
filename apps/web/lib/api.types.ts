// API Types

export type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  role: "user" | "admin";
  banned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  name: string;
  description?: string;
  country?: string;
  city?: string;
  createdAt: string;
  updatedAt: string;
  nodes?: Node[];
}

export interface CreateLocationData {
  name: string;
  description?: string;
  country?: string;
  city?: string;
}

export interface Node {
  id: string;
  displayName: string;
  host: string;
  port: number;
  protocol: "HTTP" | "HTTPS" | "HTTPS_PROXY";
  sftpPort: number;
  memoryLimit: number;
  diskLimit: number;
  cpuLimit: number;
  uploadLimit: number;
  isOnline: boolean;
  lastHeartbeat?: string;
  heartbeatLatency?: number; // ms
  locationId?: string;
  location?: Location;
  allocations?: Allocation[];
  servers?: { id: string; name: string; status: string }[];
  _count?: { servers: number; allocations: number };
  createdAt: string;
  updatedAt: string;
}

export interface NodeStats {
  cpu: {
    cores: number;
    usage_percent: number;
    load_avg: { one: number; five: number; fifteen: number };
  };
  memory: {
    total: number;
    used: number;
    available: number;
    usage_percent: number;
  };
  disk: {
    total: number;
    used: number;
    available: number;
    usage_percent: number;
  };
  uptime: number;
  hostname: string;
  os: { name: string; version: string; arch: string };
  api: { connected: boolean; latency_ms?: number };
}

export interface CreateNodeData {
  displayName: string;
  host: string;
  port: number;
  protocol?: "HTTP" | "HTTPS" | "HTTPS_PROXY";
  sftpPort?: number;
  memoryLimit: number;
  diskLimit: number;
  cpuLimit: number;
  uploadLimit?: number;
  locationId?: string;
}

export interface Allocation {
  id: string;
  ip: string;
  port: number;
  alias?: string;
  assigned: boolean;
  nodeId: string;
  serverId?: string;
}

export interface Blueprint {
  id: string;
  name: string;
  description?: string;
  category?: string;
  author?: string;
  imageName: string;
  imageTag?: string;
  registry?: string;
  dockerImages?: Record<string, string>;
  startup?: string;
  stopCommand?: string;
  configFiles?: Record<string, unknown>;
  startupDetection?: Record<string, unknown>;
  installScript?: string;
  installContainer?: string;
  installEntrypoint?: string;
  variables?: BlueprintVariable[];
  features?: string[];
  config: Record<string, unknown>;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BlueprintVariable {
  name: string;
  description?: string;
  env_variable: string;
  default_value: string;
  user_viewable?: boolean;
  user_editable?: boolean;
  rules?: string;
  field_type?: string;
}

export interface CreateBlueprintData {
  name: string;
  description?: string;
  category?: string;
  imageName: string;
  imageTag?: string;
  registry?: string;
  config: Record<string, unknown>;
  isPublic?: boolean;
}

export interface PterodactylEgg {
  meta?: { version: string; update_url?: string | null };
  name: string;
  author?: string;
  description?: string | null;
  features?: string[];
  docker_images?: Record<string, string>;
  startup?: string;
  config?: {
    files?: string;
    startup?: string;
    logs?: string;
    stop?: string;
  };
  scripts?: {
    installation?: {
      script: string;
      container?: string;
      entrypoint?: string;
    };
  };
  variables?: BlueprintVariable[];
}

export interface Server {
  id: string;
  shortId?: string;
  name: string;
  description?: string;
  containerId?: string;
  status:
    | "INSTALLING"
    | "STARTING"
    | "RUNNING"
    | "STOPPING"
    | "STOPPED"
    | "SUSPENDED"
    | "MAINTENANCE"
    | "RESTORING"
    | "ERROR";
  suspended: boolean;
  memory: number; // MiB
  disk: number; // MiB
  cpu: number; // Percentage (100 = 1 thread)
  cpuPinning?: string; // e.g., "0,1,2,3" or "0-4"
  swap: number; // MiB: -1 = unlimited, 0 = disabled, >0 = limited
  oomKillDisable: boolean;
  backupLimit: number;
  allocationLimit: number;
  config?: Record<string, unknown>;
  variables?: Record<string, string>;
  dockerImage?: string;
  customStartupCommands?: string;
  nodeId: string;
  node?: Node;
  blueprintId: string;
  blueprint?: Blueprint;
  ownerId: string;
  owner?: User;
  allocations?: Allocation[];
  backups?: Backup[];
  primaryAllocationId?: string;
  parentServerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServerData {
  name: string;
  description?: string;
  nodeId: string;
  blueprintId: string;
  ownerId?: string;
  memory: number; // MiB
  disk: number; // MiB
  cpu: number; // Percentage (100 = 1 thread)
  cpuPinning?: string;
  swap?: number; // -1 = unlimited, 0 = disabled, >0 = limited MiB
  oomKillDisable?: boolean;
  backupLimit?: number;
  allocationIds: string[];
  config?: Record<string, unknown>;
  variables?: Record<string, string>; // Override blueprint variables
  dockerImage?: string; // Selected docker image from blueprint
}

// Server stats from daemon WebSocket (sent via "stats" event)
export interface ServerStats {
  memory_bytes: number;
  memory_limit_bytes: number;
  cpu_absolute: number; // CPU usage as percentage (100 = 1 core)
  network: {
    rx_bytes: number;
    tx_bytes: number;
  };
  uptime: number; // Seconds
  state: string; // Server state: "running", "offline", etc.
  disk_bytes: number; // Current disk usage in bytes
  disk_limit_bytes: number; // Disk limit in bytes
}

export interface LogEntry {
  type: "stdout" | "stderr";
  data: string;
  timestamp: string;
}

export interface FileList {
  path: string;
  files: FileInfo[];
}

export interface DiskUsage {
  used_bytes: number;
  limit_bytes: number;
  path: string;
}

export interface FileInfo {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  permissions: string;
}

export interface Backup {
  id: string;
  name: string;
  size: number; // bytes
  checksum?: string;
  checksumType: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "RESTORING";
  isLocked: boolean;
  storagePath?: string;
  serverId: string;
  ignoredFiles?: string[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleTask {
  id?: string;
  action: string;
  payload?: string;
  sequence: number;
  timeOffset: number;
}

export interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  tasks: ScheduleTask[];
  isActive: boolean;
  isProcessing?: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleData {
  name: string;
  cronExpression: string;
  tasks: Array<{
    action: string;
    payload?: string;
    sequence: number;
    timeOffset: number;
  }>;
  isActive?: boolean;
}

export interface ConsoleInfo {
  websocketUrl: string;
  token: string;
}

export interface StartupVariable {
  name: string;
  description: string;
  envVariable: string;
  defaultValue: string;
  value: string;
  rules: string;
  fieldType: string;
  userViewable: boolean;
  userEditable: boolean;
}

export interface DockerImageOption {
  label: string;
  image: string;
}

export interface StartupConfig {
  variables: StartupVariable[];
  dockerImages: DockerImageOption[];
  selectedDockerImage: string;
  startupCommand: string;
  customStartupCommands: string;
  features: string[];
  stopCommand: string;
}

export interface UpdateStartupData {
  variables?: Record<string, string>;
  dockerImage?: string;
  customStartupCommands?: string;
}

export interface DownloadToken {
  token: string;
  expiresAt: number;
  downloadUrl: string;
}

export interface ActivityLog {
  id: string;
  event: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  serverId?: string;
  userId?: string;
  timestamp: string;
}

export interface ActivityLogResponse {
  logs: ActivityLog[];
  total: number;
  limit: number;
  offset: number;
}

// Server members (subusers)
export interface ServerMember {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ServerInvitation {
  id: string;
  email: string;
  permissions: string[];
  token?: string;
  acceptUrl?: string;
  inviter?: {
    id: string;
    name: string;
    email: string;
  };
  expiresAt: string;
  createdAt: string;
}

export interface InvitationDetails {
  id: string;
  server: {
    id: string;
    name: string;
  };
  inviter: {
    name: string;
    email: string;
  };
  permissions: string[];
  expiresAt: string;
}

export interface PendingInvitation {
  id: string;
  token: string;
  server: {
    id: string;
    name: string;
  };
  inviter: {
    name: string;
  };
  permissions: string[];
  expiresAt: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  server: {
    id: string;
    name: string;
    status: string;
    node: {
      displayName: string;
      location?: {
        name: string;
      };
    };
  };
  permissions: string[];
  createdAt: string;
}

export interface ChildServer {
  id: string;
  name: string;
  status: string;
  memory: number;
  disk: number;
  cpu: number;
  createdAt: string;
}

export interface SplitServerResponse {
  success: boolean;
  childServer: {
    id: string;
    name: string;
    memory: number;
    disk: number;
    cpu: number;
  };
  parentServer: {
    id: string;
    memory: number;
    disk: number;
    cpu: number;
  };
}

export interface PermissionDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
}

export interface PermissionCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  permissions: PermissionDefinition[];
}

export interface PermissionDefinitions {
  categories: PermissionCategory[];
}

// Admin settings types
export interface SettingsOverview {
  cloudflare: {
    enabled: boolean;
    domain: string;
  };
  subdomains: {
    enabled: boolean;
    baseDomain: string;
  };
  email: {
    provider: string;
    configured: boolean;
  };
}

export interface CloudflareSettings {
  apiToken: string;
  zoneId: string;
  domain: string;
  enabled: boolean;
  hasApiToken?: boolean;
}

export interface SubdomainSettings {
  enabled: boolean;
  baseDomain: string;
  autoProvision: boolean;
  dnsProvider: "cloudflare" | "manual";
}

export interface EmailSettings {
  provider: "smtp" | "resend" | "sendgrid" | "mailgun";
  fromEmail: string;
  fromName: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
  };
  apiKey?: string;
  hasApiKey?: boolean;
}

export interface BrandingSettings {
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  supportEmail: string;
  supportUrl: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  footerText: string;
  customCss: string;
}

export interface PublicBrandingSettings {
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  supportEmail: string;
  supportUrl: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  footerText: string;
}

// Webhook types
export type WebhookEvent =
  | "server.started"
  | "server.stopped"
  | "backup.created"
  | "backup.restored"
  | "backup.deleted";

export type WebhookProvider = "generic" | "discord" | "slack";

export interface Webhook {
  id: string;
  serverId: string | null;
  url: string;
  events: WebhookEvent[];
  provider: WebhookProvider;
  enabled: boolean;
  secret?: string;
  secretOnce?: string;
  server?: { id: string; name: string } | null;
  _count?: { deliveries: number };
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  response: string | null;
  attempts: number;
  deliveredAt: string | null;
  createdAt: string;
}
