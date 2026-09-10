"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/lib/hooks/useDialogFocus";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
  hideFooter?: boolean;
  /**
   * Baris aksi kustom di kaki dialog.
   *
   * Ditambahkan agar kontraknya sama dengan Modal web-desktop: tanpa ini,
   * halaman Mobile terpaksa menaruh tombolnya di dalam badan yang bergulir,
   * sehingga "Simpan" bisa hilang dari layar pada dialog yang panjang.
   */
  footer?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  titleId = "modal-title",
  subtitle,
  children,
  maxWidth = "max-w-lg",
  hideFooter = false,
  footer,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Dialog baru dirender setelah komponen benar-benar terpasang.
  //
  // Dua alasan, dan keduanya sudah dimiliki Modal web-desktop sejak awal:
  // createPortal menyentuh document, yang belum ada saat halaman
  // di-prerender static export; dan tanpa portal, panel dialog tunduk pada
  // stacking context serta overflow milik induknya — pada Mobile itu berarti
  // ia bisa terpotong oleh navigasi bawah yang fixed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Sebelumnya Modal Mobile TIDAK mengelola fokus sama sekali: membuka dialog
  // meninggalkan fokus pada tombol pemicunya, di belakang backdrop, sehingga
  // pengguna keyboard dan pembaca layar tidak pernah masuk ke dalamnya — dan
  // gulir latar tetap berjalan di belakang panel. Hook ini juga menahan Tab
  // agar tidak keluar, sehingga `aria-modal="true"` di bawah tidak berbohong.
  useDialogFocus(dialogRef, isOpen && mounted);

  useEffect(() => {
    if (!isOpen || !mounted) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, mounted]);

  if (!isOpen || !mounted) return null;

  const handleContainerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Dihentikan supaya dialog bertumpuk tidak ikut tertutup sekaligus.
      event.stopPropagation();
      onCloseRef.current();
    }
  };

  return createPortal(
    /*
     * Modal dialog diposisikan tepat di tengah layar (center-aligned)
     * dengan margin responsif, rounded-3xl modern, dan batasan tinggi
     * aman dinamis sesuai Rule 4.17.
     *
     * `data-no-pull-refresh` mencegah gestur tarik-ke-bawah aktif di atas
     * backdrop (lihat components/PullToRefresh.tsx).
     */
    <div
      data-no-pull-refresh
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-3.5 sm:p-4 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleContainerKeyDown}
        className={`flex w-full ${maxWidth} max-h-[min(88dvh,calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1.5rem))] flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-900/98 shadow-2xl shadow-black/80 backdrop-blur-2xl transition-all animate-in zoom-in-95 duration-200`}
      >
        {/* Sticky Modal Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10 shrink-0 bg-slate-900/95 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3
              id={titleId}
              className="truncate text-sm sm:text-base font-bold text-white tracking-wide"
              title={title}
            >
              {title}
            </h3>
            {subtitle ? (
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition active:scale-95 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body with Momentum Touch Scrolling */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 text-slate-100 touch-pan-y">
          {children}
        </div>

        {/* Sticky Footer */}
        {footer ? (
          <div className="flex shrink-0 items-center justify-end border-t border-white/10 bg-slate-950/80 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : !hideFooter ? (
          <div className="flex shrink-0 items-center justify-end border-t border-white/10 bg-slate-950/80 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black text-xs transition shadow-md shadow-sky-500/20"
            >
              Tutup
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
