import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  servers,
  permissions,
  ServerMember,
  ServerInvitation,
  PermissionDefinitions,
} from "@/lib/api";

export const memberKeys = {
  all: ["server-members"] as const,
  lists: () => [...memberKeys.all, "list"] as const,
  list: (serverId: string) => [...memberKeys.lists(), serverId] as const,
  invitations: () => [...memberKeys.all, "invitations"] as const,
  invitation: (serverId: string) => [...memberKeys.invitations(), serverId] as const,
  permissions: () => [...memberKeys.all, "permissions"] as const,
};

export const useServerMembers = (serverId: string | undefined) => {
  return useQuery({
    queryKey: memberKeys.list(serverId!),
    queryFn: () => servers.members.list(serverId!),
    enabled: !!serverId,
  });
};

export const useServerInvitations = (serverId: string | undefined) => {
  return useQuery({
    queryKey: memberKeys.invitation(serverId!),
    queryFn: () => servers.invitations.list(serverId!),
    enabled: !!serverId,
  });
};

export const usePermissionDefinitions = () => {
  return useQuery({
    queryKey: memberKeys.permissions(),
    queryFn: () => permissions.definitions(),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour since permissions rarely change
  });
};

export const useServerMemberMutations = (serverId: string) => {
  const queryClient = useQueryClient();

  const invalidateMembers = () => {
    queryClient.invalidateQueries({ queryKey: memberKeys.list(serverId) });
  };

  const invalidateInvitations = () => {
    queryClient.invalidateQueries({ queryKey: memberKeys.invitation(serverId) });
  };

  const updateMember = useMutation({
    mutationFn: ({ memberId, permissions }: { memberId: string; permissions: string[] }) =>
      servers.members.update(serverId, memberId, { permissions }),
    onSuccess: invalidateMembers,
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => servers.members.remove(serverId, memberId),
    onSuccess: invalidateMembers,
  });

  const createInvitation = useMutation({
    mutationFn: ({ email, permissions }: { email: string; permissions: string[] }) =>
      servers.invitations.create(serverId, { email, permissions }),
    onSuccess: invalidateInvitations,
  });

  const cancelInvitation = useMutation({
    mutationFn: (invitationId: string) => servers.invitations.cancel(serverId, invitationId),
    onSuccess: invalidateInvitations,
  });

  return {
    updateMember,
    removeMember,
    createInvitation,
    cancelInvitation,
  };
};
