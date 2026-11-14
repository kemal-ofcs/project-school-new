"use client";

import { useCallback, useEffect, useState } from "react";
import { exportToExcel } from "@/lib/client/excel-export";
import { type LaporanPtk, muatLaporanPtk } from "@/lib/gateways/hris";
import { ringkasPtk } from "@/lib/validations/hris";
import {
  INPUT,
  LABEL,
  masaKerja,
  pesanGalat,
  TOMBOL,
  TOMBOL_UTAMA,
} from "./gaya";

const KOLOM = [
  "Nama",
  "Kelompok",
  "NIP",
  "NUPTK",
  "Unit",
  "Bagian",
  "Jabatan",
  "Status kepegawaian",
  "TMT",
  "Masa kerja",
  "Pendidikan tertinggi",
  "Program studi",
  "Perguruan tinggi",
  "Linier (tanda manual)",
  "Bidang sertifikasi",
  "Tahun sertifikasi",
  "NRG",
  "Mapel yang diajar",
];

/**
 * Laporan PTK per unit (§19.2.7). Datanya dari database cloud (pendidikan dan
 * sertifikat cloud-only); linieritas tanda manual, tidak dicocokkan otomatis
 * dengan mapel (Q-36).
 */
export function TabLaporanPtk({
  onPesan,
  onGalat,
}: {
  onPesan: (pesan: string) => void;
  onGalat: (pesan: string) => void;
}) {
  const [laporan, setLaporan] = useState<LaporanPtk | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [unit, setUnit] = useState("");
  const [mengunduh, setMengunduh] = useState(false);

  const muat = useCallback(async () => {
    try {
      setLaporan(await muatLaporanPtk());
      setGalat(null);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  if (galat) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300" role="alert">
          {galat}
        </p>
        <button type="button" className={TOMBOL} onClick={() => void muat()}>
          Coba lagi
        </button>
      </div>
    );
  }
  if (!laporan) {
    return <p className="text-sm text-slate-400">Memuat Laporan PTK…</p>;
  }

  const daftarUnit = [...new Set(laporan.baris.map((b) => b.unit))].sort();
  const baris = laporan.baris.filter((b) => !unit || b.unit === unit);
  const ringkas = ringkasPtk(baris);

  const unduh = async () => {
    if (mengunduh) return;
    setMengunduh(true);
    try {
      const isi = baris.map((b) => [
        b.nama,
        b.kelompok,
        b.nip,
        b.nuptk,
        b.unit,
        b.bagian,
        b.jabatan,
        b.status,
        b.tmt,
        masaKerja(b.tmt, laporan.hari_ini),
        b.jenjang,
        b.prodi,
        b.perguruan_tinggi,
        b.jenjang ? (b.linier === 1 ? "Ya" : "Tidak") : "",
        b.sertifikat_bidang,
        b.sertifikat_tahun ?? "",
        b.nrg,
        b.mapel,
      ]);
      const ringkasan = [...ringkas.per_unit, ringkas.total].map((r) => [
        `Ringkasan ${r.unit || "tanpa unit"}`,
        `${r.guru} guru, ${r.tendik} tendik`,
        `S1/D4 ke atas: ${r.persen_s1}% guru`,
        `Bersertifikat: ${r.persen_sertifikat}% guru`,
      ]);
      const hasil = await exportToExcel(
        `laporan-ptk-${unit || "semua-unit"}-${laporan.hari_ini}`,
        "Laporan PTK",
        KOLOM,
        [...isi, [], ...ringkasan],
      );
      if (!hasil.cancelled) {
        if (hasil.sukses)
          onPesan(`Laporan PTK (${baris.length} orang) diunduh.`);
        else onGalat("Berkas Laporan PTK gagal disimpan.");
      }
    } catch (error) {
      onGalat(pesanGalat(error));
    } finally {
      setMengunduh(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <label htmlFor="ptk-unit" className={LABEL}>
            Unit
          </label>
          <select
            id="ptk-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={INPUT}
          >
            <option value="">Semua unit</option>
            {daftarUnit.map((u) => (
              <option key={u} value={u}>
                {u || "Tanpa unit"}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={TOMBOL_UTAMA}
          disabled={mengunduh || baris.length === 0}
          onClick={() => void unduh()}
        >
          {mengunduh ? "Menyiapkan…" : "Unduh Excel"}
        </button>
      </div>
      <p className="text-sm text-slate-400">
        Pegawai aktif per {laporan.hari_ini}. Persentase dihitung atas guru;
        linieritas mengikuti tanda manual di riwayat pendidikan.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Guru</th>
              <th className="px-3 py-2">Tendik</th>
              <th className="px-3 py-2">Guru S1/D4 ke atas</th>
              <th className="px-3 py-2">Guru bersertifikat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-200">
            {[...ringkas.per_unit, ringkas.total].map((r, i, semua) => (
              <tr
                key={r.unit || "tanpa-unit"}
                className={
                  i === semua.length - 1 ? "font-semibold text-white" : ""
                }
              >
                <td className="px-3 py-2">{r.unit || "Tanpa unit"}</td>
                <td className="px-3 py-2">{r.guru}</td>
                <td className="px-3 py-2">{r.tendik}</td>
                <td className="px-3 py-2">
                  {r.guru_s1} ({r.persen_s1}%)
                </td>
                <td className="px-3 py-2">
                  {r.guru_sertifikat} ({r.persen_sertifikat}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
