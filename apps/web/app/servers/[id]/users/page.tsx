"use client";

import { useState, useEffect, useMemo, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import {
  BsSun,
  BsMoon,
  BsPlus,
  BsTrash,
  BsPencil,
  BsPersonFill,
  BsShieldFill,
  BsEnvelope,
  BsClock,
} from "react-icons/bs";
import { toast } from "sonner";
import { useServer } from "@/components/server-provider";
import { useAuth } from "@/components/auth-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { ServerSuspendedPlaceholder } from "@/components/server-suspended-placeholder";
import {
  useServerMembers,
  useServerInvitations,
  usePermissionDefinitions,
  useServerMemberMutations,
} from "@/hooks/queries";
import type { ServerMember, ServerInvitation, PermissionCategory } from "@/lib/api";

const UsersPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server, isInstalling } = useServer();
  const { user: currentUser } = useAuth();
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  // Data fetching
  const { data: members = [], isLoading: membersLoading } = useServerMembers(serverId);
  const { data: invitations = [], isLoading: invitationsLoading } = useServerInvitations(serverId);
  const { data: permissionDefs } = usePermissionDefinitions();
  const { updateMember, removeMember, createInvitation, cancelInvitation } =
    useServerMemberMutations(serverId);

  // Modal states
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [cancelInviteModalOpen, setCancelInviteModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ServerMember | null>(null);
  const [selectedInvitation, setSelectedInvitation] = useState<ServerInvitation | null>(null);

  // Form states
  const [formEmail, setFormEmail] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;
  const isLoading = membersLoading || invitationsLoading;

  // Check if current user is server owner
  const isOwner = server?.ownerId === currentUser?.id;

  // Get all available permissions from definitions
  const allPermissions = useMemo(() => {
    if (!permissionDefs?.categories) return [];
    return permissionDefs.categories.flatMap((cat) => cat.permissions);
  }, [permissionDefs]);

  if (!mounted) return null;

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        <ServerInstallingPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  if (server?.status === "SUSPENDED") {
    return (
      <div className="min-h-svh">
        <ServerSuspendedPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  const resetForm = () => {
    setFormEmail("");
    setSelectedPermissions([]);
  };

  const openInviteModal = () => {
    resetForm();
    setInviteModalOpen(true);
  };

  const openEditModal = (member: ServerMember) => {
    setSelectedMember(member);
    setSelectedPermissions([...member.permissions]);
    setEditModalOpen(true);
  };

  const openDeleteModal = (member: ServerMember) => {
    setSelectedMember(member);
    setDeleteModalOpen(true);
  };

  const openCancelInviteModal = (invitation: ServerInvitation) => {
    setSelectedInvitation(invitation);
    setCancelInviteModalOpen(true);
  };

  const handleInvite = async () => {
    try {
      await createInvitation.mutateAsync({
        email: formEmail,
        permissions: selectedPermissions,
      });
      toast.success("Invitation sent successfully");
      setInviteModalOpen(false);
      resetForm();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to send invitation";
      toast.error(errorMessage);
    }
  };

  const handleEditPermissions = async () => {
    if (!selectedMember) return;
    try {
      await updateMember.mutateAsync({
        memberId: selectedMember.id,
        permissions: selectedPermissions,
      });
      toast.success("Permissions updated successfully");
      setEditModalOpen(false);
      setSelectedMember(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update permissions";
      toast.error(errorMessage);
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedMember) return;
    try {
      await removeMember.mutateAsync(selectedMember.id);
      toast.success("Member removed successfully");
      setDeleteModalOpen(false);
      setSelectedMember(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to remove member";
      toast.error(errorMessage);
    }
  };

  const handleCancelInvitation = async () => {
    if (!selectedInvitation) return;
    try {
      await cancelInvitation.mutateAsync(selectedInvitation.id);
      toast.success("Invitation cancelled");
      setCancelInviteModalOpen(false);
      setSelectedInvitation(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to cancel invitation";
      toast.error(errorMessage);
    }
  };

  const togglePermission = (permissionKey: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionKey)
        ? prev.filter((p) => p !== permissionKey)
        : [...prev, permissionKey]
    );
  };

  const isEmailValid = formEmail.includes("@") && formEmail.includes(".");

  const getPermissionCount = (permissions: string[]) => {
    return `${permissions.length} permission${permissions.length !== 1 ? "s" : ""}`;
  };

  const PermissionSelector = ({ categories }: { categories: PermissionCategory[] }) => (
    <div className="max-h-80 space-y-4 overflow-y-auto">
      {categories.map((category) => (
        <div key={category.id}>
          <div
            className={cn(
              "mb-2 text-xs font-medium tracking-wider uppercase",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}
          >
            {category.name}
          </div>
          <div className="grid gap-2">
            {category.permissions.map((perm) => (
              <button
                key={perm.key}
                type="button"
                onClick={() => togglePermission(perm.key)}
                className={cn(
                  "flex items-center gap-3 border p-3 text-left transition-all",
                  selectedPermissions.includes(perm.key)
                    ? isDark
                      ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                      : "border-zinc-400 bg-zinc-100 text-zinc-900"
                    : isDark
                      ? "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-400"
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 items-center justify-center border",
                    selectedPermissions.includes(perm.key)
                      ? isDark
                        ? "border-zinc-400 bg-zinc-600"
                        : "border-zinc-500 bg-zinc-400"
                      : isDark
                        ? "border-zinc-600"
                        : "border-zinc-400"
                  )}
                >
                  {selectedPermissions.includes(perm.key) && (
                    <div className={cn("h-2 w-2", isDark ? "bg-zinc-100" : "bg-zinc-100")} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{perm.name}</div>
                  <div
                    className={cn("truncate text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}
                  >
                    {perm.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative min-h-svh transition-colors">
      <div className="relative p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                className={cn(
                  "transition-all hover:scale-110 active:scale-95",
                  isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                )}
              />
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
                  {server?.name || `Server ${serverId}`} • {members.length} member
                  {members.length !== 1 ? "s" : ""}
                  {invitations.length > 0 && ` • ${invitations.length} pending`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openInviteModal}
                  className={cn(
                    "gap-2 transition-all",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                  )}
                >
                  <BsPlus className="h-4 w-4" />
                  <span className="text-xs tracking-wider uppercase">Invite User</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={cn(
                  "p-2 transition-all hover:scale-110 active:scale-95",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                {isDark ? <BsSun className="h-4 w-4" /> : <BsMoon className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner className="h-8 w-8" />
            </div>
          ) : (
            <>
              {/* Pending Invitations */}
              {invitations.length > 0 && (
                <div className="mb-8">
                  <h2
                    className={cn(
                      "mb-4 text-sm font-medium tracking-wider uppercase",
                      isDark ? "text-zinc-400" : "text-zinc-600"
                    )}
                  >
                    Pending Invitations
                  </h2>
                  <div className="space-y-3">
                    {invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className={cn(
                          "relative flex items-center justify-between border p-4 transition-all",
                          isDark
                            ? "border-amber-700/30 bg-amber-950/10"
                            : "border-amber-200 bg-amber-50"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center border",
                              isDark
                                ? "border-amber-700/50 bg-amber-900/30"
                                : "border-amber-300 bg-amber-100"
                            )}
                          >
                            <BsEnvelope
                              className={cn(
                                "h-5 w-5",
                                isDark ? "text-amber-400" : "text-amber-600"
                              )}
                            />
                          </div>
                          <div>
                            <div
                              className={cn(
                                "text-sm font-medium",
                                isDark ? "text-amber-200" : "text-amber-800"
                              )}
                            >
                              {invitation.email}
                            </div>
                            <div
                              className={cn(
                                "flex items-center gap-3 text-xs",
                                isDark ? "text-amber-200/60" : "text-amber-600"
                              )}
                            >
                              <span>{getPermissionCount(invitation.permissions)}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <BsClock className="h-3 w-3" />
                                Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {isOwner && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCancelInviteModal(invitation)}
                            className={cn(
                              "p-2 transition-all",
                              isDark
                                ? "border-amber-700/50 text-amber-400/80 hover:border-amber-600 hover:text-amber-300"
                                : "border-amber-300 text-amber-600 hover:border-amber-400"
                            )}
                          >
                            <BsTrash className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Members List */}
              <div className="space-y-4">
                {/* Server Owner (always shown first) */}
                {server?.owner && (
                  <div
                    className={cn(
                      "relative border p-6 transition-all",
                      isDark
                        ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                        : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
                    )}
                  >
                    {/* Corner decorations */}
                    <div
                      className={cn(
                        "absolute top-0 left-0 h-2 w-2 border-t border-l",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute top-0 right-0 h-2 w-2 border-t border-r",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center border",
                            isDark
                              ? "border-amber-700/50 bg-amber-900/30"
                              : "border-amber-300 bg-amber-100"
                          )}
                        >
                          <BsShieldFill
                            className={cn("h-5 w-5", isDark ? "text-amber-400" : "text-amber-600")}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3
                              className={cn(
                                "text-sm font-medium tracking-wider uppercase",
                                isDark ? "text-zinc-100" : "text-zinc-800"
                              )}
                            >
                              {server.owner.name}
                            </h3>
                            <span
                              className={cn(
                                "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                                isDark
                                  ? "border-amber-500/50 text-amber-400"
                                  : "border-amber-400 text-amber-600"
                              )}
                            >
                              Owner
                            </span>
                            {server.owner.id === currentUser?.id && (
                              <span
                                className={cn(
                                  "text-[10px] tracking-wider",
                                  isDark ? "text-zinc-500" : "text-zinc-400"
                                )}
                              >
                                (You)
                              </span>
                            )}
                          </div>
                          <div
                            className={cn(
                              "mt-1 text-xs",
                              isDark ? "text-zinc-500" : "text-zinc-500"
                            )}
                          >
                            {server.owner.email}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Server Members */}
                {members.map((member) => (
                  <div
                    key={member.id}
                    className={cn(
                      "relative border p-6 transition-all",
                      isDark
                        ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                        : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
                    )}
                  >
                    {/* Corner decorations */}
                    <div
                      className={cn(
                        "absolute top-0 left-0 h-2 w-2 border-t border-l",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute top-0 right-0 h-2 w-2 border-t border-r",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center border",
                            isDark
                              ? "border-zinc-700 bg-zinc-800/50"
                              : "border-zinc-300 bg-zinc-100"
                          )}
                        >
                          <BsPersonFill
                            className={cn("h-5 w-5", isDark ? "text-zinc-400" : "text-zinc-500")}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3
                              className={cn(
                                "text-sm font-medium tracking-wider uppercase",
                                isDark ? "text-zinc-100" : "text-zinc-800"
                              )}
                            >
                              {member.user.name}
                            </h3>
                            <span
                              className={cn(
                                "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                                isDark
                                  ? "border-zinc-600 text-zinc-400"
                                  : "border-zinc-400 text-zinc-600"
                              )}
                            >
                              {getPermissionCount(member.permissions)}
                            </span>
                            {member.user.id === currentUser?.id && (
                              <span
                                className={cn(
                                  "text-[10px] tracking-wider",
                                  isDark ? "text-zinc-500" : "text-zinc-400"
                                )}
                              >
                                (You)
                              </span>
                            )}
                          </div>
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-4 text-xs",
                              isDark ? "text-zinc-500" : "text-zinc-500"
                            )}
                          >
                            <span>{member.user.email}</span>
                            <span>•</span>
                            <span>Added: {new Date(member.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      {isOwner && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(member)}
                            className={cn(
                              "p-2 transition-all",
                              isDark
                                ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                                : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                            )}
                          >
                            <BsPencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDeleteModal(member)}
                            className={cn(
                              "p-2 transition-all",
                              isDark
                                ? "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
                                : "border-red-300 text-red-600 hover:border-red-400 hover:text-red-700"
                            )}
                          >
                            <BsTrash className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {members.length === 0 && (
                  <div
                    className={cn(
                      "py-12 text-center text-sm",
                      isDark ? "text-zinc-500" : "text-zinc-400"
                    )}
                  >
                    No members yet. Invite users to collaborate on this server.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Invite User Modal */}
      <FormModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        title="Invite User"
        description="Send an invitation to collaborate on this server."
        onSubmit={handleInvite}
        submitLabel="Send Invitation"
        isDark={isDark}
        isValid={isEmailValid && selectedPermissions.length > 0}
        isLoading={createInvitation.isPending}
      >
        <div className="space-y-4">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Email Address
            </label>
            <Input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="user@example.com"
              className={cn(
                "transition-all",
                isDark
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
                  : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
              )}
            />
          </div>
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Permissions
            </label>
            {permissionDefs?.categories ? (
              <PermissionSelector categories={permissionDefs.categories} />
            ) : (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            )}
          </div>
        </div>
      </FormModal>

      {/* Edit Permissions Modal */}
      <FormModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        title="Edit Permissions"
        description={`Update permissions for ${selectedMember?.user.name}.`}
        onSubmit={handleEditPermissions}
        submitLabel="Save Changes"
        isDark={isDark}
        isValid={selectedPermissions.length > 0}
        isLoading={updateMember.isPending}
      >
        <div className="space-y-4">
          {permissionDefs?.categories ? (
            <PermissionSelector categories={permissionDefs.categories} />
          ) : (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          )}
        </div>
      </FormModal>

      {/* Remove Member Modal */}
      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Remove Member"
        description={`Are you sure you want to remove ${selectedMember?.user.name} from this server? They will lose all access.`}
        onConfirm={handleRemoveMember}
        confirmLabel="Remove"
        variant="danger"
        isDark={isDark}
        isLoading={removeMember.isPending}
      />

      {/* Cancel Invitation Modal */}
      <ConfirmationModal
        open={cancelInviteModalOpen}
        onOpenChange={setCancelInviteModalOpen}
        title="Cancel Invitation"
        description={`Are you sure you want to cancel the invitation for ${selectedInvitation?.email}?`}
        onConfirm={handleCancelInvitation}
        confirmLabel="Cancel Invitation"
        variant="danger"
        isDark={isDark}
        isLoading={cancelInvitation.isPending}
      />
    </div>
  );
};

export default UsersPage;
