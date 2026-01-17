"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { BsSend } from "react-icons/bs";
import { cn } from "@workspace/ui/lib/utils";
import type { ConsoleLine, ConsoleProps } from "./types";
import { TimestampColumnTooltip } from "./timestamp-tooltip";
import { ScrollContext } from "./scroll-context";

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  const ms = date.getUTCMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

const getLogLevelStyles = (level: ConsoleLine["level"]): string => {
  switch (level) {
    case "info":
      return "text-blue-400";
    case "error":
      return "text-red-400";
    default:
      return "text-zinc-300";
  }
};

export const Console = ({
  lines = [],
  onCommand,
  maxLines = 100,
  className,
  isOffline = false,
  showSendButton = false,
}: ConsoleProps) => {
  const [inputValue, setInputValue] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollSignal, setScrollSignal] = useState(0);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const timestampColumnRef = useRef<HTMLTableCellElement>(null);

  // Auto-scroll to bottom when new lines are added (smooth)
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [lines, autoScroll]);

  // Detect if user has scrolled up and close tooltip
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
      setCanScrollUp(scrollTop > 10);

      // Close tooltip and signal scroll
      setHoveredTimestamp(null);
      setScrollSignal((prev) => prev + 1);
    }
  }, []);

  // Handle timestamp hover
  const handleTimestampHover = useCallback((timestamp: number, event: React.MouseEvent) => {
    setHoveredTimestamp(timestamp);
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    setTooltipPosition({ top: rect.top, left: rect.right + 12 });
  }, []);

  // Handle leaving timestamp column
  const handleTimestampColumnLeave = useCallback(() => {
    setHoveredTimestamp(null);
  }, []);

  // Check if we can scroll up when lines change
  useEffect(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setCanScrollUp(scrollHeight > clientHeight && scrollTop > 10);
    }
  }, [lines]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline) return;
    if (inputValue.trim() && onCommand) {
      onCommand(inputValue.trim());
      setCommandHistory((prev) => [...prev, inputValue.trim()]);
      setHistoryIndex(-1);
      setInputValue("");
      setAutoScroll(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex =
          historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex] ?? "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInputValue("");
        } else {
          setHistoryIndex(newIndex);
          setInputValue(commandHistory[newIndex] ?? "");
        }
      }
    }
  };

  // Focus input when clicking on console (but not when selecting text)
  const handleConsoleClick = (e: React.MouseEvent) => {
    // Don't focus if user is selecting text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    // Don't focus if clicking on a link
    if ((e.target as HTMLElement).tagName === "A") {
      return;
    }
    inputRef.current?.focus();
  };

  // Parse URLs in text and return elements with clickable links
  const parseLinks = (text: string): React.ReactNode => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        // Reset regex lastIndex since we're reusing it
        urlRegex.lastIndex = 0;
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="underline transition-opacity hover:opacity-80"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const displayLines = lines.slice(-maxLines);

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border transition-colors",
        "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] shadow-lg shadow-black/20",
        isOffline && "opacity-60",
        className
      )}
      onClick={handleConsoleClick}
    >
      {/* Corner accents */}
      <div
        className={cn(
          "pointer-events-none absolute top-0 left-0 h-3 w-3 border-t border-l",
          "border-zinc-500"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute top-0 right-0 h-3 w-3 border-t border-r",
          "border-zinc-500"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l",
          "border-zinc-500"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute right-0 bottom-0 h-3 w-3 border-r border-b",
          "border-zinc-500"
        )}
      />

      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between border-b px-4 py-2",
          "border-zinc-200/10"
        )}
      >
        <span
          className={cn(
            "text-xs font-medium tracking-wider uppercase",
            "text-zinc-400"
          )}
        >
          Console
        </span>
        <div className="flex items-center gap-2">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (scrollRef.current) {
                  scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: "smooth",
                  });
                }
              }}
              className={cn(
                "text-xs transition-colors",
                "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Scroll to bottom
            </button>
          )}
          <span className={cn("text-xs", "text-zinc-600")}>
            {displayLines.length} lines
          </span>
        </div>
      </div>

      {/* Console output */}
      <ScrollContext.Provider value={scrollSignal}>
        <div className="relative flex-1 overflow-hidden">
          {/* Offline overlay - shows message instead of spinner when server is off */}
          {isOffline && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20">
              <div className="flex flex-col items-center gap-2">
                <span
                  className={cn(
                    "text-xs tracking-wider uppercase",
                    "text-zinc-500"
                  )}
                >
                  Server is offline
                </span>
              </div>
            </div>
          )}
          {/* Top gradient when scrolled to bottom but can scroll up */}
          <div
            className={cn(
              "pointer-events-none absolute top-0 right-0 left-0 z-10 h-8 transition-opacity duration-300",
              "bg-gradient-to-b from-[#0f0f0f] to-transparent",
              autoScroll && canScrollUp ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            onMouseLeave={handleTimestampColumnLeave}
            className={cn(
              "scrollbar-thin scrollbar-track-transparent h-full overflow-x-hidden overflow-y-auto p-2 font-mono text-xs",
              "scrollbar-thumb-zinc-700"
            )}
          >
            <table className="w-full border-collapse">
              <tbody>
                {displayLines.map((line) => (
                  <tr
                    key={line.id}
                    className={cn("group", "hover:bg-zinc-900/50")}
                  >
                    <td
                      className={cn(
                        "w-[110px] cursor-default py-0.5 pr-4 align-top whitespace-nowrap transition-colors",
                        "text-zinc-600 hover:text-zinc-400"
                      )}
                      onMouseEnter={(e) => handleTimestampHover(line.timestamp, e)}
                      onMouseMove={(e) => handleTimestampHover(line.timestamp, e)}
                      onMouseLeave={handleTimestampColumnLeave}
                    >
                      {formatTimestamp(line.timestamp)}
                    </td>
                    <td
                      className={cn(
                        "py-0.5 break-words select-text",
                        getLogLevelStyles(line.level)
                      )}
                    >
                      {parseLinks(line.message)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Timestamp column tooltip */}
            {hoveredTimestamp && tooltipPosition && (
              <TimestampColumnTooltip
                timestamp={hoveredTimestamp}
                position={tooltipPosition}
              />
            )}
          </div>
        </div>
      </ScrollContext.Provider>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className={cn("border-t", "border-zinc-200/10")}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <span className={cn("font-mono text-sm", "text-zinc-600")}>
            $
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isOffline ? "Connection lost..." : "Enter command..."}
            disabled={isOffline}
            className={cn(
              "flex-1 border-none bg-transparent font-mono text-sm outline-none",
              "text-zinc-200 placeholder:text-zinc-700",
              isOffline && "cursor-not-allowed"
            )}
          />
          {showSendButton && (
            <button
              type="submit"
              disabled={isOffline || !inputValue.trim()}
              className={cn(
                "flex items-center justify-center rounded p-2 transition-all",
                "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                (isOffline || !inputValue.trim()) && "cursor-not-allowed opacity-40"
              )}
              aria-label="Send command"
            >
              <BsSend className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
