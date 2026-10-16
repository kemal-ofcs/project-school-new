"use client";

import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextType | null>(null);

export function Dialog({
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
    <DialogContext.Provider value={{ open: isOpen, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(DialogContext);
  const open = ctx?.open ?? false;
  const setOpenRef = React.useRef(ctx?.setOpen);
  setOpenRef.current = ctx?.setOpen;
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Escape menutup dialog, fokus pindah ke dialog sekali saat dibuka, lalu
  // kembali ke tombol pembukanya saat ditutup supaya pengguna keyboard tidak
  // terlempar ke awal halaman.
  React.useEffect(() => {
    if (!open) return;
    const sebelumnya = document.activeElement as HTMLElement | null;
    if (!dialogRef.current?.contains(document.activeElement)) {
      dialogRef.current?.focus();
    }
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRef.current?.(false);
    };
    document.addEventListener("keydown", tekan);
    return () => {
      document.removeEventListener("keydown", tekan);
      sebelumnya?.focus?.();
    };
  }, [open]);

  if (!ctx || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={() => ctx.setOpen(false)}
        aria-hidden="true"
      />
      {/* Modal Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "relative z-50 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200 focus:outline-none",
          className,
        )}
      >
        {/* Berlatar kartu supaya tetap terlihat di atas foto detail program. */}
        <button
          type="button"
          onClick={() => ctx.setOpen(false)}
          className="absolute right-4 top-4 z-10 rounded-full bg-card/90 p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Tutup Dialog"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-bold text-xl leading-none tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-sm text-muted-foreground leading-relaxed pt-1.5",
        className,
      )}
      {...props}
    />
  );
}
