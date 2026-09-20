"use client";

import { MessageCircle, UserCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface StickyActionProps {
  nomorTelepon?: string | null;
}

export function StickyAction({ nomorTelepon }: StickyActionProps) {
  // Format no HP ke standar tautan WhatsApp
  const waNumber = (nomorTelepon ?? "081234567890").replace(/\D/g, "");
  const waUrl = `https://wa.me/${waNumber.startsWith("0") ? `62${waNumber.slice(1)}` : waNumber}?text=${encodeURIComponent(
    "Halo Panitia PMB, saya ingin berkonsultasi mengenai pendaftaran siswa baru.",
  )}`;

  return (
    <>
      {/* 1. Desktop Floating WhatsApp Button */}
      <aside className="fixed bottom-6 right-6 z-40 hidden md:flex items-center group">
        <div className="mr-3 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-semibold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
          Konsultasi PMB (WhatsApp)
        </div>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Konsultasi WhatsApp PMB"
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageCircle className="relative z-10 h-6 w-6" />
        </a>
      </aside>

      {/* 2. Mobile Sticky Bottom Action Bar (Thumb-Zone) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-border bg-background/95 backdrop-blur-xl p-3 pb-safe shadow-2xl transition-colors">
        <div className="flex items-center gap-2.5 max-w-md mx-auto">
          {/* Tombol WhatsApp Icon-Only */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat WhatsApp Panitia PMB"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-md transition-transform active:scale-95"
          >
            <MessageCircle className="h-6 w-6" />
          </a>

          {/* Tombol Daftar PMB Lebar */}
          <Button
            asChild
            variant="secondary"
            className="flex-1 h-12 rounded-xl text-sm font-bold shadow-md active:scale-[0.98] justify-center"
          >
            <Link href="/pmb">
              <UserCheck className="h-5 w-5 mr-1.5" />
              <span>Daftar PMB Sekarang</span>
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
