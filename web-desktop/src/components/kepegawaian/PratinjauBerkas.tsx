"use client";

import { useState } from "react";
import { saveFileWithPicker } from "@/lib/client/download";
import { pesanGalat, TOMBOL } from "./gaya";

/** Pratinjau satu berkas cloud (gambar tampil, PDF hanya disimpan). */
export function PratinjauBerkas({
  berkas,
  onTutup,
}: {
  berkas: { nama_berkas: string; mime_type: string; data_base64: string };
  onTutup: () => void;
}) {
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const src = `data:${berkas.mime_type};base64,${berkas.data_base64}`;
  const simpan = async () => {
    setMenyimpan(true);
    setGalat(null);
    try {
      await saveFileWithPicker(src, berkas.nama_berkas);
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      setMenyimpan(false);
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-white/10 p-2">
      <p className="break-all text-xs text-slate-300">{berkas.nama_berkas}</p>
      {berkas.mime_type === "application/pdf" ? (
        <p className="text-xs text-slate-400">
          Pratinjau PDF tidak tersedia di sini. Simpan ke perangkat untuk
          membukanya.
        </p>
      ) : (
        // biome-ignore lint/performance/noImgElement: sumbernya data URI dari cloud, bukan aset statis yang bisa dioptimalkan
        <img
          alt={`Berkas ${berkas.nama_berkas}`}
          className="max-h-[50vh] w-full rounded-lg object-contain"
          src={src}
        />
      )}
      {galat ? (
        <p className="text-xs text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={TOMBOL}
          disabled={menyimpan}
          onClick={() => void simpan()}
        >
          Simpan ke perangkat
        </button>
        <button type="button" className={TOMBOL} onClick={onTutup}>
          Tutup pratinjau
        </button>
      </div>
    </div>
  );
}
