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
  isOffline?: boolean;
  showSendButton?: boolean;
}

export interface TooltipPosition {
  top: number;
  left: number;
}

export interface TimestampColumnTooltipProps {
  timestamp: number;
  position: TooltipPosition;
}
