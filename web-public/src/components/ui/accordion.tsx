"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface AccordionContextType {
  openItems: Set<string>;
  toggleItem: (value: string) => void;
  type: "single" | "multiple";
}

const AccordionContext = React.createContext<AccordionContextType | null>(null);

export function Accordion({
  type = "single",
  defaultValue,
  children,
  className,
}: {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
  children: React.ReactNode;
  className?: string;
}) {
  const [openItems, setOpenItems] = React.useState<Set<string>>(() => {
    if (!defaultValue) return new Set();
    return new Set(Array.isArray(defaultValue) ? defaultValue : [defaultValue]);
  });

  const toggleItem = React.useCallback(
    (value: string) => {
      setOpenItems((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          if (type === "single") next.clear();
          next.add(value);
        }
        return next;
      });
    },
    [type],
  );

  return (
    <AccordionContext.Provider value={{ openItems, toggleItem, type }}>
      <div className={cn("space-y-3", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors",
        className,
      )}
      data-value={value}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{ value?: string }>,
            {
              value,
            },
          );
        }
        return child;
      })}
    </div>
  );
}

export function AccordionTrigger({
  value,
  children,
  className,
}: {
  value?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(AccordionContext);
  if (!ctx || !value) return null;
  const isOpen = ctx.openItems.has(value);

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={() => ctx.toggleItem(value)}
      className={cn(
        "flex w-full items-center justify-between p-5 text-left font-semibold text-base transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
    >
      <span>{children}</span>
      <ChevronDown
        className={cn(
          "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180 text-primary",
        )}
      />
    </button>
  );
}

export function AccordionContent({
  value,
  children,
  className,
}: {
  value?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(AccordionContext);
  if (!ctx || !value) return null;
  const isOpen = ctx.openItems.has(value);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "animate-in fade-in-50 px-5 pb-5 pt-1 text-muted-foreground text-sm leading-relaxed",
        className,
      )}
    >
      {children}
    </div>
  );
}
