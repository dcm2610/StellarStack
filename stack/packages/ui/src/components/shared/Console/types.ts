export type LogLevel = "info" | "error" | "default";

export interface ConsoleLine {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
}

export interface ConsoleProps {
  lines?: ConsoleLine[];
  onCommand?: (command: string) => void;
  maxLines?: number;
  className?: string;
  isDark?: boolean;
  isOffline?: boolean;
}
