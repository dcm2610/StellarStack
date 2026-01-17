"use client";

import { useEffect, useRef } from "react";
import { cn } from "@workspace/ui/lib/utils";
import type { Particle, FloatingParticlesProps, FloatingDotsProps } from "../animations-types";

export type { Particle, FloatingParticlesProps, FloatingDotsProps };

export const FloatingParticles = ({
  count = 30,
  color = "rgba(255, 255, 255, 0.3)",
  minSize = 1,
  maxSize = 3,
  speed = 0.3,
  className,
}: FloatingParticlesProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number | undefined>(undefined);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    particlesRef.current = Array.from({ length: count }, () => {
      const vx = (Math.random() - 0.5) * speed;
      const vy = (Math.random() - 0.5) * speed;
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx,
        vy,
        baseVx: vx,
        baseVy: vy,
        size: minSize + Math.random() * (maxSize - minSize),
        opacity: 0.2 + Math.random() * 0.5,
      };
    });

    const updatePointer = (clientX: number, clientY: number) => {
      pointerRef.current = { x: clientX, y: clientY, active: true };
    };

    const handleMouseMove = (e: MouseEvent) => updatePointer(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        if (touch) updatePointer(touch.clientX, touch.clientY);
      }
    };
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        if (touch) updatePointer(touch.clientX, touch.clientY);
      }
    };
    const handlePointerLeave = () => {
      pointerRef.current.active = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("mouseleave", handlePointerLeave);
    window.addEventListener("touchend", handlePointerLeave);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pointer = pointerRef.current;
      const interactionRadius = 100;

      particlesRef.current.forEach((particle) => {
        // Add interaction with pointer (mouse/touch)
        if (pointer.active) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < interactionRadius && distance > 0) {
            const force = (interactionRadius - distance) / interactionRadius;
            const angle = Math.atan2(dy, dx);
            particle.vx = particle.baseVx + Math.cos(angle) * force * 2;
            particle.vy = particle.baseVy + Math.sin(angle) * force * 2;
          } else {
            // Gradually return to base velocity
            particle.vx += (particle.baseVx - particle.vx) * 0.05;
            particle.vy += (particle.baseVy - particle.vy) * 0.05;
          }
        } else {
          particle.vx += (particle.baseVx - particle.vx) * 0.05;
          particle.vy += (particle.baseVy - particle.vy) * 0.05;
        }

        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(")", `, ${particle.opacity})`).replace("rgb", "rgba");
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("mouseleave", handlePointerLeave);
      window.removeEventListener("touchend", handlePointerLeave);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [count, color, minSize, maxSize, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("fixed inset-0 pointer-events-none", className)}
      style={{ zIndex: 0 }}
    />
  );
};

export const FloatingDots = ({
  count = 20,
  className,
}: FloatingDotsProps) => {
  const dots = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: 1 + Math.random() * 2,
    duration: 20 + Math.random() * 40,
    delay: Math.random() * 20,
  }));

  return (
    <div className={cn("fixed inset-0 pointer-events-none overflow-hidden", className)}>
      {dots.map((dot) => (
        <div
          key={dot.id}
          className={cn(
            "absolute rounded-full animate-float",
            "bg-white/10"
          )}
          style={{
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            animationDuration: `${dot.duration}s`,
            animationDelay: `${dot.delay}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          25% {
            transform: translateY(-20px) translateX(10px);
            opacity: 0.6;
          }
          50% {
            transform: translateY(-10px) translateX(-10px);
            opacity: 0.4;
          }
          75% {
            transform: translateY(-30px) translateX(5px);
            opacity: 0.5;
          }
        }
        .animate-float {
          animation: float linear infinite;
        }
      `}</style>
    </div>
  );
};
