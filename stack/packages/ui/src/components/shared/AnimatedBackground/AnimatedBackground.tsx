"use client";

import { useEffect, useRef, useCallback } from "react";

interface AnimatedBackgroundProps {
  isDark?: boolean;
  dotSize?: number;
  dotSpacing?: number;
  glowRadius?: number;
  glowIntensity?: number;
  trailLength?: number;
  trailDecay?: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

export function AnimatedBackground({
  isDark = true,
  dotSize = 1,
  dotSpacing = 24,
  glowRadius = 100,
  glowIntensity = 0.25,
  trailLength = 12,
  trailDecay = 0.92,
}: AnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const trailRef = useRef<TrailPoint[]>([]);
  const animationRef = useRef<number>();
  const lastTrailTimeRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const mouse = mouseRef.current;
    const trail = trailRef.current;

    // Add current mouse position to trail (throttled)
    const now = Date.now();
    if (now - lastTrailTimeRef.current > 30 && mouse.x > -500) {
      trail.unshift({ x: mouse.x, y: mouse.y, age: 1 });
      if (trail.length > trailLength) {
        trail.pop();
      }
      lastTrailTimeRef.current = now;
    }

    // Age and decay trail points
    for (let i = 0; i < trail.length; i++) {
      trail[i].age *= trailDecay;
    }

    // Remove faded trail points
    while (trail.length > 0 && trail[trail.length - 1].age < 0.01) {
      trail.pop();
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Base dot color - more subtle
    const baseDotColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
    const glowColor = isDark ? [255, 255, 255] : [0, 0, 0];

    // Draw dots
    for (let x = dotSpacing / 2; x < width; x += dotSpacing) {
      for (let y = dotSpacing / 2; y < height; y += dotSpacing) {
        let maxIntensity = 0;

        // Check distance from all trail points
        for (let i = 0; i < trail.length; i++) {
          const point = trail[i];
          const dx = x - point.x;
          const dy = y - point.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Calculate glow intensity based on distance and age
          const glow = Math.max(0, 1 - distance / glowRadius);
          const intensity = glow * glowIntensity * point.age;
          maxIntensity = Math.max(maxIntensity, intensity);
        }

        // Also check current mouse position
        const dx = x - mouse.x;
        const dy = y - mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const glow = Math.max(0, 1 - distance / glowRadius);
        const currentIntensity = glow * glowIntensity;
        maxIntensity = Math.max(maxIntensity, currentIntensity);

        // Set dot color with glow
        if (maxIntensity > 0.005) {
          const alpha = isDark
            ? 0.08 + maxIntensity * 0.35
            : 0.06 + maxIntensity * 0.25;
          ctx.fillStyle = `rgba(${glowColor[0]}, ${glowColor[1]}, ${glowColor[2]}, ${alpha})`;

          // Slightly larger dots when glowing
          const currentDotSize = dotSize + maxIntensity * 1.2;
          ctx.beginPath();
          ctx.arc(x, y, currentDotSize, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = baseDotColor;
          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [isDark, dotSize, dotSpacing, glowRadius, glowIntensity, trailLength, trailDecay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    // Track mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    window.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    // Start animation
    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
