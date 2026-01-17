"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import {
  BsPlus,
  BsTrash,
  BsPencil,
  BsGlobe,
  BsCheck2,
  BsX,
  BsArrowRepeat,
} from "react-icons/bs";
import { TbWand } from "react-icons/tb";
import { useServer } from "@/components/server-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { ServerSuspendedPlaceholder } from "@/components/server-suspended-placeholder";
import { webhooks, type Webhook, type WebhookEvent } from "@/lib/api";
import { toast } from "sonner";

const webhookEvents: { value: WebhookEvent; label: string; description: string }[] = [
  { value: "server.started", label: "Server Started", description: "When the server starts" },
  { value: "server.stopped", label: "Server Stopped", description: "When the server stops" },
  { value: "backup.created", label: "Backup Created", description: "When a backup is created" },
  { value: "backup.restored", label: "Backup Restored", description: "When a backup is restored" },
  { value: "backup.deleted", label: "Backup Deleted", description: "When a backup is deleted" },
];

const WebhooksPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server, isInstalling } = useServer();
  const [webhookList, setWebhookList] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);

  // Form states
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEvent[]>([]);
  const [formEnabled, setFormEnabled] = useState(true);

  useEffect(() => {
    if (serverId) {
      fetchWebhooks();
    }
  }, [serverId]);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const data = await webhooks.list();
      // Filter to show only webhooks for this server
      setWebhookList(data.filter((w) => w.serverId === serverId));
    } catch (error) {
      console.error("Failed to fetch webhooks:", error);
      toast.error("Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  };

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        {/* Background is now rendered in the layout for persistence */}
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
    setFormUrl("");
    setFormEvents([]);
    setFormEnabled(true);
  };

  const openAddModal = () => {
    resetForm();
    setAddModalOpen(true);
  };

  const openEditModal = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setFormUrl(webhook.url);
    setFormEvents(webhook.events as WebhookEvent[]);
    setFormEnabled(webhook.enabled);
    setEditModalOpen(true);
  };

  const openDeleteModal = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setDeleteModalOpen(true);
  };

  const handleAdd = async () => {
    if (formEvents.length === 0) return;
    try {
      const newWebhook = await webhooks.create({
        serverId,
        url: formUrl,
        events: formEvents,
      });
      setWebhookList((prev) => [...prev, newWebhook]);
      setAddModalOpen(false);
      resetForm();
      toast.success("Webhook created");
      
      try {
        await webhooks.test(newWebhook.id);
        toast.success("Test message sent to webhook");
      } catch (error) {
        toast.info("Webhook created, but test message failed to send");
      }
    } catch (error) {
      toast.error("Failed to create webhook");
    }
  };

  const handleEdit = async () => {
    if (!selectedWebhook || formEvents.length === 0) return;
    try {
      const updated = await webhooks.update(selectedWebhook.id, {
        url: formUrl,
        events: formEvents,
        enabled: formEnabled,
      });
      setWebhookList((prev) => prev.map((w) => (w.id === selectedWebhook.id ? updated : w)));
      setEditModalOpen(false);
      setSelectedWebhook(null);
      toast.success("Webhook updated");
    } catch (error) {
      toast.error("Failed to update webhook");
    }
  };

  const handleDelete = async () => {
    if (!selectedWebhook) return;
    try {
      await webhooks.delete(selectedWebhook.id);
      setWebhookList((prev) => prev.filter((w) => w.id !== selectedWebhook.id));
      setDeleteModalOpen(false);
      setSelectedWebhook(null);
      toast.success("Webhook deleted");
    } catch (error) {
      toast.error("Failed to delete webhook");
    }
  };

  const handleTestWebhook = async (webhook: Webhook) => {
    try {
      await webhooks.test(webhook.id);
      toast.success("Test message sent successfully");
    } catch (error) {
      toast.error("Failed to send test message");
    }
  };

  const handleRegenerateSecret = async (webhook: Webhook) => {
    try {
      await webhooks.delete(webhook.id);
      setWebhookList((prev) => prev.filter((w) => w.id !== webhook.id));
      toast.success("Webhook deleted");
    } catch (error) {
      toast.error("Failed to delete webhook");
    }
  };

  const toggleEvent = (event: WebhookEvent) => {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const isFormValid = formUrl.startsWith("http") && formEvents.length > 0;

  return (
    <div className="relative min-h-svh transition-colors">
      {/* Background is now rendered in the layout for persistence */}

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
                  WEBHOOKS
                </h1>
                <p className={cn("mt-1 text-sm", "text-zinc-500")}>
                  Server {serverId} • {webhookList.length} webhooks
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openAddModal}
                className={cn(
                  "gap-2 transition-all",
                  "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                )}
              >
                <BsPlus className="h-4 w-4" />
                <span className="text-xs tracking-wider uppercase">Add Webhook</span>
              </Button>
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

          {/* Loading State */}
          {loading ? (
            <div className={cn("py-12 text-center", "text-zinc-500")}>
              Loading webhooks...
            </div>
          ) : webhookList.length === 0 ? (
            <div
              className={cn(
                "relative border p-8 text-center",
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

              <BsGlobe
                className={cn("mx-auto mb-4 h-12 w-12", "text-zinc-600")}
              />
              <h3
                className={cn(
                  "mb-2 text-lg font-medium",
                  "text-zinc-300"
                )}
              >
                No Webhooks
              </h3>
              <p className={cn("mb-4 text-sm", "text-zinc-500")}>
                Add a webhook to receive notifications about server events.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={openAddModal}
                className={cn(
                  "gap-2",
                  "border-zinc-700 text-zinc-400 hover:text-zinc-100"
                )}
              >
                <BsPlus className="h-4 w-4" />
                Add Webhook
              </Button>
            </div>
          ) : (
            /* Webhooks List */
            <div className="space-y-4">
              {webhookList.map((webhook) => (
                <div
                  key={webhook.id}
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

                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center border",
                            "border-zinc-700 bg-zinc-800/50"
                          )}
                        >
                          <BsGlobe
                            className={cn("h-4 w-4", "text-zinc-400")}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "max-w-[400px] truncate font-mono text-xs",
                              "text-zinc-400"
                            )}
                          >
                            {webhook.url}
                          </span>
                          <span
                            className={cn(
                              "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                              webhook.enabled
                                ? "border-green-700/50 text-green-400"
                                : "border-zinc-700 text-zinc-500"
                            )}
                          >
                            {webhook.enabled ? "Active" : "Disabled"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {webhook.events.map((event) => (
                          <span
                            key={event}
                            className={cn(
                              "border px-2 py-0.5 text-[10px] tracking-wider uppercase",
                              "border-zinc-700 text-zinc-400"
                            )}
                          >
                            {event.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(webhook)}
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
                        onClick={() => handleTestWebhook(webhook)}
                        className={cn(
                          "p-2 transition-all",
                          "border-blue-900/60 text-blue-400/80 hover:border-blue-700 hover:text-blue-300"
                        )}
                        title="Send test message to webhook"
                      >
                        <TbWand className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDeleteModal(webhook)}
                        className={cn(
                          "p-2 transition-all",
                          "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
                        )}
                      >
                        <BsTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Webhook Modal */}
      <FormModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        title="Add Webhook"
        description="Create a new webhook to receive server event notifications."
        onSubmit={handleAdd}
        submitLabel="Create Webhook"
        isValid={isFormValid}
      >
        <div className="space-y-4">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Discord Webhook URL
            </label>
            <Input
              type="url"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://discordapp.com/api/webhooks/..."
              className={cn(
                "font-mono text-sm transition-all",
                "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
              )}
            />
            <p className={cn("mt-1 text-xs", "text-zinc-500")}>
              Get this from your Discord server's webhook settings
            </p>
          </div>
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Events
            </label>
            <div className="space-y-2">
              {webhookEvents.map((event) => (
                <button
                  key={event.value}
                  type="button"
                  onClick={() => toggleEvent(event.value)}
                  className={cn(
                    "flex w-full items-center gap-3 border p-3 text-left transition-all",
                    formEvents.includes(event.value)
                      ? "border-zinc-500 bg-zinc-800"
                      : "border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border",
                      formEvents.includes(event.value)
                        ? "border-green-500 bg-green-500/20"
                        : "border-zinc-600"
                    )}
                  >
                    {formEvents.includes(event.value) && (
                      <BsCheck2
                        className={cn(
                          "h-3 w-3",
                          "text-green-400"
                        )}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <div
                      className={cn(
                        "text-sm font-medium",
                        "text-zinc-200"
                      )}
                    >
                      {event.label}
                    </div>
                    <div className={cn("text-xs", "text-zinc-500")}>
                      {event.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </FormModal>

      {/* Edit Webhook Modal */}
      <FormModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        title="Edit Webhook"
        description="Update webhook settings."
        onSubmit={handleEdit}
        submitLabel="Save Changes"
        isValid={isFormValid}
      >
        <div className="space-y-4">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Discord Webhook URL
            </label>
            <Input
              type="url"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://discordapp.com/api/webhooks/..."
              className={cn(
                "font-mono text-sm transition-all",
                "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
              )}
            />
            <p className={cn("mt-1 text-xs", "text-zinc-500")}>
              Get this from your Discord server's webhook settings
            </p>
          </div>
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Status
            </label>
            <button
              type="button"
              onClick={() => setFormEnabled(!formEnabled)}
              className={cn(
                "flex w-full items-center gap-3 border p-3 transition-all",
                formEnabled
                  ? "border-green-700/50 bg-green-900/20"
                  : "border-zinc-700"
              )}
            >
              <div
                className={cn(
                  "relative h-5 w-10 rounded-full transition-colors",
                  formEnabled
                    ? "bg-green-600"
                    : "bg-zinc-700"
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    formEnabled ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </div>
              <span className={cn("text-sm", "text-zinc-300")}>
                {formEnabled ? "Enabled" : "Disabled"}
              </span>
            </button>
          </div>
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Events
            </label>
            <div className="space-y-2">
              {webhookEvents.map((event) => (
                <button
                  key={event.value}
                  type="button"
                  onClick={() => toggleEvent(event.value)}
                  className={cn(
                    "flex w-full items-center gap-3 border p-3 text-left transition-all",
                    formEvents.includes(event.value)
                      ? "border-zinc-500 bg-zinc-800"
                      : "border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border",
                      formEvents.includes(event.value)
                        ? "border-green-500 bg-green-500/20"
                        : "border-zinc-600"
                    )}
                  >
                    {formEvents.includes(event.value) && (
                      <BsCheck2
                        className={cn(
                          "h-3 w-3",
                          "text-green-400"
                        )}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <div
                      className={cn(
                        "text-sm font-medium",
                        "text-zinc-200"
                      )}
                    >
                      {event.label}
                    </div>
                    <div className={cn("text-xs", "text-zinc-500")}>
                      {event.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </FormModal>

      {/* Delete Webhook Modal */}
      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Webhook"
        description="Are you sure you want to delete this webhook? This action cannot be undone."
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
};

export default WebhooksPage;
