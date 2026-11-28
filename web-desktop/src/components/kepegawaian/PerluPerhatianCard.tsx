"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { hasPermission } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import { getPerluPerhatian } from "@/lib/gateways/hris";
import type { StatTone } from "@/lib/utils/stat-card";
import {
  type ItemPengingat,
  IZIN_PENGINGAT,
  KEJADIAN_PENGINGAT,
  type KejadianPengingat,
} from "@/lib/validations/hr-pengingat";
import { PESAN_LURING } from "@/lib/validations/hris";

/** Tab `/kepegawaian` atau halaman tujuan tiap kejadian. */
type Tujuan = { tab: string } | { href: string };

const KEJADIAN: Record<
  KejadianPengingat,
  {
    label: string;
    tujuan: Tujuan;
    icon: IconName;
    nadaDasar: Exclude<StatTone, "clean">;
  }
> = {
  kontrak_berakhir: {
    label: "Kontrak GTT/PTT berakhir",
    tujuan: { tab: "kontrak" },
    icon: "document",
    nadaDasar: "amber",
  },
  percobaan_berakhir: {
    label: "Masa percobaan berakhir",
    tujuan: { tab: "kontrak" },
    icon: "clock",
    nadaDasar: "amber",
  },
  kgb: {
    label: "Kenaikan gaji berkala",
    tujuan: { tab: "kontrak" },
    icon: "calendar",
    nadaDasar: "sky",
  },
  pensiun: {
    label: "Memasuki usia pensiun",
    tujuan: { tab: "daftar" },
    icon: "users",
    nadaDasar: "amber",
  },
  dokumen_kedaluwarsa: {
    label: "Dokumen kedaluwarsa",
    tujuan: { tab: "daftar" },
    icon: "document",
    nadaDasar: "amber",
  },
  sp_berakhir: {
    label: "Masa SP berakhir",
    tujuan: { tab: "daftar" },
    icon: "alert",
    nadaDasar: "amber",
  },
  pengajuan_menunggu: {
    label: "Pengajuan menunggu lebih dari 2 hari",
    tujuan: { href: "/pengajuan" },
    icon: "clock",
    nadaDasar: "amber",
  },
  jp_tanpa_penanganan: {
    label: "Jam pelajaran tanpa penanganan hari ini",
    tujuan: { href: "/jam-kosong" },
    icon: "alert",
    nadaDasar: "rose",
  },
  sk_pembagian_tugas: {
    label: "SK pembagian tugas semester baru",
    tujuan: { tab: "surat" },
    icon: "document",
    nadaDasar: "sky",
  },
};

const MAKS_NAMA = 5;

function waktu(i: ItemPengingat): string {
  if (i.kejadian === "pengajuan_menunggu") return `menunggu ${-i.sisa} hari`;
  if (i.kejadian === "jp_tanpa_penanganan") return "";
  if (i.sisa === 0) return "hari ini";
  return i.sisa > 0 ? `${i.sisa} hari lagi` : `lewat ${-i.sisa} hari`;
}

function baris(i: ItemPengingat): string {
  const nama =
    i.kejadian === "sk_pembagian_tugas"
      ? [i.keterangan, i.unit].filter(Boolean).join(" · ")
      : [i.nama, i.keterangan].filter(Boolean).join(" · ");
  const kapan = waktu(i);
  return kapan ? `${nama} (${kapan})` : nama;
}

function nadaKelompok(
  kejadian: KejadianPengingat,
  daftar: ItemPengingat[],
): Exclude<StatTone, "clean"> {
  if (kejadian === "jp_tanpa_penanganan") return "rose";
  if (kejadian === "pengajuan_menunggu") {
    return daftar.some((i) => -i.sisa > 5) ? "rose" : "amber";
  }
  if (
    kejadian === "kontrak_berakhir" ||
    kejadian === "percobaan_berakhir" ||
    kejadian === "dokumen_kedaluwarsa" ||
    kejadian === "sp_berakhir"
  ) {
    return daftar.some((i) => i.sisa <= 0) ? "rose" : "amber";
  }
  return KEJADIAN[kejadian].nadaDasar;
}

