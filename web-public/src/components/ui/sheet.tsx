"use client";

import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface SheetContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SheetContext = React.createContext<SheetContextType | null>(null);

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange],
  );

  return (
    <SheetContext.Provider value={{ open: isOpen, setOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

export function SheetTrigger({
  asChild,
  children,
  className,
}: {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(SheetContext);
  if (!ctx) return null;

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<{ onClick?: () => void }>,
      {
        onClick: () => ctx.setOpen(true),
      },
    );
  }

  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(true)}
      className={className}
    >
      {children}
    </button>
  );
}

export function SheetContent({
  side = "right",
  children,
  className,
}: {
  side?: "left" | "right" | "bottom";
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(SheetContext);
  if (!ctx || !ctx.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={() => ctx.setOpen(false)}
        aria-hidden="true"
      />
      {/* Slide Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed z-50 flex flex-col bg-card p-6 shadow-2xl transition-transform duration-300 ease-in-out border-border",
          side === "right" &&
            "right-0 top-0 h-full w-full max-w-xs border-l animate-in slide-in-from-right",
          side === "left" &&
            "left-0 top-0 h-full w-full max-w-xs border-r animate-in slide-in-from-left",
          side === "bottom" &&
            "bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl border-t pb-safe animate-in slide-in-from-bottom",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => ctx.setOpen(false)}
          className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Tutup Menu"
        >
          <X className="h-6 w-6" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-2 text-left mb-6", className)}
      {...props}
    />
  );
}

export function SheetTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("font-bold text-lg text-foreground", className)}
      {...props}
    />
  );
}
