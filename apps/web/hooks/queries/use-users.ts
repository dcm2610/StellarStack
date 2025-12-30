import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { account, User } from "@/lib/api";

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: () => [...userKeys.lists()] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  me: () => [...userKeys.all, "me"] as const,
};

export const useUsers = () => {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: () => account.listUsers(),
  });
};

export const useUser = (id: string | undefined) => {
  return useQuery({
    queryKey: userKeys.detail(id!),
    queryFn: () => account.getUser(id!),
    enabled: !!id,
  });
};

export const useCurrentUser = () => {
  return useQuery({
    queryKey: userKeys.me(),
    queryFn: () => account.me(),
  });
};

export const useUserMutations = () => {
  const queryClient = useQueryClient();

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: userKeys.all });
  };

  const create = useMutation({
    mutationFn: (data: {
      name: string;
      email: string;
      password: string;
      role?: "user" | "admin";
    }) => account.createUser(data),
    onSuccess: invalidateUsers,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; role?: string } }) =>
      account.updateUser(id, data),
    onSuccess: invalidateUsers,
  });

  const remove = useMutation({
    mutationFn: (id: string) => account.deleteUser(id),
    onSuccess: invalidateUsers,
  });

  const updateMe = useMutation({
    mutationFn: (data: { name?: string; email?: string }) => account.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.me() });
    },
  });

  return { create, update, remove, updateMe };
};
