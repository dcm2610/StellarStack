"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { FormModal } from "@workspace/ui/components/shared/FormModal";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import { UsersIcon, TrashIcon, EditIcon, ShieldIcon, UserIcon, ArrowLeftIcon, SearchIcon } from "lucide-react";
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
  const { update, remove } = useUserMutations();

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    role: "user" as "user" | "admin",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      role: "user",
    });
    setEditingUser(null);
  };

  const handleSubmit = async () => {
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

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
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
    return usersList.filter((user) =>
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query)
    );
  }, [usersList, searchQuery]);

  if (!mounted) return null;

  return (
    <div className={cn("min-h-svh transition-colors relative", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-6xl mx-auto">
          <FadeIn delay={0}>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/admin")}
                  className={cn(
                    "p-2 transition-all hover:scale-110 active:scale-95",
                    isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                </Button>
                <div>
                  <h1 className={cn(
                    "text-2xl font-light tracking-wider",
                    isDark ? "text-zinc-100" : "text-zinc-800"
                  )}>
                    USERS
                  </h1>
                  <p className={cn(
                    "text-sm mt-1",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    Manage user accounts and permissions
                  </p>
                </div>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mb-6">
              <SearchIcon className={cn(
                "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                isDark ? "text-zinc-500" : "text-zinc-400"
              )} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "w-full pl-10 pr-4 py-2.5 border text-sm transition-colors focus:outline-none",
                  isDark
                    ? "bg-zinc-900/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500"
                    : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400"
                )}
              />
            </div>
          </FadeIn>

          {/* Users Table */}
          <FadeIn delay={0.1}>
            <div className={cn(
              "border overflow-hidden",
              isDark ? "border-zinc-700/50" : "border-zinc-200"
            )}>
              <table className="w-full">
                <thead>
                  <tr className={cn(
                    "text-xs uppercase tracking-wider",
                    isDark ? "bg-zinc-900/50 text-zinc-400" : "bg-zinc-50 text-zinc-600"
                  )}>
                    <th className="text-left p-3">User</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Role</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12">
                        <Spinner className="w-6 h-6 mx-auto" />
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={cn("text-center py-12 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
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
                            <div className={cn(
                              "w-8 h-8 flex items-center justify-center border",
                              isDark ? "border-zinc-700 bg-zinc-800 text-zinc-400" : "border-zinc-300 bg-zinc-100 text-zinc-600"
                            )}>
                              {user.role === "admin" ? (
                                <ShieldIcon className="w-4 h-4" />
                              ) : (
                                <UserIcon className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{user.name}</div>
                              {user.id === currentUser?.id && (
                                <div className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                                  (You)
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={cn("p-3 text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}>
                          {user.email}
                          {user.emailVerified && (
                            <span className={cn("ml-2 text-xs border px-1 py-0.5", isDark ? "text-zinc-400 border-zinc-600" : "text-zinc-500 border-zinc-400")}>
                              Verified
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => toggleRole(user)}
                            disabled={user.id === currentUser?.id || update.isPending}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-1 text-xs uppercase tracking-wider font-medium transition-colors border",
                              isDark
                                ? "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700"
                                : "border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                              user.id === currentUser?.id && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {user.role === "admin" ? (
                              <ShieldIcon className="w-3 h-3" />
                            ) : (
                              <UserIcon className="w-3 h-3" />
                            )}
                            {user.role}
                          </button>
                        </td>
                        <td className={cn("p-3 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(user)}
                              className={cn(
                                "text-xs p-1.5",
                                isDark ? "border-zinc-700 text-zinc-400 hover:text-zinc-100" : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                              )}
                            >
                              <EditIcon className="w-3 h-3" />
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
                                "text-xs p-1.5",
                                user.id === currentUser?.id
                                  ? "opacity-50 cursor-not-allowed"
                                  : isDark
                                    ? "border-red-900/50 text-red-400 hover:bg-red-900/20"
                                    : "border-red-200 text-red-600 hover:bg-red-50"
                              )}
                            >
                              <TrashIcon className="w-3 h-3" />
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

      {/* Edit Modal */}
      <FormModal
        open={isModalOpen && !!editingUser}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) resetForm();
        }}
        title="Edit User"
        submitLabel="Update"
        onSubmit={handleSubmit}
        isDark={isDark}
        isLoading={update.isPending}
        isValid={formData.name.length > 0}
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
              value={editingUser?.email || ""}
              disabled
              className={cn(inputClasses, "opacity-50 cursor-not-allowed")}
            />
            <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
              Email cannot be changed
            </p>
          </div>

          <div>
            <label className={labelClasses}>Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as "user" | "admin" })}
              className={selectClasses}
              disabled={editingUser?.id === currentUser?.id}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            {editingUser?.id === currentUser?.id && (
              <p className={cn("text-xs mt-1", isDark ? "text-zinc-500" : "text-zinc-500")}>
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
