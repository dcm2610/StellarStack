const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    credentials: "include", // Include cookies for auth
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${endpoint}`, config);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.message || data.error || `Request failed with status ${response.status}`,
      response.status,
      data
    );
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;

  return JSON.parse(text) as T;
}

// Account endpoints
export const account = {
  me: () => request<User>("/api/account/me"),
  update: (data: { name?: string; email?: string }) =>
    request<User>("/api/account/me", { method: "PATCH", body: data }),
  delete: () => request("/api/account/me", { method: "DELETE" }),

  // Admin user management
  listUsers: () => request<User[]>("/api/account/users"),
  getUser: (id: string) => request<User>(`/api/account/users/${id}`),
  updateUser: (id: string, data: { name?: string; role?: string }) =>
    request<User>(`/api/account/users/${id}`, { method: "PATCH", body: data }),
  deleteUser: (id: string) => request(`/api/account/users/${id}`, { method: "DELETE" }),
};

// Locations endpoints
export const locations = {
  list: () => request<Location[]>("/api/locations"),
  get: (id: string) => request<Location>(`/api/locations/${id}`),
  create: (data: CreateLocationData) =>
    request<Location>("/api/locations", { method: "POST", body: data }),
  update: (id: string, data: Partial<CreateLocationData>) =>
    request<Location>(`/api/locations/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) => request(`/api/locations/${id}`, { method: "DELETE" }),
};

// Nodes endpoints
export const nodes = {
  list: () => request<Node[]>("/api/nodes"),
  get: (id: string) => request<Node>(`/api/nodes/${id}`),
  create: (data: CreateNodeData) =>
    request<{ node: Node; token: string }>("/api/nodes", { method: "POST", body: data }),
  update: (id: string, data: Partial<CreateNodeData>) =>
    request<Node>(`/api/nodes/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) => request(`/api/nodes/${id}`, { method: "DELETE" }),
  regenerateToken: (id: string) =>
    request<{ token: string }>(`/api/nodes/${id}/regenerate-token`, { method: "POST" }),

  // Stats
  getStats: (id: string) => request<NodeStats>(`/api/nodes/${id}/stats`),

  // Allocations
  addAllocation: (nodeId: string, data: { ip: string; port: number; alias?: string }) =>
    request<Allocation>(`/api/nodes/${nodeId}/allocations`, { method: "POST", body: data }),
  addAllocationRange: (nodeId: string, data: { ip: string; startPort: number; endPort: number }) =>
    request<{ count: number }>(`/api/nodes/${nodeId}/allocations/range`, { method: "POST", body: data }),
  deleteAllocation: (nodeId: string, allocationId: string) =>
    request(`/api/nodes/${nodeId}/allocations/${allocationId}`, { method: "DELETE" }),
};

// Blueprints endpoints
export const blueprints = {
  list: () => request<Blueprint[]>("/api/blueprints"),
  get: (id: string) => request<Blueprint>(`/api/blueprints/${id}`),
  create: (data: CreateBlueprintData) =>
    request<Blueprint>("/api/blueprints", { method: "POST", body: data }),
  update: (id: string, data: Partial<CreateBlueprintData>) =>
    request<Blueprint>(`/api/blueprints/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) => request(`/api/blueprints/${id}`, { method: "DELETE" }),

  // Pterodactyl egg import/export
  importEgg: (egg: PterodactylEgg) =>
    request<{ success: boolean; blueprint: Blueprint; message: string }>("/api/blueprints/import/egg", {
      method: "POST",
      body: egg,
    }),
  exportEgg: (id: string) => request<PterodactylEgg>(`/api/blueprints/${id}/export/egg`),
};

