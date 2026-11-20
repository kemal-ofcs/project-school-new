"use client";

import { useRef, useState } from "react";
import {
  jalankanBerurutan,
  ringkasHasil,
} from "@/components/operational/aturanPilihPersonil";
import { Modal } from "@/components/ui/Modal";
import { hasPermission } from "@/lib/auth/access";
import { readWorkbookTable, saveWorkbook } from "@/lib/client/xlsx";
import { useAuth } from "@/lib/context/AuthContext";
import {
  muatProfilPegawai,
  simpanDataKeuangan,
  simpanDataPribadi,
} from "@/lib/gateways/hris";
import type { PegawaiKepegawaian } from "@/lib/validations/hris";
import {
  type BarisDataDiri,
  gabungIsian,
  KEUANGAN_KOSONG,
  KOLOM_KEUANGAN,
  KOLOM_PRIBADI,
  PRIBADI_KOSONG,
  uraiDataDiri,
} from "@/lib/validations/impor-data-diri";
import { LABEL, PERINGATAN, pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";

/**
 * Impor data diri (tab Pribadi dan Keuangan) banyak pegawai dari Excel. Tiap
 * baris disimpan lewat gateway yang sama dengan formulir, jadi izin dan aturan
 * isian diperiksa server per baris. Sel kosong mempertahankan nilai lama.
 */
export function ImporDataDiri({
  pegawai,
  onClose,
  onSelesai,
}: {
  pegawai: readonly PegawaiKepegawaian[];
  onClose: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const { user } = useAuth();
  const izin = {
    pribadi: hasPermission(user, "hr.personal.manage"),
    keuangan: hasPermission(user, "hr.finance.manage"),
  };
  const [baris, setBaris] = useState<BarisDataDiri[]>([]);
  const [catatan, setCatatan] = useState<string[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [progres, setProgres] = useState<number | null>(null);
  const isSubmittingRef = useRef(false);

  const siap = baris.filter((b) => !b.galat);

  const unduhTemplate = async () => {
    setGalat(null);
    const headers = [
      "id_unik",
      "kode_karyawan",
      "nama",
      ...(izin.pribadi ? KOLOM_PRIBADI : []),
      ...(izin.keuangan ? KOLOM_KEUANGAN : []),
    ];
    try {
      await saveWorkbook({
        headers,
        rows: pegawai.map((p) => ({
          id_unik: p.id_unik,
          kode_karyawan: p.kode_karyawan,
          nama: p.nama,
        })),
        filename: "template-data-diri-pegawai.xlsx",
        sheetName: "Data Diri",
      });
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  };

  const pilihBerkas = async (berkas: File | undefined) => {
    setGalat(null);
    setBaris([]);
    setCatatan([]);
    if (!berkas) return;
    try {
      const hasil = uraiDataDiri(
        await readWorkbookTable(berkas),
        pegawai,
        izin,
      );
      setBaris(hasil.baris);
      setCatatan(hasil.catatan);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  };

  const simpanSatu = async (b: BarisDataDiri) => {
    const profil = await muatProfilPegawai(b.id_karyawan);
    // `undefined` = kelompok tidak boleh dibaca. Tanpa nilai lama, sel kosong
    // akan menghapus isian yang ada, jadi baris ini ditolak.
    if (
      (b.pribadi && profil.pribadi === undefined) ||
      (b.keuangan && profil.keuangan === undefined)
    ) {
      throw new Error("Data lama tidak bisa dibaca dengan izin Anda.");
    }
    if (b.pribadi) {
      await simpanDataPribadi({
        id_karyawan: b.id_karyawan,
        ...gabungIsian(PRIBADI_KOSONG, profil.pribadi ?? null, b.pribadi),
      });
    }
    if (b.keuangan) {
      await simpanDataKeuangan({
        id_karyawan: b.id_karyawan,
        ...gabungIsian(KEUANGAN_KOSONG, profil.keuangan ?? null, b.keuangan),
      });
    }
    return { sukses: true, pesan: "" };
  };

  const impor = async () => {
    if (isSubmittingRef.current || siap.length === 0) return;
    isSubmittingRef.current = true;
    setGalat(null);
    setProgres(0);
    try {
      const perId = new Map(siap.map((b) => [b.id_karyawan, b]));
      const hasil = await jalankanBerurutan(
        [...perId.keys()],
        (id) => simpanSatu(perId.get(id) as BarisDataDiri),
        setProgres,
      );
      const ringkas = `Impor data diri: ${ringkasHasil(hasil, (id) => perId.get(id)?.nama || id)}`;
      if (hasil.gagal.length === 0) {
        onSelesai(ringkas);
        return;
      }
      // Sisakan yang gagal di pratinjau supaya bisa diperbaiki di berkas.
      const gagal = new Map(hasil.gagal.map((g) => [g.id, g.pesan]));
      setBaris(
        siap
          .filter((b) => gagal.has(b.id_karyawan))
          .map((b) => ({ ...b, galat: gagal.get(b.id_karyawan) ?? null })),
      );
      setGalat(ringkas);
    } finally {
      isSubmittingRef.current = false;
      setProgres(null);
    }
  };

  return (
    <Modal
      title="Impor data diri pegawai"
      subtitle="Isian tab Pribadi dan Keuangan dari Excel"
      maxWidth="max-w-3xl"
      onClose={progres === null ? onClose : () => undefined}
    >
      <div className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-slate-300">
          <li>
            Unduh template. Isinya semua pegawai; isi hanya kolom yang ingin
            diubah.
          </li>
          <li>
            Sel kosong tidak mengubah apa pun. Untuk menghapus satu isian, pakai
            formulir di rincian pegawai.
          </li>
          <li>
            NIK, nomor KK, rekening, NPWP, BPJS, dan HP harus berformat Teks:
            ketik dengan awalan tanda kutip ('), misalnya '3201234567890123.
          </li>
        </ol>

        <div className="flex flex-wrap items-end gap-3">
          <button type="button" className={TOMBOL} onClick={unduhTemplate}>
            Unduh template
          </button>
          <div>
            <label htmlFor="impor-data-diri-berkas" className={LABEL}>
              Berkas Excel (.xlsx atau .csv)
            </label>
            <input
              id="impor-data-diri-berkas"
              type="file"
              accept=".xlsx,.csv"
              disabled={progres !== null}
              onChange={(e) => void pilihBerkas(e.target.files?.[0])}
              className="block text-sm text-slate-300"
            />
          </div>
        </div>

        {catatan.map((c) => (
          <p key={c} className={PERINGATAN}>
            {c}
          </p>
        ))}
        {galat ? (
          <p role="alert" className="text-rose-300">
            {galat}
          </p>
        ) : null}

        {baris.length > 0 ? (
          <>
            <p className="text-slate-400">
              {siap.length} siap diimpor, {baris.length - siap.length}{" "}
              bermasalah.
            </p>
            <div className="max-h-80 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    <th className="px-3 py-2">Pegawai</th>
                    <th className="px-3 py-2">Isian</th>
                    <th className="px-3 py-2">Keadaan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {baris.map((b) => (
                    <tr key={b.baris}>
                      <td className="px-3 py-2 text-slate-400">{b.baris}</td>
                      <td className="px-3 py-2 text-white">
                        {b.nama || b.id_karyawan}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {[
                          b.pribadi
                            ? `Pribadi ${Object.keys(b.pribadi).length}`
                            : "",
                          b.keuangan
                            ? `Keuangan ${Object.keys(b.keuangan).length}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "-"}
                      </td>
                      <td
                        className={`px-3 py-2 ${b.galat ? "text-rose-300" : "text-emerald-300"}`}
                      >
                        {b.galat ?? "Siap"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={TOMBOL}
            onClick={onClose}
            disabled={progres !== null}
          >
            Tutup
          </button>
          <button
            type="button"
            data-konfirmasi
            className={TOMBOL_UTAMA}
            onClick={() => void impor()}
            disabled={progres !== null || siap.length === 0}
          >
            {progres !== null
              ? `Menyimpan ${progres}/${siap.length}...`
              : `Impor ${siap.length} pegawai`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
