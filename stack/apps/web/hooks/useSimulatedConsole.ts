"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useServerStore } from "../stores/connectionStore";
import { generateInitialLines, generateRandomLine, generateStartupSequence, type ConsoleLine } from "@workspace/ui/components/shared/Console";
import { t } from "../lib/i18n";

interface UseSimulatedConsoleReturn {
  lines: ConsoleLine[];
  handleCommand: (command: string) => void;
}

export const useSimulatedConsole = (): UseSimulatedConsoleReturn => {
  const [lines, setLines] = useState<ConsoleLine[]>(() => generateInitialLines(25));
  const isOffline = useServerStore((state) => state.isOffline);
  const containerStatus = useServerStore((state) => state.server.status);
  const prevStatusRef = useRef(containerStatus);

  const shouldGenerateLines = !isOffline && containerStatus === "running";

  // Handle startup sequence when container starts
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = containerStatus;

    // Detect transition to "starting" state
    if (containerStatus === "starting" && prevStatus !== "starting") {
      setLines([]); // Clear previous logs

      // Flood the console with startup messages
      const startupLines = generateStartupSequence();
      let index = 0;

      const floodInterval = setInterval(() => {
        if (index < startupLines.length) {
          const line = startupLines[index];
          if (line) {
            setLines((prev) => [...prev.slice(-99), { ...line, timestamp: Date.now() }]);
          }
          index++;
        } else {
          clearInterval(floodInterval);
        }
      }, 80); // Fast burst of messages

      return () => clearInterval(floodInterval);
    }

    // Clear logs when stopped
    if (containerStatus === "stopped") {
      setLines([]);
    }
  }, [containerStatus]);

  // Runtime log generation (slower, random messages)
  useEffect(() => {
    if (!shouldGenerateLines) return;

    const addLine = () => {
      setLines((prev) => [...prev.slice(-99), generateRandomLine()]);
    };

    const scheduleNext = (): ReturnType<typeof setTimeout> => {
      const delay = 3000 + Math.random() * 5000; // Slower: 3-8 seconds
      return setTimeout(() => {
        addLine();
        timeoutId = scheduleNext();
      }, delay);
    };

    // Initial delay before runtime messages start
    let timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      timeoutId = scheduleNext();
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [shouldGenerateLines]);

  const handleCommand = useCallback((command: string): void => {
    setLines((prev) => [
      ...prev,
      {
        id: `cmd-${Date.now()}`,
        timestamp: Date.now(),
        level: "default" as const,
        message: `> ${command}`,
      },
    ]);

    setTimeout(() => {
      setLines((prev) => [
        ...prev,
        {
          id: `resp-${Date.now()}`,
          timestamp: Date.now(),
          level: "info" as const,
          message: `Daemon: ${t("console.commandExecuted", { command })}`,
        },
      ]);
    }, 500);
  }, []);

  return { lines, handleCommand };
};
