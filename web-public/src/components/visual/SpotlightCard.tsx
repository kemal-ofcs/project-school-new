"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
}

export function SpotlightCard({
  children,
  className = "",
  glowColor = "rgba(133, 83, 0, 0.12)",
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: -200, y: -200 });
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setOpacity(1);
    };

    const handlePointerLeave = () => {
      setOpacity(0);
    };

    el.addEventListener("pointermove", handlePointerMove, { passive: true });
    el.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group relative overflow-hidden transition-all duration-300 ${className}`}
    >
      {/* Radial Spotlight Overlay */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, ${glowColor}, transparent 65%)`,
        }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
