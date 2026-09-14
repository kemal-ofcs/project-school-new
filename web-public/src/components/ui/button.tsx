import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
      // Variants
      variant === "default" &&
        "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
      variant === "secondary" &&
        "bg-secondary-container text-secondary-container-foreground font-semibold shadow-md hover:brightness-105 active:brightness-95",
      variant === "outline" &&
        "border border-border bg-background hover:bg-muted hover:text-foreground",
      variant === "ghost" &&
        "text-foreground hover:bg-muted hover:text-foreground",
      variant === "destructive" &&
        "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
      variant === "link" && "text-primary underline-offset-4 hover:underline",
      // Sizes
      size === "default" && "h-11 px-5 py-2.5 text-sm",
      size === "sm" && "h-9 rounded-md px-3 text-xs",
      size === "lg" && "h-13 rounded-xl px-7 text-base font-semibold",
      size === "icon" && "h-11 w-11 p-0",
      className,
    );

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, {
        className: cn(classes, child.props.className),
        ...props,
      });
    }

    return (
      <button className={classes} ref={ref} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
