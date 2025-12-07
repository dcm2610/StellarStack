"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { Switch } from "@workspace/ui/components/switch";
import { BsSun, BsMoon, BsPlus, BsTrash, BsPencil, BsPlayFill, BsStopFill, BsArrowRepeat } from "react-icons/bs";

interface Schedule {
  id: string;
  name: string;
  action: "start" | "stop" | "restart" | "backup" | "command";
  cron: string;
  nextRun: string;
  enabled: boolean;
  lastRun?: string;
}

const mockSchedules: Schedule[] = [
  { id: "sch-1", name: "Daily Restart", action: "restart", cron: "0 4 * * *", nextRun: "Tomorrow 04:00", enabled: true, lastRun: "Today 04:00" },
  { id: "sch-2", name: "Backup", action: "backup", cron: "0 3 * * *", nextRun: "Tomorrow 03:00", enabled: true, lastRun: "Today 03:00" },
  { id: "sch-3", name: "Weekend Start", action: "start", cron: "0 8 * * 6,0", nextRun: "Saturday 08:00", enabled: true },
  { id: "sch-4", name: "Weekday Stop", action: "stop", cron: "0 2 * * 1-5", nextRun: "Monday 02:00", enabled: false },
];

const SchedulesPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>(mockSchedules);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  const toggleSchedule = (id: string) => {
    setSchedules(prev => prev.map(s =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    ));
  };

  const getActionIcon = (action: Schedule["action"]) => {
    switch (action) {
      case "start":
        return <BsPlayFill className="w-4 h-4 text-green-500" />;
      case "stop":
        return <BsStopFill className="w-4 h-4 text-red-500" />;
      case "restart":
        return <BsArrowRepeat className="w-4 h-4 text-amber-500" />;
      case "backup":
        return <BsArrowRepeat className="w-4 h-4 text-blue-500" />;
      default:
        return null;
    }
  };

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
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
                  Server {serverId} • {schedules.filter(s => s.enabled).length} active schedules
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
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
            {schedules.map((schedule) => (
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

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {getActionIcon(schedule.action)}
                    <div>
                      <div className="flex items-center gap-3">
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
                          {schedule.action}
                        </span>
                      </div>
                      <div className={cn(
                        "flex items-center gap-4 mt-1 text-xs",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}>
                        <span className="font-mono">{schedule.cron}</span>
                        <span>•</span>
                        <span>Next: {schedule.nextRun}</span>
                        {schedule.lastRun && (
                          <>
                            <span>•</span>
                            <span>Last: {schedule.lastRun}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={() => toggleSchedule(schedule.id)}
                      isDark={isDark}
                    />
                    <Button
                      variant="outline"
                      size="sm"
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchedulesPage;
