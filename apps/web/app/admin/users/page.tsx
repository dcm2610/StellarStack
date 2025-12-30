"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FadeIn } from "@workspace/ui/components/fade-in";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import { FormModal } from "@workspace/ui/components/form-modal";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import {
  UsersIcon,
  TrashIcon,
  EditIcon,
  ShieldIcon,
  UserIcon,
  ArrowLeftIcon,
  SearchIcon,
  PlusIcon,
} from "lucide-react";
import { useUsers, useUserMutations } from "@/hooks/queries";
import { useAdminTheme } from "@/hooks/use-admin-theme";
import { useAuth } from "@/components/auth-provider";
import type { User } from "@/lib/api";
import { toast } from "sonner";

export default function UsersPage() {
  const router = useRouter();
  const { mounted, isDark, inputClasses, labelClasses, selectClasses } = useAdminTheme();
  const { user: currentUser } = useAuth();

  // React Query hooks
  const { data: usersList = [], isLoading } = useUsers();
  const { create, update, remove } = useUserMutations();

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "user" as "user" | "admin",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "user",
    });
    setEditingUser(null);
    setIsCreateMode(false);
  };

  const handleSubmit = async () => {
    if (isCreateMode) {
      try {
        await create.mutateAsync({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        });
        toast.success("User created successfully");
        setIsModalOpen(false);
        resetForm();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Failed to create user";
        toast.error(errorMessage);
      }
      return;
    }

    if (!editingUser) return;

    try {
      await update.mutateAsync({
        id: editingUser.id,
        data: { name: formData.name, role: formData.role },
      });
      toast.success("User updated successfully");
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Failed to update user");
    }
  };

  const handleCreate = () => {
    setIsCreateMode(true);
    setEditingUser(null);
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "user",
    });
    setIsModalOpen(true);
  };

  const handleEdit = (user: User) => {
    setIsCreateMode(false);
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirmUser) return;
    try {
      await remove.mutateAsync(deleteConfirmUser.id);
      toast.success("User deleted successfully");
      setDeleteConfirmUser(null);
    } catch (error) {
      toast.error("Failed to delete user");
    }
  };

  const toggleRole = async (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot change your own role");
      return;
    }
    try {
      const newRole = user.role === "admin" ? "user" : "admin";
      await update.mutateAsync({ id: user.id, data: { role: newRole } });
      toast.success(`User role changed to ${newRole}`);
    } catch (error) {
      toast.error("Failed to update user role");
    }
  };

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return usersList;
    const query = searchQuery.toLowerCase();
    return usersList.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query)
    );
  }, [usersList, searchQuery]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "relative min-h-svh transition-colors",
        isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
      )}
    >
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="mx-auto max-w-6xl">
          <FadeIn delay={0}>
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/admin")}
                  className={cn(
                    "p-2 transition-all hover:scale-110 active:scale-95",
                    isDark
                      ? "text-zinc-400 hover:text-zinc-100"
                      : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                </Button>
                <div>
                  <h1
                    className={cn(
                      "text-2xl font-light tracking-wider",
                      isDark ? "text-zinc-100" : "text-zinc-800"
                    )}
                  >
                    USERS
                  </h1>
                  <p className={cn("mt-1 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                    Manage user accounts and permissions
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreate}
                className={cn(
                  "gap-2 text-xs tracking-wider uppercase",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                <PlusIcon className="h-4 w-4" />
                Create User
              </Button>
            </div>

            {/* Search Bar */}
            <div className="relative mb-6">
              <SearchIcon
                className={cn(
                  "absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}
              />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "w-full border py-2.5 pr-4 pl-10 text-sm transition-colors focus:outline-none",
                  isDark
                    ? "border-zinc-700 bg-zinc-900/50 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500"
                    : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400"
                )}
              />
            </div>
          </FadeIn>

          {/* Users Table */}
          <FadeIn delay={0.1}>
            <div
              className={cn(
                "overflow-hidden border",
                isDark ? "border-zinc-700/50" : "border-zinc-200"
              )}
            >
              <table className="w-full">
                <thead>
                  <tr
                    className={cn(
                      "text-xs tracking-wider uppercase",
                      isDark ? "bg-zinc-900/50 text-zinc-400" : "bg-zinc-50 text-zinc-600"
                    )}
                  >
                    <th className="p-3 text-left">User</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Role</th>
                    <th className="p-3 text-left">Created</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center">
                        <Spinner className="mx-auto h-6 w-6" />
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className={cn(
                          "py-12 text-center text-sm",
                          isDark ? "text-zinc-500" : "text-zinc-400"
                        )}
                      >
                        {searchQuery ? "No users match your search." : "No users found."}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className={cn(
                          "border-t transition-colors",
                          isDark
                            ? "border-zinc-700/50 hover:bg-zinc-900/30"
                            : "border-zinc-200 hover:bg-zinc-50"
                        )}
                      >
                        <td className={cn("p-3", isDark ? "text-zinc-100" : "text-zinc-800")}>
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-8 w-8 items-center justify-center border",
                                isDark
                                  ? "border-zinc-700 bg-zinc-800 text-zinc-400"
                                  : "border-zinc-300 bg-zinc-100 text-zinc-600"
                              )}
                            >
                              {user.role === "admin" ? (
                                <ShieldIcon className="h-4 w-4" />
                              ) : (
                                <UserIcon className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{user.name}</div>
                              {user.id === currentUser?.id && (
                                <div
                                  className={cn(
                                    "text-xs",
                                    isDark ? "text-zinc-500" : "text-zinc-400"
                                  )}
                                >
                                  (You)
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          className={cn("p-3 text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}
                        >
                          {user.email}
                          {user.emailVerified && (
                            <span
                              className={cn(
                                "ml-2 border px-1 py-0.5 text-xs",
                                isDark
                                  ? "border-zinc-600 text-zinc-400"
                                  : "border-zinc-400 text-zinc-500"
                              )}
                            >
                              Verified
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => toggleRole(user)}
                            disabled={user.id === currentUser?.id || update.isPending}
                            className={cn(
                              "inline-flex items-center gap-1.5 border px-2 py-1 text-xs font-medium tracking-wider uppercase transition-colors",
                              isDark
                                ? "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700"
                                : "border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                              user.id === currentUser?.id && "cursor-not-allowed opacity-50"
                            )}
                          >
                            {user.role === "admin" ? (
                              <ShieldIcon className="h-3 w-3" />
                            ) : (
                              <UserIcon className="h-3 w-3" />
                            )}
                            {user.role}
                          </button>
                        </td>
                        <td
                          className={cn("p-3 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}
                        >
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(user)}
                              className={cn(
                                "p-1.5 text-xs",
                                isDark
                                  ? "border-zinc-700 text-zinc-400 hover:text-zinc-100"
                                  : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                              )}
                            >
                              <EditIcon className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (user.id === currentUser?.id) {
                                  toast.error("You cannot delete yourself");
                                  return;
                                }
                                setDeleteConfirmUser(user);
                              }}
                              disabled={user.id === currentUser?.id}
                              className={cn(
                                "p-1.5 text-xs",
                                user.id === currentUser?.id
                                  ? "cursor-not-allowed opacity-50"
                                  : isDark
                                    ? "border-red-900/50 text-red-400 hover:bg-red-900/20"
                                    : "border-red-200 text-red-600 hover:bg-red-50"
                              )}
                            >
                              <TrashIcon className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <FormModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) resetForm();
        }}
        title={isCreateMode ? "Create User" : "Edit User"}
        submitLabel={isCreateMode ? "Create" : "Update"}
        onSubmit={handleSubmit}
        isDark={isDark}
        isLoading={isCreateMode ? create.isPending : update.isPending}
        isValid={
          isCreateMode
            ? formData.name.length > 0 && formData.email.length > 0 && formData.password.length >= 8
            : formData.name.length > 0
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelClasses}>Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="User name"
              className={inputClasses}
              required
            />
          </div>

          <div>
            <label className={labelClasses}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@example.com"
              className={cn(inputClasses, !isCreateMode && "cursor-not-allowed opacity-50")}
              disabled={!isCreateMode}
              required
            />
            {!isCreateMode && (
              <p className={cn("mt-1 text-xs", isDark ? "text-zinc-600" : "text-zinc-400")}>
                Email cannot be changed
              </p>
            )}
          </div>

          {isCreateMode && (
            <div>
              <label className={labelClasses}>Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimum 8 characters"
                className={inputClasses}
                required
                minLength={8}
              />
              {formData.password.length > 0 && formData.password.length < 8 && (
                <p className={cn("mt-1 text-xs", isDark ? "text-amber-500" : "text-amber-600")}>
                  Password must be at least 8 characters
                </p>
              )}
            </div>
          )}

          <div>
            <label className={labelClasses}>Role</label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value as "user" | "admin" })
              }
              className={selectClasses}
              disabled={!isCreateMode && editingUser?.id === currentUser?.id}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            {!isCreateMode && editingUser?.id === currentUser?.id && (
              <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                You cannot change your own role
              </p>
            )}
          </div>
        </div>
      </FormModal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        open={!!deleteConfirmUser}
        onOpenChange={(open) => !open && setDeleteConfirmUser(null)}
        title="Delete User"
        description={`Are you sure you want to delete "${deleteConfirmUser?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isDark={isDark}
        variant="danger"
        isLoading={remove.isPending}
      />
    </div>
  );
}
