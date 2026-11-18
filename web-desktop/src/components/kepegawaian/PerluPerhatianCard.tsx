"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasPermission } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import { getPerluPerhatian } from "@/lib/gateways/hris";
import {
  type ItemPengingat,
  IZIN_PENGINGAT,
  KEJADIAN_PENGINGAT,
  type KejadianPengingat,
} from "@/lib/validations/hr-pengingat";
import { PESAN_LURING } from "@/lib/validations/hris";

/** Tab `/kepegawaian` atau halaman tujuan tiap kejadian. */
type Tujuan = { tab: string } | { href: string };

const KEJADIAN: Record<KejadianPengingat, { label: string; tujuan: Tujuan }> = {
  kontrak_berakhir: {
    label: "Kontrak GTT/PTT berakhir",
    tujuan: { tab: "kontrak" },
  },
  percobaan_berakhir: {
    label: "Masa percobaan berakhir",
    tujuan: { tab: "kontrak" },
  },
  kgb: { label: "Kenaikan gaji berkala", tujuan: { tab: "kontrak" } },
  pensiun: { label: "Memasuki usia pensiun", tujuan: { tab: "daftar" } },
  dokumen_kedaluwarsa: {
    label: "Dokumen kedaluwarsa",
    tujuan: { tab: "daftar" },
  },
  sp_berakhir: { label: "Masa SP berakhir", tujuan: { tab: "daftar" } },
  pengajuan_menunggu: {
    label: "Pengajuan menunggu lebih dari 2 hari",
    tujuan: { href: "/pengajuan" },
  },
  jp_tanpa_penanganan: {
    label: "Jam pelajaran tanpa penanganan hari ini",
    tujuan: { href: "/jam-kosong" },
  },
  sk_pembagian_tugas: {
    label: "SK pembagian tugas semester baru",
    tujuan: { tab: "surat" },
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

  useEffect(() => {
    if (!boleh) return;
    let aktif = true;
    getPerluPerhatian()
      .then((hasil) => {
        if (!aktif) return;
        setItems(hasil.items);
        setLuring(false);
      })
      .catch((error: unknown) => {
        if (!aktif) return;
        setItems([]);
        setLuring(error instanceof Error && error.message === PESAN_LURING);
      });
    return () => {
      aktif = false;
    };
  }, [boleh]);

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
      className="space-y-3 rounded-2xl border border-amber-300/25 bg-slate-900 p-4"
    >
      <h2
        id="judul-perlu-perhatian"
        className="text-base font-semibold text-white"
      >
        Perlu perhatian
      </h2>
      <ul className="space-y-3">
        {kelompok.map(({ kejadian, daftar }) => {
          const { label, tujuan } = KEJADIAN[kejadian];
          const sisa = daftar.length - MAKS_NAMA;
          return (
            <li
              key={kejadian}
              className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-amber-100">
                  {label} · {daftar.length}
                </p>
                <p className="break-words text-slate-300">
                  {daftar.slice(0, MAKS_NAMA).map(baris).join("; ")}
                  {sisa > 0 ? `; dan ${sisa} lainnya` : ""}
                </p>
              </div>
              {"href" in tujuan ? (
                <Link
                  href={tujuan.href}
                  className="shrink-0 text-sm font-semibold text-sky-300 underline"
                >
                  Buka
                  <span className="sr-only"> {label}</span>
                </Link>
              ) : onBukaTab ? (
                <button
                  type="button"
                  onClick={() => onBukaTab(tujuan.tab)}
                  className="min-h-10 shrink-0 self-start text-left text-sm font-semibold text-sky-300 underline sm:min-h-0"
                >
                  Buka
                  <span className="sr-only"> {label}</span>
                </button>
              ) : (
                <Link
                  href="/kepegawaian"
                  className="shrink-0 text-sm font-semibold text-sky-300 underline"
                >
                  Buka
                  <span className="sr-only"> {label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
