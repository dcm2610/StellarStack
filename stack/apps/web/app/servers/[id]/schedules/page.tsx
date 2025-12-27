"use client";

import { useState, useEffect, useCallback, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { Switch } from "@workspace/ui/components/switch";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import { FormModal } from "@workspace/ui/components/shared/FormModal";
import { Spinner } from "@workspace/ui/components/spinner";
import { BsSun, BsMoon, BsPlus, BsTrash, BsPencil, BsPlayFill, BsStopFill, BsArrowRepeat, BsTerminal, BsCloudUpload, BsChatDots, BsX, BsClock } from "react-icons/bs";
import { servers } from "@/lib/api";
import type { Schedule, ScheduleTask, CreateScheduleData } from "@/lib/api";
import { useServer } from "@/components/server-provider";
import { toast } from "sonner";

type ActionType = "power_start" | "power_stop" | "power_restart" | "backup" | "command";

interface LocalTask {
  id: string;
  action: ActionType;
  payload?: string;
  sequence_id: number;
  time_offset: number;
}

const actionOptions: { value: ActionType; label: string; icon: JSX.Element }[] = [
  { value: "power_start", label: "Start Server", icon: <BsPlayFill className="w-4 h-4 text-green-500" /> },
  { value: "power_stop", label: "Stop Server", icon: <BsStopFill className="w-4 h-4 text-red-500" /> },
  { value: "power_restart", label: "Restart Server", icon: <BsArrowRepeat className="w-4 h-4 text-amber-500" /> },
  { value: "backup", label: "Create Backup", icon: <BsCloudUpload className="w-4 h-4 text-blue-500" /> },
  { value: "command", label: "Run Command", icon: <BsTerminal className="w-4 h-4 text-purple-500" /> },
];

const SchedulesPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server } = useServer();
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

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
    setFormTasks(schedule.tasks.map((t, i) => ({
      id: t.id || `task-${i}-${Date.now()}`,
      action: t.action as ActionType,
      payload: t.payload,
      sequence_id: t.sequence_id,
      time_offset: t.time_offset,
    })));
    setFormCron(schedule.cron);
    setFormEnabled(schedule.enabled);
    setEditModalOpen(true);
  };

  const openDeleteModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setDeleteModalOpen(true);
  };

  const MAX_TASKS = 12;

  const addTask = (action: ActionType) => {
    if (formTasks.length >= MAX_TASKS) return;
    const newTask: LocalTask = {
      id: `task-${Date.now()}`,
      action,
      payload: action === "command" ? "" : undefined,
      sequence_id: formTasks.length,
      time_offset: 0,
    };
    setFormTasks(prev => [...prev, newTask]);
  };

  const removeTask = (taskId: string) => {
    setFormTasks(prev => prev.filter(t => t.id !== taskId).map((t, i) => ({ ...t, sequence_id: i })));
  };

  const updateTaskPayload = (taskId: string, payload: string) => {
    setFormTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, payload } : t
    ));
  };

  const updateTaskOffset = (taskId: string, offset: number) => {
    setFormTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, time_offset: offset } : t
    ));
  };

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      const data: CreateScheduleData = {
        name: formName,
        cron: formCron,
        enabled: formEnabled,
        tasks: formTasks.map((t, i) => ({
          action: t.action,
          payload: t.payload,
          sequence_id: i,
          time_offset: t.time_offset,
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
        cron: formCron,
        enabled: formEnabled,
        tasks: formTasks.map((t, i) => ({
          action: t.action,
          payload: t.payload,
          sequence_id: i,
          time_offset: t.time_offset,
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
        ...schedule,
        enabled: !schedule.enabled,
        tasks: schedule.tasks.map(t => ({
          action: t.action,
          payload: t.payload,
          sequence_id: t.sequence_id,
          time_offset: t.time_offset,
        })),
      });
      fetchSchedules();
    } catch (error) {
      toast.error("Failed to update schedule");
    }
  };

  const getActionIcon = (action: string) => {
    const option = actionOptions.find(o => o.value === action);
    return option?.icon || null;
  };

  const getActionLabel = (action: string) => {
    const option = actionOptions.find(o => o.value === action);
    return option?.label || action;
  };

  const formatNextRun = (schedule: Schedule): string => {
    if (schedule.next_run) {
      return new Date(schedule.next_run).toLocaleString();
    }
    return "Not scheduled";
  };

  const formatLastRun = (schedule: Schedule): string => {
    if (schedule.last_run) {
      return new Date(schedule.last_run).toLocaleString();
    }
    return "Never";
  };

  const isFormValid = formName.trim() !== "" && formCron.trim() !== "" && formTasks.length > 0 &&
    formTasks.every(t => {
      if (t.action === "command") {
        return t.payload && t.payload.trim() !== "";
      }
      return true;
    });

  const ScheduleForm = () => (
    <div className="space-y-4">
      <div>
        <label className={cn(
          "text-xs uppercase tracking-wider mb-2 block",
          isDark ? "text-zinc-400" : "text-zinc-600"
        )}>
          Schedule Name
        </label>
        <Input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g., Daily Maintenance"
          disabled={isSaving}
          className={cn(
            "transition-all",
            isDark
              ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
          )}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={cn(
            "text-xs uppercase tracking-wider",
            isDark ? "text-zinc-400" : "text-zinc-600"
          )}>
            Tasks ({formTasks.length}/{MAX_TASKS})
          </label>
          {formTasks.length >= MAX_TASKS && (
            <span className={cn(
              "text-xs",
              isDark ? "text-amber-400" : "text-amber-600"
            )}>
              Maximum reached
            </span>
          )}
        </div>

        {/* Task list */}
        {formTasks.length > 0 && (
          <div className={cn(
            "mb-3 border divide-y max-h-64 overflow-y-auto",
            isDark ? "border-zinc-700 divide-zinc-700" : "border-zinc-200 divide-zinc-200"
          )}>
            {formTasks.map((task, index) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 p-3",
                  isDark ? "bg-zinc-800/50" : "bg-zinc-50"
                )}
              >
                <span className={cn(
                  "text-xs font-mono w-5 shrink-0",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  {index + 1}.
                </span>
                <div className="shrink-0">
                  {getActionIcon(task.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-sm",
                    isDark ? "text-zinc-200" : "text-zinc-700"
                  )}>
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
                        isDark
                          ? "bg-zinc-900 border-zinc-600 text-zinc-100 placeholder:text-zinc-600"
                          : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
                      )}
                    />
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <BsClock className={cn("w-3 h-3", isDark ? "text-zinc-500" : "text-zinc-400")} />
                    <Input
                      type="number"
                      value={task.time_offset}
                      onChange={(e) => updateTaskOffset(task.id, parseInt(e.target.value) || 0)}
                      min={0}
                      disabled={isSaving}
                      className={cn(
                        "text-sm w-20",
                        isDark
                          ? "bg-zinc-900 border-zinc-600 text-zinc-100"
                          : "bg-white border-zinc-300 text-zinc-900"
                      )}
                    />
                    <span className={cn(
                      "text-xs",
                      isDark ? "text-zinc-500" : "text-zinc-400"
                    )}>
                      seconds delay
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  disabled={isSaving}
                  className={cn(
                    "p-1.5 shrink-0 transition-colors disabled:opacity-50",
                    isDark
                      ? "text-zinc-500 hover:text-red-400"
                      : "text-zinc-400 hover:text-red-500"
                  )}
                >
                  <BsX className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add task buttons */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {actionOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => addTask(opt.value)}
              disabled={formTasks.length >= MAX_TASKS || isSaving}
              className={cn(
                "flex items-center gap-2 p-2 border transition-all text-xs disabled:opacity-40 disabled:cursor-not-allowed",
                isDark
                  ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800"
              )}
            >
              {opt.icon}
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={cn(
          "text-xs uppercase tracking-wider mb-2 block",
          isDark ? "text-zinc-400" : "text-zinc-600"
        )}>
          Cron Expression
        </label>
        <Input
          value={formCron}
          onChange={(e) => setFormCron(e.target.value)}
          placeholder="0 4 * * *"
          disabled={isSaving}
          className={cn(
            "transition-all font-mono",
            isDark
              ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
          )}
        />
        <p className={cn(
          "text-xs mt-1",
          isDark ? "text-zinc-500" : "text-zinc-500"
        )}>
          Format: minute hour day month weekday
        </p>
      </div>

      <div className="flex items-center justify-between">
        <label className={cn(
          "text-xs uppercase tracking-wider",
          isDark ? "text-zinc-400" : "text-zinc-600"
        )}>
          Enabled
        </label>
        <Switch
          checked={formEnabled}
          onCheckedChange={setFormEnabled}
          disabled={isSaving}
          isDark={isDark}
        />
      </div>
    </div>
  );

  return (
    <div className={cn(
      "min-h-full transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <SidebarTrigger className={cn(
                "transition-all hover:scale-110 active:scale-95",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )} />
              <div>
                <h1 className={cn(
                  "text-2xl font-light tracking-wider",
                  isDark ? "text-zinc-100" : "text-zinc-800"
                )}>
                  SCHEDULES
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  {server?.name || `Server ${serverId}`} - {schedules.filter(s => s.enabled).length} active
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openCreateModal}
                className={cn(
                  "transition-all gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                <BsPlus className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">New Schedule</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={cn(
                  "transition-all hover:scale-110 active:scale-95 p-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                {isDark ? <BsSun className="w-4 h-4" /> : <BsMoon className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Schedule List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className={cn(
                "text-center py-12 text-sm flex items-center justify-center gap-2",
                isDark ? "text-zinc-500" : "text-zinc-400"
              )}>
                <Spinner className="w-4 h-4" />
                Loading schedules...
              </div>
            ) : schedules.length === 0 ? (
              <div className={cn(
                "text-center py-12 border",
                isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
              )}>
                No schedules found. Create your first schedule.
              </div>
            ) : (
              schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className={cn(
                    "relative p-6 border transition-all",
                    isDark
                      ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
                      : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300",
                    !schedule.enabled && "opacity-50"
                  )}
                >
                  {/* Corner decorations */}
                  <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                  <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
                  <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                  <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className={cn(
                          "text-sm font-medium uppercase tracking-wider",
                          isDark ? "text-zinc-100" : "text-zinc-800"
                        )}>
                          {schedule.name}
                        </h3>
                        <span className={cn(
                          "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border",
                          isDark ? "border-zinc-600 text-zinc-400" : "border-zinc-400 text-zinc-600"
                        )}>
                          {schedule.tasks.length} task{schedule.tasks.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Task list preview */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {schedule.tasks.map((task, index) => (
                          <div
                            key={task.id}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 border text-xs",
                              isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-200 bg-zinc-50"
                            )}
                          >
                            <span className={cn(
                              "text-[10px]",
                              isDark ? "text-zinc-500" : "text-zinc-400"
                            )}>
                              {index + 1}.
                            </span>
                            {getActionIcon(task.action)}
                            <span className={cn(
                              isDark ? "text-zinc-300" : "text-zinc-700"
                            )}>
                              {getActionLabel(task.action)}
                            </span>
                            {task.time_offset > 0 && (
                              <span className={cn(
                                "text-[10px]",
                                isDark ? "text-zinc-500" : "text-zinc-400"
                              )}>
                                +{task.time_offset}s
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className={cn(
                        "flex items-center gap-4 text-xs",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}>
                        <span className="font-mono">{schedule.cron}</span>
                        <span>-</span>
                        <span>Next: {formatNextRun(schedule)}</span>
                        <span>-</span>
                        <span>Last: {formatLastRun(schedule)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Switch
                        checked={schedule.enabled}
                        onCheckedChange={() => toggleSchedule(schedule)}
                        isDark={isDark}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(schedule)}
                        className={cn(
                          "transition-all p-2",
                          isDark
                            ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                            : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                        )}
                      >
                        <BsPencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDeleteModal(schedule)}
                        className={cn(
                          "transition-all p-2",
                          isDark
                            ? "border-red-900/60 text-red-400/80 hover:text-red-300 hover:border-red-700"
                            : "border-red-300 text-red-600 hover:text-red-700 hover:border-red-400"
                        )}
                      >
                        <BsTrash className="w-4 h-4" />
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
        isDark={isDark}
        isValid={isFormValid && !isSaving}
        size="lg"
      >
        <ScheduleForm />
      </FormModal>

      {/* Edit Schedule Modal */}
      <FormModal
        open={editModalOpen}
        onOpenChange={(open) => !isSaving && setEditModalOpen(open)}
        title="Edit Schedule"
        description={`Modify "${selectedSchedule?.name}" schedule.`}
        onSubmit={handleEdit}
        submitLabel={isSaving ? "Saving..." : "Save Changes"}
        isDark={isDark}
        isValid={isFormValid && !isSaving}
        size="lg"
      >
        <ScheduleForm />
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
        isDark={isDark}
      />
    </div>
  );
};

export default SchedulesPage;
