"use client";

import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import {
  type AttendanceStatusType,
  StatusBadgePill,
} from "@/components/ui/StatusBadgePill";

export interface DigitalReceiptData {
  idTransaksi?: string;
  nama: string;
  nomorInduk: string;
  tipeNomor?: "NISN" | "NIP" | "ID";
  kelasAtauUnit?: string;
  waktu: string;
  status: AttendanceStatusType | string;
  keterangan?: string;
  lokasi?: string;
  fotoUrl?: string;
  noHpWali?: string;
}

interface DigitalReceiptCardProps {
  data: DigitalReceiptData;
  isOpen?: boolean;
  onClose?: () => void;
  isModal?: boolean;
  className?: string;
}

export function DigitalReceiptCard({
  data,
  isOpen = true,
  onClose,
  isModal = false,
  className = "",
}: DigitalReceiptCardProps) {
  const content = (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card-bca text-slate-900 dark:text-slate-100 ${className}`}
    >
      {/* Header Struk */}
      <div className="bg-gradient-to-r from-[#003399] to-[#002266] text-white p-3.5 text-center relative">
        <div className="flex items-center justify-center gap-1.5">
          <div className="size-5 rounded-full bg-white/20 flex items-center justify-center">
            <Icon name="check" className="size-3.5 text-emerald-300" />
          </div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-200">
            Bukti Presensi Resmi
          </span>
        </div>
      </div>

      {/* Badan Struk */}
      <div className="p-4 space-y-3.5">
        {/* Identitas Personil */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="size-11 rounded-xl bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-700 dark:text-sky-300 font-extrabold text-base shrink-0 overflow-hidden">
            {data.fotoUrl ? (
              // biome-ignore lint/a11y/useAltText: foto bukti presensi
              // biome-ignore lint/performance/noImgElement: base64 image data url
              <img src={data.fotoUrl} className="size-full object-cover" />
            ) : (
              data.nama.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold tracking-tight truncate">
              {data.nama}
            </h3>
            <p className="text-[11px] font-mono-data text-slate-500 dark:text-slate-400">
              {data.tipeNomor || "NISN"}: {data.nomorInduk}
            </p>
            {data.kelasAtauUnit && (
              <p className="text-[10px] font-semibold text-blue-600 dark:text-sky-400 mt-0.5">
                {data.kelasAtauUnit}
              </p>
            )}
          </div>
          <div className="shrink-0">
            <StatusBadgePill status={data.status} />
          </div>
        </div>

        {/* Detail Waktu & Lokasi */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              Waktu Presensi
            </span>
            <p className="font-bold font-mono-data text-slate-800 dark:text-slate-200">
              {data.waktu}
            </p>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              Terminal
            </span>
            <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
              {data.lokasi || "Terminal Utama"}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          {data.noHpWali && (
            <a
              href={`https://wa.me/${data.noHpWali.replace(/\D/g, "")}?text=${encodeURIComponent(
                `Informasi Presensi Sekolah:\nNama: ${data.nama}\nStatus: ${data.status}\nWaktu: ${data.waktu}\nCatatan: Presensi tercatat secara otomatis.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm"
            >
              <Icon name="whatsapp" className="size-3.5" />
              <span>Kirim ke WA</span>
            </a>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-95 text-slate-800 dark:text-slate-200 font-bold text-xs transition-all"
            >
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (isModal && onClose) {
    return (
      <Modal
        title="Struk Bukti Presensi"
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="max-w-sm"
      >
        {content}
      </Modal>
    );
  }

  return content;
}
