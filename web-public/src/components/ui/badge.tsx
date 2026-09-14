import type * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "destructive"
    | "outline"
    | "prestige";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variant === "default" && "bg-primary text-primary-foreground shadow-sm",
        variant === "secondary" &&
          "bg-secondary text-secondary-foreground shadow-sm",
        variant === "prestige" &&
          "bg-primary-container text-primary-container-foreground font-mono",
        variant === "success" && "bg-accent text-accent-foreground",
        variant === "warning" &&
          "bg-secondary-container text-secondary-container-foreground font-bold",
        variant === "destructive" &&
          "bg-destructive text-destructive-foreground",
        variant === "outline" && "border border-border text-foreground",
        className,
      )}
      {...props}
    />
  );
}
