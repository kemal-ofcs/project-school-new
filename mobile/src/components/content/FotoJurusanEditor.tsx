"use client";

import { useEffect, useState } from "react";
import { getDaftarJurusan } from "@/lib/gateways/academic";
import { GambarKontenInput } from "./GambarKontenInput";

/**
 * Foto per jurusan untuk landing page, disimpan di `landing.jurusan_foto`
 * sebagai JSON `{kode_jurusan: id foto}`.
 *
 * Jurusan sendiri data master (`akademik_jurusan`), bukan koleksi CMS, jadi
 * fotonya dipetakan lewat kode, yang juga dipakai situs publik untuk
 * mencocokkan. Mengganti kode jurusan di menu Akademik melepas fotonya.
 */
export function FotoJurusanEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (json: string) => void;
  disabled?: boolean;
}) {
  const [jurusan, setJurusan] = useState<{ kode: string; nama: string }[]>([]);
  const [status, setStatus] = useState<"memuat" | "siap" | "gagal">("memuat");
  const [pesan, setPesan] = useState("");

  useEffect(() => {
    getDaftarJurusan()
      .then((daftar) => {
        setJurusan(
          daftar
            .filter((j) => Number(j.is_aktif ?? 1) === 1)
            .map((j) => ({
              kode: String(j.kode_jurusan ?? "").trim(),
              nama: String(j.nama_jurusan ?? "").trim(),
            }))
            .filter((j) => j.kode),
        );
        setStatus("siap");
      })
      .catch((err) => {
        setPesan(err instanceof Error ? err.message : "");
        setStatus("gagal");
      });
  }, []);

  let peta: Record<string, string> = {};
  try {
    const mentah = JSON.parse(value || "{}");
    if (mentah && typeof mentah === "object" && !Array.isArray(mentah)) {
      peta = mentah as Record<string, string>;
    }
  } catch {
    // JSON rusak dianggap belum ada foto; menyimpan ulang akan menimpanya.
  }

  const ubah = (kode: string, id: string) => {
    const berikut = { ...peta };
    if (id) berikut[kode] = id;
    else delete berikut[kode];
    onChange(Object.keys(berikut).length > 0 ? JSON.stringify(berikut) : "");
  };

  if (status === "memuat") {
    return <p className="text-xs text-slate-400">Memuat daftar jurusan...</p>;
  }
  if (status === "gagal") {
    return (
      <p role="alert" className="text-xs text-rose-400">
        Daftar jurusan tidak bisa dibaca{pesan ? `: ${pesan}` : "."}
      </p>
    );
  }
  if (jurusan.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        Belum ada jurusan aktif. Tambahkan lewat menu Akademik.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {jurusan.map((j) => (
        <GambarKontenInput
          key={j.kode}
          inputId={`foto-jurusan-${j.kode}`}
          label={`${j.nama} (${j.kode})`}
          value={peta[j.kode] ?? ""}
          disabled={disabled}
          onChange={(id) => ubah(j.kode, id)}
        />
      ))}
    </div>
  );
}
