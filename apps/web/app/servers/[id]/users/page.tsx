"use client";

import { useState, useMemo, useCallback, useEffect, useRef, type JSX } from "react";
import { useParams } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import {
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

  // Data fetching
  const isOwner = server?.ownerId === currentUser?.id;
  const isLoading = membersLoading || invitationsLoading;

  // Get all available permissions from definitions - use ref to stabilize after first load
  const permissionDefsRef = useRef(permissionDefs);
  if (permissionDefs && !permissionDefsRef.current) {
    permissionDefsRef.current = permissionDefs;
  }
  const stablePermissionDefs = permissionDefsRef.current || permissionDefs;

  const allPermissions = useMemo(() => {
    if (!stablePermissionDefs?.categories) return [];
    return stablePermissionDefs.categories.flatMap((cat) => cat.permissions);
  }, [stablePermissionDefs]);

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        <ServerInstallingPlaceholder serverName={server?.name} />
      </div>
    );
  }

  if (server?.status === "SUSPENDED") {
    return (
      <div className="min-h-svh">
        <ServerSuspendedPlaceholder serverName={server?.name} />
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

  // Helper to check if all permissions in a category are selected
  const isCategoryFullySelected = (category: PermissionCategory) =>
    category.permissions.every((p) => selectedPermissions.includes(p.key));

  // Helper to check if some permissions in a category are selected
  const isCategoryPartiallySelected = (category: PermissionCategory) =>
    category.permissions.some((p) => selectedPermissions.includes(p.key)) &&
    !isCategoryFullySelected(category);

  // Toggle all permissions in a category
  const toggleCategory = (category: PermissionCategory) => {
    const categoryKeys = category.permissions.map((p) => p.key);
    if (isCategoryFullySelected(category)) {
      // Deselect all in category
      setSelectedPermissions((prev) => prev.filter((p) => !categoryKeys.includes(p)));
    } else {
      // Select all in category
      setSelectedPermissions((prev) => [...new Set([...prev, ...categoryKeys])]);
    }
  };

  // Toggle all permissions
  const toggleAllPermissions = () => {
    if (selectedPermissions.length === allPermissions.length) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions(allPermissions.map((p) => p.key));
    }
  };

  const PermissionSelector = ({ categories }: { categories: PermissionCategory[] }) => (
    <div className="space-y-4">
      {/* Global Select All */}
      <div className="flex items-center justify-between border-b pb-3">
        <span
          className={cn(
            "text-xs font-medium tracking-wider uppercase",
            "text-zinc-400"
          )}
        >
          {selectedPermissions.length} of {allPermissions.length} selected
        </span>
        <button
          type="button"
          onClick={toggleAllPermissions}
          className={cn(
            "text-xs tracking-wider uppercase transition-colors",
            "text-zinc-400 hover:text-zinc-100"
          )}
        >
          {selectedPermissions.length === allPermissions.length ? "Deselect All" : "Select All"}
        </button>
      </div>

      {/* Scrollable categories */}
      <div className="max-h-80 space-y-4 overflow-y-auto pr-2">
        {categories.map((category) => (
          <div
            key={category.id}
            className={cn(
              "border p-3",
              "border-zinc-800 bg-zinc-900/30"
            )}
          >
            {/* Category header with select all */}
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex items-center gap-2"
              >
                <div
                  className={cn(
                    "flex h-4 w-4 items-center justify-center border",
                    isCategoryFullySelected(category)
                      ? "border-zinc-400 bg-zinc-600"
                      : isCategoryPartiallySelected(category)
                        ? "border-zinc-500 bg-zinc-700"
                        : "border-zinc-600"
                  )}
                >
                  {isCategoryFullySelected(category) && (
                    <div className={cn("h-2 w-2", "bg-zinc-100")} />
                  )}
                  {isCategoryPartiallySelected(category) && (
                    <div className={cn("h-0.5 w-2", "bg-zinc-400")} />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium tracking-wider uppercase",
                    "text-zinc-300"
                  )}
                >
                  {category.name}
                </span>
              </button>
              <span
                className={cn(
                  "text-[10px] tracking-wider",
                  "text-zinc-600"
                )}
              >
                {category.permissions.filter((p) => selectedPermissions.includes(p.key)).length}/
                {category.permissions.length}
              </span>
            </div>

            {/* Category permissions - 2 column grid */}
            <div className="grid grid-cols-2 gap-2">
              {category.permissions.map((perm) => (
                <button
                  key={perm.key}
                  type="button"
                  onClick={() => togglePermission(perm.key)}
                  className={cn(
                    "flex items-center gap-2 border p-2 text-left transition-all",
                    selectedPermissions.includes(perm.key)
                      ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-3 w-3 shrink-0 items-center justify-center border",
                      selectedPermissions.includes(perm.key)
                        ? "border-zinc-400 bg-zinc-600"
                        : "border-zinc-600"
                    )}
                  >
                    {selectedPermissions.includes(perm.key) && (
                      <div className={cn("h-1.5 w-1.5", "bg-zinc-100")} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{perm.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
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
                  "text-zinc-400 hover:text-zinc-100"
                )}
              />
              <div>
                <h1
                  className={cn(
                    "text-2xl font-light tracking-wider",
                    "text-zinc-100"
                  )}
                >
                  USERS
                </h1>
                <p className={cn("mt-1 text-sm", "text-zinc-500")}>
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
                    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  )}
                >
                  <BsPlus className="h-4 w-4" />
                  <span className="text-xs tracking-wider uppercase">Invite User</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "p-2 transition-all hover:scale-110 active:scale-95",
                  "hidden"
                )}
              >
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
                      "text-zinc-400"
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
                          "border-amber-700/30 bg-amber-950/10"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center border",
                              "border-amber-700/50 bg-amber-900/30"
                            )}
                          >
                            <BsEnvelope
                              className={cn(
                                "h-5 w-5",
                                "text-amber-400"
                              )}
                            />
                          </div>
                          <div>
                            <div
                              className={cn(
                                "text-sm font-medium",
                                "text-amber-200"
                              )}
                            >
                              {invitation.email}
                            </div>
                            <div
                              className={cn(
                                "flex items-center gap-3 text-xs",
                                "text-amber-200/60"
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
                              "border-amber-700/50 text-amber-400/80 hover:border-amber-600 hover:text-amber-300"
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
                      "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                    )}
                  >
                    {/* Corner decorations */}
                    <div
                      className={cn(
                        "absolute top-0 left-0 h-2 w-2 border-t border-l",
                        "border-zinc-500"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute top-0 right-0 h-2 w-2 border-t border-r",
                        "border-zinc-500"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                        "border-zinc-500"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                        "border-zinc-500"
                      )}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center border",
                            "border-amber-700/50 bg-amber-900/30"
                          )}
                        >
                          <BsShieldFill
                            className={cn("h-5 w-5", "text-amber-400")}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3
                              className={cn(
                                "text-sm font-medium tracking-wider uppercase",
                                "text-zinc-100"
                              )}
                            >
                              {server.owner.name}
                            </h3>
                            <span
                              className={cn(
                                "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                                "border-amber-500/50 text-amber-400"
                              )}
                            >
                              Owner
                            </span>
                            {server.owner.id === currentUser?.id && (
                              <span
                                className={cn(
                                  "text-[10px] tracking-wider",
                                  "text-zinc-500"
                                )}
                              >
                                (You)
                              </span>
                            )}
                          </div>
                          <div
                            className={cn(
                              "mt-1 text-xs",
                              "text-zinc-500"
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
                      "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                    )}
                  >
                    {/* Corner decorations */}
                    <div
                      className={cn(
                        "absolute top-0 left-0 h-2 w-2 border-t border-l",
                        "border-zinc-500"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute top-0 right-0 h-2 w-2 border-t border-r",
                        "border-zinc-500"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                        "border-zinc-500"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                        "border-zinc-500"
                      )}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center border",
                            "border-zinc-700 bg-zinc-800/50"
                          )}
                        >
                          <BsPersonFill
                            className={cn("h-5 w-5", "text-zinc-400")}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3
                              className={cn(
                                "text-sm font-medium tracking-wider uppercase",
                                "text-zinc-100"
                              )}
                            >
                              {member.user.name}
                            </h3>
                            <span
                              className={cn(
                                "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                                "border-zinc-600 text-zinc-400"
                              )}
                            >
                              {getPermissionCount(member.permissions)}
                            </span>
                            {member.user.id === currentUser?.id && (
                              <span
                                className={cn(
                                  "text-[10px] tracking-wider",
                                  "text-zinc-500"
                                )}
                              >
                                (You)
                              </span>
                            )}
                          </div>
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-4 text-xs",
                              "text-zinc-500"
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
                              "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
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
                              "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
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
                      "text-zinc-500"
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
        isValid={isEmailValid && selectedPermissions.length > 0}
        isLoading={createInvitation.isPending}
        size="2xl"
      >
        <div className="space-y-4">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                "text-zinc-400"
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
                "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
              )}
            />
          </div>
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Permissions
            </label>
            {stablePermissionDefs?.categories ? (
              <PermissionSelector categories={stablePermissionDefs.categories} />
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
        isValid={selectedPermissions.length > 0}
        isLoading={updateMember.isPending}
        size="2xl"
      >
        <div className="space-y-4">
          {stablePermissionDefs?.categories ? (
            <PermissionSelector categories={stablePermissionDefs.categories} />
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
        isLoading={cancelInvitation.isPending}
      />
    </div>
  );
};

export default UsersPage;
