import {
  ApiError,
  RequestOptions,
  User,
  Location,
  CreateLocationData,
  Node,
  NodeStats,
  CreateNodeData,
  Allocation,
  Blueprint,
  CreateBlueprintData,
  PterodactylEgg,
  Server,
  CreateServerData,
  ServerStats,
  LogEntry,
  FileList,
  DiskUsage,
  Backup,
  Schedule,
  CreateScheduleData,
  ConsoleInfo,
  StartupConfig,
  UpdateStartupData,
  DownloadToken,
  ActivityLogResponse,
  ServerMember,
  ServerInvitation,
  InvitationDetails,
  PendingInvitation,
  Membership,
  ChildServer,
  SplitServerResponse,
  PermissionDefinitions,
  SettingsOverview,
  CloudflareSettings,
  SubdomainSettings,
  EmailSettings,
  BrandingSettings,
  PublicBrandingSettings,
  WebhookEvent,
  Webhook,
  WebhookDelivery,
} from "./api.types";

// Re-export all types
export * from "./api.types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const request = async <T>(endpoint: string, options: RequestOptions = {}): Promise<T> => {
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
};

// Account endpoints
export const account = {
  me: () => request<User>("/api/account/me"),
  update: (data: { name?: string; email?: string }) =>
    request<User>("/api/account/me", { method: "PATCH", body: data }),
  delete: () => request("/api/account/me", { method: "DELETE" }),

  // Admin user management
  listUsers: () => request<User[]>("/api/account/users"),
  getUser: (id: string) => request<User>(`/api/account/users/${id}`),
  createUser: (data: { name: string; email: string; password: string; role?: "user" | "admin" }) =>
    request<User>("/api/account/users", { method: "POST", body: data }),
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
    request<{ node: Node; token_id: string; token: string }>("/api/nodes", {
      method: "POST",
      body: data,
    }),
  update: (id: string, data: Partial<CreateNodeData>) =>
    request<Node>(`/api/nodes/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) => request(`/api/nodes/${id}`, { method: "DELETE" }),
  regenerateToken: (id: string) =>
    request<{ token_id: string; token: string }>(`/api/nodes/${id}/regenerate-token`, {
      method: "POST",
    }),

  // Stats
  getStats: (id: string) => request<NodeStats>(`/api/nodes/${id}/stats`),

  // Allocations
  addAllocation: (nodeId: string, data: { ip: string; port: number; alias?: string }) =>
    request<Allocation>(`/api/nodes/${nodeId}/allocations`, { method: "POST", body: data }),
  addAllocationRange: (nodeId: string, data: { ip: string; startPort: number; endPort: number }) =>
    request<{ count: number }>(`/api/nodes/${nodeId}/allocations/range`, {
      method: "POST",
      body: data,
    }),
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
    request<{ success: boolean; blueprint: Blueprint; message: string }>(
      "/api/blueprints/import/egg",
      {
        method: "POST",
        body: egg,
      }
    ),
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
  reinstall: (id: string) =>
    request<{ success: boolean; message: string; containerId: string }>(
      `/api/servers/${id}/reinstall`,
      { method: "POST" }
    ),
  setStatus: (id: string, status: string) =>
    request<Server>(`/api/servers/${id}/status`, { method: "PATCH", body: { status } }),

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
      request<FileList>(
        `/api/servers/${serverId}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`
      ),
    diskUsage: (serverId: string) =>
      request<DiskUsage>(`/api/servers/${serverId}/files/disk-usage`),
    read: async (serverId: string, path: string) => {
      const response = await request<{ content: string }>(
        `/api/servers/${serverId}/files/read?path=${encodeURIComponent(path)}`
      );
      return response.content;
    },
    write: (serverId: string, path: string, content: string) =>
      request(`/api/servers/${serverId}/files/write`, { method: "POST", body: { path, content } }),
    create: (serverId: string, path: string, type: "file" | "directory", content?: string) =>
      request(`/api/servers/${serverId}/files/create`, {
        method: "POST",
        body: { path, type, content },
      }),
    delete: (serverId: string, path: string) =>
      request(`/api/servers/${serverId}/files/delete?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      }),
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
      request(`/api/servers/${serverId}/backups/restore?id=${encodeURIComponent(backupId)}`, {
        method: "POST",
      }),
    delete: (serverId: string, backupId: string) =>
      request(`/api/servers/${serverId}/backups/delete?id=${encodeURIComponent(backupId)}`, {
        method: "DELETE",
      }),
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

  // Allocations
  allocations: {
    list: (serverId: string) => request<Allocation[]>(`/api/servers/${serverId}/allocations`),
    available: (serverId: string) =>
      request<Allocation[]>(`/api/servers/${serverId}/allocations/available`),
    add: (serverId: string, allocationId: string) =>
      request<Allocation>(`/api/servers/${serverId}/allocations`, {
        method: "POST",
        body: { allocationId },
      }),
    remove: (serverId: string, allocationId: string) =>
      request(`/api/servers/${serverId}/allocations/${allocationId}`, { method: "DELETE" }),
    setPrimary: (serverId: string, allocationId: string) =>
      request<{ success: boolean; allocation: Allocation }>(
        `/api/servers/${serverId}/allocations/${allocationId}/primary`,
        { method: "POST" }
      ),
  },

  // Schedules
  schedules: {
    list: (serverId: string) => request<Schedule[]>(`/api/servers/${serverId}/schedules`),
    get: (serverId: string, scheduleId: string) =>
      request<Schedule>(`/api/servers/${serverId}/schedules/${scheduleId}`),
    create: (serverId: string, data: CreateScheduleData) =>
      request<Schedule>(`/api/servers/${serverId}/schedules`, { method: "POST", body: data }),
    update: (serverId: string, scheduleId: string, data: Partial<CreateScheduleData>) =>
      request<Schedule>(`/api/servers/${serverId}/schedules/${scheduleId}`, {
        method: "PATCH",
        body: data,
      }),
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

  // Activity logs
  activity: {
    list: (serverId: string, options?: { limit?: number; offset?: number; event?: string }) => {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", options.limit.toString());
      if (options?.offset) params.set("offset", options.offset.toString());
      if (options?.event) params.set("event", options.event);
      const queryString = params.toString();
      return request<ActivityLogResponse>(
        `/api/servers/${serverId}/activity${queryString ? `?${queryString}` : ""}`
      );
    },
  },

  // Server members (subusers)
  members: {
    list: (serverId: string) => request<ServerMember[]>(`/api/servers/${serverId}/members`),
    get: (serverId: string, memberId: string) =>
      request<ServerMember>(`/api/servers/${serverId}/members/${memberId}`),
    update: (serverId: string, memberId: string, data: { permissions: string[] }) =>
      request<ServerMember>(`/api/servers/${serverId}/members/${memberId}`, {
        method: "PATCH",
        body: data,
      }),
    remove: (serverId: string, memberId: string) =>
      request(`/api/servers/${serverId}/members/${memberId}`, { method: "DELETE" }),
  },

  // Server invitations
  invitations: {
    list: (serverId: string) => request<ServerInvitation[]>(`/api/servers/${serverId}/invitations`),
    create: (serverId: string, data: { email: string; permissions: string[] }) =>
      request<ServerInvitation>(`/api/servers/${serverId}/invitations`, {
        method: "POST",
        body: data,
      }),
    cancel: (serverId: string, invitationId: string) =>
      request(`/api/servers/${serverId}/invitations/${invitationId}`, { method: "DELETE" }),
  },

  // Server splitting
  split: {
    children: (serverId: string) => request<ChildServer[]>(`/api/servers/${serverId}/children`),
    create: (
      serverId: string,
      data: { name: string; memoryPercent: number; diskPercent: number; cpuPercent: number }
    ) =>
      request<SplitServerResponse>(`/api/servers/${serverId}/split`, {
        method: "POST",
        body: data,
      }),
  },
};

