"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { UsersIcon, TrashIcon, EditIcon, ShieldIcon, UserIcon, ArrowLeftIcon } from "lucide-react";
import { account } from "@/lib/api";
import type { User } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

export default function UsersPage() {
  const router = useRouter();
  const { resolvedTheme } = useNextTheme();
  const { user: currentUser } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    role: "user" as "user" | "admin",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = async () => {
    try {
      const data = await account.listUsers();
      setUsersList(data);
    } catch (error) {
      toast.error("Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const resetForm = () => {
    setFormData({
      name: "",
      role: "user",
    });
    setEditingUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await account.updateUser(editingUser.id, {
        name: formData.name,
        role: formData.role,
      });
      toast.success("User updated successfully");
      setIsModalOpen(false);
      resetForm();
      fetchData();
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

  const handleDelete = async (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot delete yourself");
      return;
    }
    if (!confirm(`Are you sure you want to delete "${user.name}"?`)) return;
    try {
      await account.deleteUser(user.id);
      toast.success("User deleted successfully");
      fetchData();
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
      await account.updateUser(user.id, { role: newRole });
      toast.success(`User role changed to ${newRole}`);
      fetchData();
    } catch (error) {
      toast.error("Failed to update user role");
    }
  };

  const inputClasses = cn(
    "w-full px-3 py-2 border text-sm transition-colors focus:outline-none",
    isDark
      ? "bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500"
      : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-400"
  );

  const labelClasses = cn(
    "block text-xs font-medium uppercase tracking-wider mb-1",
    isDark ? "text-zinc-400" : "text-zinc-600"
  );

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
                <td colSpan={5} className={cn("text-center py-12 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
                  Loading...
                </td>
              </tr>
            ) : usersList.length === 0 ? (
              <tr>
                <td colSpan={5} className={cn("text-center py-12 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
                  No users found.
                </td>
              </tr>
            ) : (
              usersList.map((user) => (
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
                        "w-8 h-8 flex items-center justify-center rounded-full",
                        user.role === "admin"
                          ? isDark ? "bg-amber-900/30 text-amber-400" : "bg-amber-100 text-amber-600"
                          : isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-600"
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
                      <span className={cn("ml-2 text-xs", isDark ? "text-green-400" : "text-green-600")}>
                        Verified
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => toggleRole(user)}
                      disabled={user.id === currentUser?.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-1 text-xs uppercase tracking-wider font-medium transition-colors",
                        user.role === "admin"
                          ? isDark
                            ? "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : isDark
                            ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
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
                        onClick={() => handleDelete(user)}
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
      {isModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={cn(
            "relative w-full max-w-md mx-4 p-6 border",
            isDark
              ? "bg-[#0f0f0f] border-zinc-700"
              : "bg-white border-zinc-300"
          )}>
            {/* Corner accents */}
            <div className={cn("absolute top-0 left-0 w-3 h-3 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-3 h-3 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-lg font-light tracking-wider mb-6",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}>
              Edit User
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                  value={editingUser.email}
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
                  className={inputClasses}
                  disabled={editingUser.id === currentUser?.id}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                {editingUser.id === currentUser?.id && (
                  <p className={cn("text-xs mt-1", isDark ? "text-amber-400" : "text-amber-600")}>
                    You cannot change your own role
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsModalOpen(false); resetForm(); }}
                  className={cn(
                    "text-xs uppercase tracking-wider",
                    isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-600"
                  )}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className={cn(
                    "text-xs uppercase tracking-wider",
                    isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  )}
                >
                  Update
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
