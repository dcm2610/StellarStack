"use client";

import { useState, useEffect, useCallback, useMemo, type JSX } from "react";
import { useParams } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { Switch } from "@workspace/ui/components/switch";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import { Spinner } from "@workspace/ui/components/spinner";
import {
  BsPlus,
  BsTrash,
  BsPencil,
  BsPlayFill,
  BsStopFill,
  BsArrowRepeat,
  BsTerminal,
  BsCloudUpload,
  BsChatDots,
  BsX,
  BsClock,
} from "react-icons/bs";
import { servers } from "@/lib/api";
import type { Schedule, ScheduleTask, CreateScheduleData } from "@/lib/api";
import { useServer } from "@/components/server-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { ServerSuspendedPlaceholder } from "@/components/server-suspended-placeholder";
import { toast } from "sonner";

type ActionType = "power_start" | "power_stop" | "power_restart" | "backup" | "command";

interface LocalTask {
  id: string;
  action: ActionType;
  payload?: string;
  sequence: number;
  timeOffset: number;
}

const actionOptions: { value: ActionType; label: string; icon: JSX.Element }[] = [
  {
    value: "power_start",
    label: "Start Server",
    icon: <BsPlayFill className="h-4 w-4 text-green-500" />,
  },
  {
    value: "power_stop",
    label: "Stop Server",
    icon: <BsStopFill className="h-4 w-4 text-red-500" />,
  },
  {
    value: "power_restart",
    label: "Restart Server",
    icon: <BsArrowRepeat className="h-4 w-4 text-amber-500" />,
  },
  {
    value: "backup",
    label: "Create Backup",
    icon: <BsCloudUpload className="h-4 w-4 text-blue-500" />,
  },
  {
    value: "command",
    label: "Run Command",
    icon: <BsTerminal className="h-4 w-4 text-purple-500" />,
  },
];

const SchedulesPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server, isInstalling } = useServer();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [formName, setFormName] = useState("");
  const [formTasks, setFormTasks] = useState<LocalTask[]>([]);
  const [formCron, setFormCron] = useState("0 4 * * *");
  const [formEnabled, setFormEnabled] = useState(true);

  const fetchSchedules = useCallback(async () => {
    try {
      const data = await servers.schedules.list(serverId);
      setSchedules(data);
    } catch (error) {
      toast.error("Failed to fetch schedules");
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

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
    setFormName("");
    setFormTasks([]);
    setFormCron("0 4 * * *");
    setFormEnabled(true);
  };

  const openCreateModal = () => {
    resetForm();
    setCreateModalOpen(true);
  };

  const openEditModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setFormName(schedule.name);
    setFormTasks(
      schedule.tasks.map((t, i) => ({
        id: t.id || `task-${i}-${Date.now()}`,
        action: t.action as ActionType,
        payload: t.payload,
        sequence: t.sequence,
        timeOffset: t.timeOffset,
      }))
    );
    setFormCron(schedule.cronExpression);
    setFormEnabled(schedule.isActive);
    setEditModalOpen(true);
  };

  const openDeleteModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setDeleteModalOpen(true);
  };

  const MAX_TASKS = 12;

  const addTask = useCallback((action: ActionType) => {
    setFormTasks((prev) => {
      if (prev.length >= MAX_TASKS) return prev;
      const newTask: LocalTask = {
        id: `task-${Date.now()}`,
        action,
        payload: action === "command" ? "" : undefined,
        sequence: prev.length,
        timeOffset: 0,
      };
      return [...prev, newTask];
    });
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setFormTasks((prev) =>
      prev.filter((t) => t.id !== taskId).map((t, i) => ({ ...t, sequence: i }))
    );
  }, []);

  const updateTaskPayload = useCallback((taskId: string, payload: string) => {
    setFormTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, payload } : t)));
  }, []);

  const updateTaskOffset = useCallback((taskId: string, offset: number) => {
    setFormTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, timeOffset: offset } : t)));
  }, []);

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      const data: CreateScheduleData = {
        name: formName,
        cronExpression: formCron,
        isActive: formEnabled,
        tasks: formTasks.map((t, i) => ({
          action: t.action,
          payload: t.payload,
          sequence: i,
          timeOffset: t.timeOffset,
        })),
      };
      await servers.schedules.create(serverId, data);
      toast.success("Schedule created");
      setCreateModalOpen(false);
      resetForm();
      fetchSchedules();
    } catch (error) {
      toast.error("Failed to create schedule");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedSchedule) return;
    setIsSaving(true);
    try {
      const data: CreateScheduleData = {
        name: formName,
        cronExpression: formCron,
        isActive: formEnabled,
        tasks: formTasks.map((t, i) => ({
          action: t.action,
          payload: t.payload,
          sequence: i,
          timeOffset: t.timeOffset,
        })),
      };
      await servers.schedules.update(serverId, selectedSchedule.id, data);
      toast.success("Schedule updated");
      setEditModalOpen(false);
      setSelectedSchedule(null);
      fetchSchedules();
    } catch (error) {
      toast.error("Failed to update schedule");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSchedule) return;
    try {
      await servers.schedules.delete(serverId, selectedSchedule.id);
      toast.success("Schedule deleted");
      setDeleteModalOpen(false);
      setSelectedSchedule(null);
      fetchSchedules();
    } catch (error) {
      toast.error("Failed to delete schedule");
    }
  };

  const toggleSchedule = async (schedule: Schedule) => {
    try {
      await servers.schedules.update(serverId, schedule.id, {
        name: schedule.name,
        cronExpression: schedule.cronExpression,
        isActive: !schedule.isActive,
        tasks: schedule.tasks.map((t) => ({
          action: t.action,
          payload: t.payload,
          sequence: t.sequence,
          timeOffset: t.timeOffset,
        })),
      });
      fetchSchedules();
    } catch (error) {
      toast.error("Failed to update schedule");
    }
  };

  const getActionIcon = useCallback((action: string) => {
    const option = actionOptions.find((o) => o.value === action);
    return option?.icon || null;
  }, []);

  const getActionLabel = useCallback((action: string) => {
    const option = actionOptions.find((o) => o.value === action);
    return option?.label || action;
  }, []);

  const formatNextRun = (schedule: Schedule): string => {
    if (schedule.nextRunAt) {
      return new Date(schedule.nextRunAt).toLocaleString();
    }
    return "Not scheduled";
  };

  const formatLastRun = (schedule: Schedule): string => {
    if (schedule.lastRunAt) {
      return new Date(schedule.lastRunAt).toLocaleString();
    }
    return "Never";
  };

  const isFormValid =
    formName.trim() !== "" &&
    formCron.trim() !== "" &&
    formTasks.length > 0 &&
    formTasks.every((t) => {
      if (t.action === "command") {
        return t.payload && t.payload.trim() !== "";
      }
      return true;
    });

  const ScheduleForm = useMemo(
    () => (
      <div className="space-y-4">
        <div>
          <label
            className={cn(
              "mb-2 block text-xs tracking-wider uppercase",
              "text-zinc-400"
            )}
          >
            Schedule Name
          </label>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g., Daily Maintenance"
            disabled={isSaving}
            autoFocus
            className={cn(
              "transition-all",
              "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
            )}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              className={cn(
                "text-xs tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Tasks ({formTasks.length}/{MAX_TASKS})
            </label>
            {formTasks.length >= MAX_TASKS && (
              <span className={cn("text-xs", "text-amber-400")}>
                Maximum reached
              </span>
            )}
          </div>

          {/* Task list */}
          {formTasks.length > 0 && (
            <div
              className={cn(
                "mb-3 max-h-64 divide-y overflow-y-auto border",
                "divide-zinc-700 border-zinc-700"
              )}
            >
              {formTasks.map((task, index) => (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-center gap-3 p-3",
                    "bg-zinc-800/50"
                  )}
                >
                  <span
                    className={cn(
                      "w-5 shrink-0 font-mono text-xs",
                      "text-zinc-500"
                    )}
                  >
                    {index + 1}.
                  </span>
                  <div className="shrink-0">{getActionIcon(task.action)}</div>
                  <div className="min-w-0 flex-1">
                    <span className={cn("text-sm", "text-zinc-200")}>
                      {getActionLabel(task.action)}
                    </span>
                    {task.action === "command" && (
                      <Input
                        value={task.payload || ""}
                        onChange={(e) => updateTaskPayload(task.id, e.target.value)}
                        placeholder="Enter command..."
                        disabled={isSaving}
                        className={cn(
                          "mt-2 text-sm",
                          "border-zinc-600 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
                        )}
                      />
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <BsClock
                        className={cn("h-3 w-3", "text-zinc-500")}
                      />
                      <Input
                        type="number"
                        value={task.timeOffset}
                        onChange={(e) => updateTaskOffset(task.id, parseInt(e.target.value) || 0)}
                        min={0}
                        disabled={isSaving}
                        className={cn(
                          "w-20 text-sm",
                          "border-zinc-600 bg-zinc-900 text-zinc-100"
                        )}
                      />
                      <span className={cn("text-xs", "text-zinc-500")}>
                        seconds delay
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTask(task.id)}
                    disabled={isSaving}
                    className={cn(
                      "shrink-0 p-1.5 transition-colors disabled:opacity-50",
                      "text-zinc-500 hover:text-red-400"
                    )}
                  >
                    <BsX className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add task buttons */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {actionOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => addTask(opt.value)}
                disabled={formTasks.length >= MAX_TASKS || isSaving}
                className={cn(
                  "flex items-center gap-2 border p-2 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-40",
                  "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                )}
              >
                {opt.icon}
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            className={cn(
              "mb-2 block text-xs tracking-wider uppercase",
              "text-zinc-400"
            )}
          >
            Cron Expression
          </label>
          <Input
            value={formCron}
            onChange={(e) => setFormCron(e.target.value)}
            placeholder="0 4 * * *"
            disabled={isSaving}
            className={cn(
              "font-mono transition-all",
              "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
            )}
          />
          <p className={cn("mt-1 text-xs", "text-zinc-500")}>
            Format: minute hour day month weekday
          </p>
        </div>

        <div className="flex items-center justify-between">
          <label
            className={cn(
              "text-xs tracking-wider uppercase",
              "text-zinc-400"
            )}
          >
            Enabled
          </label>
          <Switch
            checked={formEnabled}
            onCheckedChange={setFormEnabled}
            disabled={isSaving}
          />
        </div>
      </div>
    ),
    [
      formName,
      formTasks,
      formCron,
      formEnabled,
      isSaving,
      updateTaskPayload,
      updateTaskOffset,
      removeTask,
      addTask,
      getActionIcon,
      getActionLabel,
    ]
  );

  return (
    <div className="relative min-h-full transition-colors">
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
                  SCHEDULES
                </h1>
                <p className={cn("mt-1 text-sm", "text-zinc-500")}>
                  {server?.name || `Server ${serverId}`} -{" "}
                  {/*{schedules.filter((s) => s.enabled).length} active*/}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openCreateModal}
                className={cn(
                  "gap-2 transition-all",
                  "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                )}
              >
                <BsPlus className="h-4 w-4" />
                <span className="text-xs tracking-wider uppercase">New Schedule</span>
              </Button>
            </div>
          </div>

          {/* Schedule List */}
          <div className="space-y-4">
            {isLoading ? (
              <div
                className={cn(
                  "flex items-center justify-center gap-2 py-12 text-center text-sm",
                  "text-zinc-500"
                )}
              >
                <Spinner className="h-4 w-4" />
                Loading schedules...
              </div>
            ) : schedules.length === 0 ? (
              <div
                className={cn(
                  "border py-12 text-center",
                  "border-zinc-800 text-zinc-500"
                )}
              >
                No schedules found. Create your first schedule.
              </div>
            ) : (
              schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className={cn(
                    "relative border p-6 transition-all",
                    "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]",
                    !schedule.isActive && "opacity-50"
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
                    <div className="flex-1">
                      <div className="mb-3 flex items-center gap-3">
                        <h3
                          className={cn(
                            "text-sm font-medium tracking-wider uppercase",
                            "text-zinc-100"
                          )}
                        >
                          {schedule.name}
                        </h3>
                        <span
                          className={cn(
                            "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                            "border-zinc-600 text-zinc-400"
                          )}
                        >
                          {schedule.tasks.length} task{schedule.tasks.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Task list preview */}
                      <div className="mb-3 flex flex-wrap gap-2">
                        {schedule.tasks.map((task, index) => (
                          <div
                            key={task.id}
                            className={cn(
                              "flex items-center gap-1.5 border px-2 py-1 text-xs",
                              "border-zinc-700 bg-zinc-800/50"
                            )}
                          >
                            <span
                              className={cn(
                                "text-[10px]",
                              "text-zinc-500"
                              )}
                            >
                              {index + 1}.
                            </span>
                            {getActionIcon(task.action)}
                            <span className={cn("text-zinc-300")}>
                              {getActionLabel(task.action)}
                            </span>
                            {task.timeOffset > 0 && (
                              <span
                                className={cn(
                                  "text-[10px]",
                                  "text-zinc-500"
                                )}
                              >
                                +{task.timeOffset}s
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div
                        className={cn(
                          "flex items-center gap-4 text-xs",
                          "text-zinc-500"
                        )}
                      >
                        <span className="font-mono">{schedule.cronExpression}</span>
                        <span>-</span>
                        <span>Next: {formatNextRun(schedule)}</span>
                        <span>-</span>
                        <span>Last: {formatLastRun(schedule)}</span>
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      <Switch
                        checked={schedule.isActive}
                        onCheckedChange={() => toggleSchedule(schedule)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(schedule)}
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
                        onClick={() => openDeleteModal(schedule)}
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
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create Schedule Modal */}
      <FormModal
        open={createModalOpen}
        onOpenChange={(open) => !isSaving && setCreateModalOpen(open)}
        title="Create Schedule"
        description="Set up a new scheduled task sequence for your server."
        onSubmit={handleCreate}
        submitLabel={isSaving ? "Creating..." : "Create"}
        isValid={isFormValid && !isSaving}
        size="lg"
      >
        {ScheduleForm}
      </FormModal>

      {/* Edit Schedule Modal */}
      <FormModal
        open={editModalOpen}
        onOpenChange={(open) => !isSaving && setEditModalOpen(open)}
        title="Edit Schedule"
        description={`Modify "${selectedSchedule?.name}" schedule.`}
        onSubmit={handleEdit}
        submitLabel={isSaving ? "Saving..." : "Save Changes"}
        isValid={isFormValid && !isSaving}
        size="lg"
      >
        {ScheduleForm}
      </FormModal>

      {/* Delete Schedule Modal */}
      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Schedule"
        description={`Are you sure you want to delete "${selectedSchedule?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
};

export default SchedulesPage;
