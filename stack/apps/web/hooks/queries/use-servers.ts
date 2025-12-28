import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { servers, Server, CreateServerData } from "@/lib/api";

export const serverKeys = {
  all: ["servers"] as const,
  lists: () => [...serverKeys.all, "list"] as const,
  list: () => [...serverKeys.lists()] as const,
  details: () => [...serverKeys.all, "detail"] as const,
  detail: (id: string) => [...serverKeys.details(), id] as const,
  console: (id: string) => [...serverKeys.all, "console", id] as const,
};

export function useServers() {
  return useQuery({
    queryKey: serverKeys.list(),
    queryFn: () => servers.list(),
  });
}

export function useServer(id: string | undefined, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: serverKeys.detail(id!),
    queryFn: () => servers.get(id!),
    enabled: !!id,
    // Default to polling every 5 seconds, can be overridden by options
    refetchInterval: options?.refetchInterval ?? 5000,
    // Only poll when the window is focused
    refetchIntervalInBackground: false,
  });
}

export function useServerConsole(id: string | undefined) {
  return useQuery({
    queryKey: serverKeys.console(id!),
    queryFn: () => servers.console(id!),
    enabled: !!id,
    staleTime: 60 * 1000, // Console token valid for longer
  });
}

export function useServerMutations() {
  const queryClient = useQueryClient();

  const invalidateServer = (id: string) => {
    queryClient.invalidateQueries({ queryKey: serverKeys.detail(id) });
    queryClient.invalidateQueries({ queryKey: serverKeys.list() });
  };

  const create = useMutation({
    mutationFn: (data: CreateServerData) => servers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.list() });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateServerData> }) =>
      servers.update(id, data),
    onSuccess: (_, { id }) => invalidateServer(id),
  });

  const remove = useMutation({
    mutationFn: (id: string) => servers.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.list() });
    },
  });

  const start = useMutation({
    mutationFn: (id: string) => servers.start(id),
    onSuccess: (_, id) => invalidateServer(id),
  });

  const stop = useMutation({
    mutationFn: (id: string) => servers.stop(id),
    onSuccess: (_, id) => invalidateServer(id),
  });

  const restart = useMutation({
    mutationFn: (id: string) => servers.restart(id),
    onSuccess: (_, id) => invalidateServer(id),
  });

  const kill = useMutation({
    mutationFn: (id: string) => servers.kill(id),
    onSuccess: (_, id) => invalidateServer(id),
  });

  const sync = useMutation({
    mutationFn: (id: string) => servers.sync(id),
    onSuccess: (_, id) => invalidateServer(id),
  });

  const reinstall = useMutation({
    mutationFn: (id: string) => servers.reinstall(id),
    onSuccess: (_, id) => invalidateServer(id),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      servers.setStatus(id, status),
    onSuccess: (_, { id }) => invalidateServer(id),
  });

  const sendCommand = useMutation({
    mutationFn: ({ id, command }: { id: string; command: string }) =>
      servers.command(id, command),
  });

  return {
    create,
    update,
    remove,
    start,
    stop,
    restart,
    kill,
    sync,
    reinstall,
    setStatus,
    sendCommand,
  };
}