// Invitation endpoints (not server-scoped)
export const invitations = {
  get: (token: string) => request<InvitationDetails>(`/api/servers/invitation/${token}`),
  accept: (token: string) =>
    request<{ success: boolean; server: { id: string; name: string } }>(
      `/api/servers/invitation/${token}/accept`,
      { method: "POST" }
    ),
  decline: (token: string) =>
    request(`/api/servers/invitation/${token}/decline`, { method: "POST" }),
  myInvitations: () => request<PendingInvitation[]>(`/api/servers/my-invitations`),
  myMemberships: () => request<Membership[]>(`/api/servers/my-memberships`),
};

// Permissions metadata
export const permissions = {
  definitions: () => request<PermissionDefinitions>(`/api/servers/permissions`),
};

// Webhooks endpoints
export const webhooks = {
  list: () => request<Webhook[]>(`/api/webhooks`),
  get: (webhookId: string) => request<Webhook>(`/api/webhooks/${webhookId}`),
  create: (data: {
    serverId?: string;
    url: string;
    events: WebhookEvent[];
    provider?: "generic" | "discord" | "slack";
  }) => request<Webhook>(`/api/webhooks`, { method: "POST", body: data }),
  update: (
    webhookId: string,
    data: {
      url?: string;
      events?: WebhookEvent[];
      enabled?: boolean;
      provider?: "generic" | "discord" | "slack";
    }
  ) => request<Webhook>(`/api/webhooks/${webhookId}`, { method: "PATCH", body: data }),
  delete: (webhookId: string) => request(`/api/webhooks/${webhookId}`, { method: "DELETE" }),
  regenerateSecret: (webhookId: string) =>
    request<{ secret: string }>(`/api/webhooks/${webhookId}/regenerate-secret`, { method: "POST" }),
  deliveries: (webhookId: string, limit?: number, offset?: number) =>
    request<{ deliveries: WebhookDelivery[]; total: number }>(
      `/api/webhooks/${webhookId}/deliveries?limit=${limit || 50}&offset=${offset || 0}`
    ),
  retryDelivery: (webhookId: string, deliveryId: string) =>
    request(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`, { method: "POST" }),
};

// Admin settings
export const adminSettings = {
  // Overview
  get: () => request<SettingsOverview>("/api/admin/settings"),

  // Cloudflare
  cloudflare: {
    get: () => request<CloudflareSettings>("/api/admin/settings/cloudflare"),
    update: (data: Partial<CloudflareSettings>) =>
      request<CloudflareSettings>("/api/admin/settings/cloudflare", {
        method: "PATCH",
        body: data,
      }),
    test: () =>
      request<{
        success: boolean;
        error?: string;
        zone?: { id: string; name: string; status: string };
      }>("/api/admin/settings/cloudflare/test", { method: "POST" }),
  },

  // Subdomains
  subdomains: {
    get: () => request<SubdomainSettings>("/api/admin/settings/subdomains"),
    update: (data: Partial<SubdomainSettings>) =>
      request<SubdomainSettings>("/api/admin/settings/subdomains", { method: "PATCH", body: data }),
  },

  // Email
  email: {
    get: () => request<EmailSettings>("/api/admin/settings/email"),
    update: (data: Partial<EmailSettings>) =>
      request<EmailSettings>("/api/admin/settings/email", { method: "PATCH", body: data }),
    test: (testEmail: string) =>
      request<{ success: boolean; error?: string; message?: string }>(
        "/api/admin/settings/email/test",
        { method: "POST", body: { testEmail } }
      ),
  },

  // Branding
  branding: {
    get: () => request<BrandingSettings>("/api/admin/settings/branding"),
    update: (data: Partial<BrandingSettings>) =>
      request<BrandingSettings>("/api/admin/settings/branding", { method: "PATCH", body: data }),
    getPublic: () => request<PublicBrandingSettings>("/api/admin/settings/branding/public"),
  },
};

// Public feature flags (no auth required)
export interface SubdomainFeatureStatus {
  enabled: boolean;
  baseDomain: string | null;
  dnsProvider: "cloudflare" | "manual";
}

export const features = {
  subdomains: () => request<SubdomainFeatureStatus>("/api/features/subdomains"),
};

// System setup (public endpoints)
export interface SystemStatus {
  initialized: boolean;
  hasAdmin: boolean;
  userCount: number;
}

export interface SetupData {
  name: string;
  email: string;
  password: string;
}

export interface SetupResponse {
  success: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  message: string;
}

export const setup = {
  status: () => request<SystemStatus>("/api/admin/status"),
  createAdmin: (data: SetupData) =>
    request<SetupResponse>("/api/setup", { method: "POST", body: data }),
};