// Servers endpoints
export const servers = {
  list: () => request<Server[]>("/api/servers"),
  get: (id: string) => request<Server>(`/api/servers/${id}`),
  create: (data: CreateServerData) =>
    request<Server>("/api/servers", { method: "POST", body: data }),
  update: (id: string, data: Partial<CreateServerData>) =>
    request<Server>(`/api/servers/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) => request(`/api/servers/${id}`, { method: "DELETE" }),

  // Actions
  start: (id: string) => request(`/api/servers/${id}/start`, { method: "POST" }),
  stop: (id: string) => request(`/api/servers/${id}/stop`, { method: "POST" }),
  restart: (id: string) => request(`/api/servers/${id}/restart`, { method: "POST" }),
  kill: (id: string) => request(`/api/servers/${id}/kill`, { method: "POST" }),
  sync: (id: string) => request(`/api/servers/${id}/sync`, { method: "POST" }),
  reinstall: (id: string) => request<{ success: boolean; message: string; containerId: string }>(
    `/api/servers/${id}/reinstall`,
    { method: "POST" }
  ),

  // Stats & Logs
  stats: (id: string) => request<ServerStats>(`/api/servers/${id}/stats`),
  logs: (id: string, tail?: number) =>
    request<LogEntry[]>(`/api/servers/${id}/logs${tail ? `?tail=${tail}` : ""}`),
  command: (id: string, command: string) =>
    request(`/api/servers/${id}/command`, { method: "POST", body: { command } }),

  // Console WebSocket
  console: (id: string) => request<ConsoleInfo>(`/api/servers/${id}/console`),

  // Files
  files: {
    list: (serverId: string, path?: string) =>
      request<FileList>(`/api/servers/${serverId}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`),
    diskUsage: (serverId: string) =>
      request<DiskUsage>(`/api/servers/${serverId}/files/disk-usage`),
    read: async (serverId: string, path: string) => {
      const response = await request<{ content: string }>(`/api/servers/${serverId}/files/read?path=${encodeURIComponent(path)}`);
      return response.content;
    },
    write: (serverId: string, path: string, content: string) =>
      request(`/api/servers/${serverId}/files/write`, { method: "POST", body: { path, content } }),
    create: (serverId: string, path: string, type: "file" | "directory", content?: string) =>
      request(`/api/servers/${serverId}/files/create`, { method: "POST", body: { path, type, content } }),
    delete: (serverId: string, path: string) =>
      request(`/api/servers/${serverId}/files/delete?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
    rename: (serverId: string, from: string, to: string) =>
      request(`/api/servers/${serverId}/files/rename`, { method: "POST", body: { from, to } }),
    getDownloadToken: (serverId: string, path: string) =>
      request<DownloadToken>(`/api/servers/${serverId}/files/download-token`, {
        method: "POST",
        body: { path },
      }),
  },

  // Backups
  backups: {
    list: (serverId: string) => request<Backup[]>(`/api/servers/${serverId}/backups`),
    create: (serverId: string, data: { name?: string; ignore?: string[]; locked?: boolean }) =>
      request<Backup>(`/api/servers/${serverId}/backups`, { method: "POST", body: data }),
    restore: (serverId: string, backupId: string) =>
      request(`/api/servers/${serverId}/backups/restore?id=${encodeURIComponent(backupId)}`, { method: "POST" }),
    delete: (serverId: string, backupId: string) =>
      request(`/api/servers/${serverId}/backups/delete?id=${encodeURIComponent(backupId)}`, { method: "DELETE" }),
    lock: (serverId: string, backupId: string, locked: boolean) =>
      request(`/api/servers/${serverId}/backups/lock?id=${encodeURIComponent(backupId)}`, {
        method: "PATCH",
        body: { locked },
      }),
    getDownloadToken: (serverId: string, backupId: string) =>
      request<DownloadToken>(`/api/servers/${serverId}/backups/download-token`, {
        method: "POST",
        body: { id: backupId },
      }),
  },

  // Schedules
  schedules: {
    list: (serverId: string) => request<Schedule[]>(`/api/servers/${serverId}/schedules`),
    get: (serverId: string, scheduleId: string) =>
      request<Schedule>(`/api/servers/${serverId}/schedules/${scheduleId}`),
    create: (serverId: string, data: CreateScheduleData) =>
      request<Schedule>(`/api/servers/${serverId}/schedules`, { method: "POST", body: data }),
    update: (serverId: string, scheduleId: string, data: Partial<CreateScheduleData>) =>
      request<Schedule>(`/api/servers/${serverId}/schedules/${scheduleId}`, { method: "PATCH", body: data }),
    delete: (serverId: string, scheduleId: string) =>
      request(`/api/servers/${serverId}/schedules/${scheduleId}`, { method: "DELETE" }),
    run: (serverId: string, scheduleId: string) =>
      request(`/api/servers/${serverId}/schedules/${scheduleId}/run`, { method: "POST" }),
  },

  // Startup configuration
  startup: {
    get: (serverId: string) => request<StartupConfig>(`/api/servers/${serverId}/startup`),
    update: (serverId: string, data: UpdateStartupData) =>
      request<{ success: boolean; variables: Record<string, string>; dockerImage: string | null }>(
        `/api/servers/${serverId}/startup`,
        { method: "PATCH", body: data }
      ),
  },
};

// Types
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
  status: "INSTALLING" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";
  memory: number; // MiB
  disk: number; // MiB
  cpu: number; // Percentage (100 = 1 thread)
  cpuPinning?: string; // e.g., "0,1,2,3" or "0-4"
  swap: number; // MiB: -1 = unlimited, 0 = disabled, >0 = limited
  oomKillDisable: boolean;
  backupLimit: number;
  config?: Record<string, unknown>;
  nodeId: string;
  node?: Node;
  blueprintId: string;
  blueprint?: Blueprint;
  ownerId: string;
  owner?: User;
  allocations?: Allocation[];
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

export interface ServerStats {
  id: string;
  name: string;
  cpu: { usage_percent: number; online_cpus: number };
  memory: { usage: number; limit: number; usage_percent: number };
  network: { rx_bytes: number; tx_bytes: number };
  block_io: { read_bytes: number; write_bytes: number };
  pids: number;
  timestamp: string;
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
  container_id: string;
  name: string;
  size: number;
  hash: string;
  created_at: string;
  storage: string;
  locked: boolean;
}

export interface ScheduleTask {
  id?: string;
  action: string;
  payload?: string;
  sequence_id: number;
  time_offset: number;
}

export interface Schedule {
  id: string;
  container_id: string;
  name: string;
  cron: string;
  tasks: ScheduleTask[];
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  created_at: string;
}

export interface CreateScheduleData {
  name: string;
  cron: string;
  tasks: ScheduleTask[];
  enabled?: boolean;
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
  features: string[];
  stopCommand: string;
}

export interface UpdateStartupData {
  variables?: Record<string, string>;
  dockerImage?: string;
}

export interface DownloadToken {
  token: string;
  expiresAt: number;
  downloadUrl: string;
}

export { ApiError };