/**
 * Kartu "Perlu perhatian" HRIS (Fase 6a, §24.2.3), Web/Desktop. Isi disaring
 * backend dari sesi; kartu tidak dirender bila kosong. `onBukaTab` dipakai di
 * `/kepegawaian` supaya tautan mengganti tab tanpa memuat ulang halaman.
 */
export function PerluPerhatianCard({
  onBukaTab,
}: {
  onBukaTab?: (tab: string) => void;
}) {
  const { user, isAuthenticated } = useAuth();
  const boleh =
    isAuthenticated && IZIN_PENGINGAT.some((izin) => hasPermission(user, izin));
  const [items, setItems] = useState<ItemPengingat[]>([]);
  const [luring, setLuring] = useState(false);
  const [memuat, setMemuat] = useState(false);

  const muat = useCallback(async () => {
    if (!boleh) return;
    setMemuat(true);
    try {
      const hasil = await getPerluPerhatian();
      setItems(hasil.items);
      setLuring(false);
    } catch (error: unknown) {
      setItems([]);
      setLuring(error instanceof Error && error.message === PESAN_LURING);
    } finally {
      setMemuat(false);
    }
  }, [boleh]);

  useEffect(() => {
    void muat();
  }, [muat]);

  if (!boleh) return null;
  if (luring)
    return (
      <p className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300">
        Pengingat kepegawaian butuh koneksi.{" "}
        <Link
          href="/jam-kosong"
          className="font-semibold text-sky-300 underline"
        >
          Buka Jam Kosong
        </Link>
      </p>
    );
  if (items.length === 0) return null;

  const kelompok = KEJADIAN_PENGINGAT.map((k) => ({
    kejadian: k,
    daftar: items.filter((i) => i.kejadian === k),
  })).filter((k) => k.daftar.length > 0);

  return (
    <section
      aria-labelledby="judul-perlu-perhatian"
      className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="judul-perlu-perhatian"
          className="text-base font-bold text-white"
        >
          Perlu perhatian
        </h2>
        <button
          type="button"
          onClick={() => void muat()}
          disabled={memuat}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
        >
          <Icon
            name="refresh"
            className={`size-3.5 ${memuat ? "animate-spin" : ""}`}
          />
          Muat ulang
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kelompok.map(({ kejadian, daftar }) => {
          const { label, tujuan, icon } = KEJADIAN[kejadian];
          const sisa = daftar.length - MAKS_NAMA;
          const nada = nadaKelompok(kejadian, daftar);
          return (
            <div
              key={kejadian}
              data-tone={nada}
              className="stat-card flex flex-col justify-between gap-3 rounded-xl p-3.5"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="stat-card-label text-xs font-bold">
                    {label}
                  </span>
                  <Icon
                    name={icon}
                    className="stat-card-icon size-4 shrink-0"
                  />
                </div>
                <p className="stat-card-value text-lg font-black">
                  {daftar.length} tindak lanjut
                </p>
                <p className="break-words text-xs text-slate-400">
                  {daftar.slice(0, MAKS_NAMA).map(baris).join("; ")}
                  {sisa > 0 ? `; dan ${sisa} lainnya` : ""}
                </p>
              </div>
              <div>
                {"href" in tujuan ? (
                  <Link
                    href={tujuan.href}
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-300 hover:underline"
                  >
                    Buka {label}
                  </Link>
                ) : onBukaTab ? (
                  <button
                    type="button"
                    onClick={() => onBukaTab(tujuan.tab)}
                    className="inline-flex min-h-9 items-center gap-1 text-left text-xs font-bold text-sky-300 hover:underline sm:min-h-0"
                  >
                    Buka {label}
                  </button>
                ) : (
                  <Link
                    href="/kepegawaian"
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-300 hover:underline"
                  >
                    Buka {label}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
