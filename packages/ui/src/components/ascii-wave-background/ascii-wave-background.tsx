"use client";

import { useEffect, useRef, useCallback } from "react";

interface AsciiWaveBackgroundProps {
  fontSize?: number;
  speed?: number;
}

const ASCII_CHARS = " .:-=+*#%@";

export const AsciiWaveBackground = ({
  fontSize = 8,
  speed = 1,
}: AsciiWaveBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const timeRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    const cols = Math.floor(width / fontSize);
    const rows = Math.floor(height / fontSize);

    // Time for animation
    timeRef.current += 0.03 * speed;
    const time = timeRef.current;

    // Clear canvas
    ctx.fillStyle = "transparent";
    ctx.clearRect(0, 0, width, height);

    // Set text style
    ctx.fillStyle = "#e5e7eb";
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = "top";

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Generate procedural "brightness" using noise-like patterns
        // This simulates what a video would provide
        const noise1 = Math.sin(x * 0.1 + time * 0.5) * Math.cos(y * 0.1 + time * 0.3);
        const noise2 = Math.sin(x * 0.05 - time * 0.2) * Math.sin(y * 0.08 + time * 0.4);
        const noise3 = Math.cos(x * 0.03 + y * 0.03 + time * 0.1);
        const noise4 = Math.sin((x + y) * 0.05 + time * 0.3) * 0.5;

        // Combine noise values to get brightness (0 to 1)
        const combinedNoise = (noise1 + noise2 + noise3 + noise4) / 4;
        const brightness = (combinedNoise + 1) / 2; // Normalize to 0-1

        // Map brightness to character
        const charIndex = Math.floor(brightness * (ASCII_CHARS.length - 1));
        const char = ASCII_CHARS[charIndex];

        // Wave distortion (from the original code)
        const wave =
          Math.sin(x * 0.15 + time) * 6 +
          Math.cos(y * 0.15 + time) * 6;

        // Only draw if character is not space (optimization)
        if (char && char !== " ") {
          // Add some opacity variation based on brightness
          const alpha = 0.15 + brightness * 0.35;
          ctx.fillStyle = `rgba(229, 231, 235, ${alpha})`;

          ctx.fillText(char, x * fontSize, y * fontSize + wave);
        }
      }
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [fontSize, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    window.addEventListener("orientationchange", updateSize);

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("orientationchange", updateSize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
};
