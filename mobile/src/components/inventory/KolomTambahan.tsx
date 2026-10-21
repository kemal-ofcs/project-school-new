"use client";

import { type FormEvent, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  type KolomInventaris,
  simpanKolomInventaris,
} from "@/lib/gateways/inventory";
import { MAKS_KOLOM_AKTIF, TIPE_KOLOM } from "@/lib/validations/inventory";
import { INPUT, LABEL, pesanGalat, TOMBOL_KEDUA, TOMBOL_UTAMA } from "./gaya";

type Pesan = { tone: "success" | "error"; text: string } | null;

/**
 * Kolom tambahan barang: tambah, ganti nama, nonaktifkan. Tidak ada hapus:
 * isi kolom nonaktif tetap tersimpan dan kembali bila kolomnya diaktifkan.
 */
export function DialogKolomTambahan({
  kolom,
  isSubmittingRef,
  onClose,
  onChanged,
}: {
  kolom: KolomInventaris[];
  isSubmittingRef: { current: boolean };
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [pesan, setPesan] = useState<Pesan>(null);
  const [nama, setNama] = useState("");
  const [tipe, setTipe] = useState<string>("Teks");
  const jumlahAktif = kolom.filter((item) => item.is_aktif).length;

  const simpan = async (
    draft: Parameters<typeof simpanKolomInventaris>[0],
    berhasil: string,
  ): Promise<boolean> => {
    if (isSubmittingRef.current) return false;
    isSubmittingRef.current = true;
    setPesan(null);
    try {
      await simpanKolomInventaris(draft);
      await onChanged();
      setPesan({ tone: "success", text: berhasil });
      return true;
    } catch (error) {
      setPesan({
        tone: "error",
        text: pesanGalat(error, "Kolom tidak bisa disimpan."),
      });
      return false;
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const tambah = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await simpan(
      { nama, tipe, is_aktif: true },
      `Kolom ${nama.trim()} ditambahkan.`,
    );
    if (ok) setNama("");
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Kolom tambahan"
      titleId="inv-kolom-judul"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          Kolom tambahan muncul di formulir barang, rincian, dan berkas Excel.
          Menonaktifkan kolom menyembunyikannya tanpa menghapus isinya. Tipe
          tidak bisa diubah setelah kolom dibuat.
        </p>
        {kolom.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada kolom tambahan.</p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/40">
            {kolom.map((item) => (
              <BarisKolom
                key={`${item.id_kolom}:${item.nama}`}
                kolom={item}
                onSimpan={simpan}
              />
            ))}
          </ul>
        )}
        <form onSubmit={tambah} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="inv-kolom-baru" className={LABEL}>
              Nama kolom baru
            </label>
            <input
              id="inv-kolom-baru"
              required
              maxLength={40}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="inv-kolom-tipe" className={LABEL}>
              Tipe
            </label>
            <select
              id="inv-kolom-tipe"
              value={tipe}
              onChange={(e) => setTipe(e.target.value)}
              className={INPUT}
            >
              {TIPE_KOLOM.map((nilai) => (
                <option key={nilai} value={nilai}>
                  {nilai}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={jumlahAktif >= MAKS_KOLOM_AKTIF}
            className={TOMBOL_UTAMA}
          >
            Tambah kolom
          </button>
        </form>
        <p className="text-xs text-slate-400">
          Angka boleh berkoma, misalnya 2,5 kg. {jumlahAktif} dari{" "}
          {MAKS_KOLOM_AKTIF} kolom aktif dipakai.
        </p>
        {pesan ? (
          <p
            role={pesan.tone === "error" ? "alert" : "status"}
            className={
              pesan.tone === "error"
                ? "p-3 rounded-lg border border-rose-500/30 bg-rose-500/20 text-sm text-rose-100"
                : "p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/20 text-sm text-emerald-100"
            }
          >
            {pesan.text}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={TOMBOL_KEDUA}>
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BarisKolom({
  kolom,
  onSimpan,
}: {
  kolom: KolomInventaris;
  onSimpan: (
    draft: Parameters<typeof simpanKolomInventaris>[0],
    berhasil: string,
  ) => Promise<boolean>;
}) {
  const [nama, setNama] = useState(kolom.nama);
  const idInput = `inv-kolom-${kolom.id_kolom}`;
  const draft = { id_kolom: kolom.id_kolom, tipe: kolom.tipe };

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={idInput} className={LABEL}>
            Nama kolom ({kolom.tipe}){!kolom.is_aktif ? " · nonaktif" : ""}
          </label>
          <input
            id={idInput}
            maxLength={40}
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className={INPUT}
          />
        </div>
        <button
          type="button"
          disabled={nama.trim() === kolom.nama}
          onClick={() =>
            void onSimpan(
              { ...draft, nama, is_aktif: kolom.is_aktif },
              `Kolom ${kolom.nama} diganti menjadi ${nama.trim()}.`,
            )
          }
          className={TOMBOL_KEDUA}
        >
          Simpan nama
        </button>
        <button
          type="button"
          onClick={() =>
            void onSimpan(
              { ...draft, nama: kolom.nama, is_aktif: !kolom.is_aktif },
              kolom.is_aktif
                ? `Kolom ${kolom.nama} dinonaktifkan. Isinya tetap tersimpan.`
                : `Kolom ${kolom.nama} aktif lagi.`,
            )
          }
          className={TOMBOL_KEDUA}
        >
          {kolom.is_aktif ? "Nonaktifkan" : "Aktifkan"}
        </button>
      </div>
      {kolom.nama_ganda ? (
        <p className="text-xs font-medium text-amber-300">
          Nama ini juga dipakai kolom lain. Ganti salah satunya supaya impor
          Excel tidak tertukar.
        </p>
      ) : null}
    </li>
  );
}
