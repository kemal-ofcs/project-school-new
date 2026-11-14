"use client";

import { type FormEvent, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  type BarisJenis,
  type JenisDraft,
  simpanJenisPengajuan,
} from "@/lib/gateways/hr-pengajuan";
import type { OrgKepegawaian } from "@/lib/gateways/hris";
import {
  DAMPAK_GAJI,
  KELOMPOK,
  SATUAN_MAKS,
} from "@/lib/validations/hr-pengajuan";
import { INPUT, LABEL, pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";

const NAMA_PEMUTUS: Record<string, string> = {
  "hr.request.decide": "Kepala Sekolah / Kepala TU",
  "hr.request.decide_major": "Yayasan",
};

function ringkas(j: BarisJenis) {
  const bagian = [
    j.kelompok,
    j.dampak_gaji,
    `diputus ${NAMA_PEMUTUS[j.izin_pemutus] ?? j.izin_pemutus}`,
  ];
  if (j.potong_jatah === 1) bagian.push("memotong jatah cuti");
  if (j.boleh_urgent === 1) bagian.push("boleh urgent");
  if (j.wajib_dokumen === 1) bagian.push("perlu dokumen");
  if (j.maks_hari !== null) {
    bagian.push(`maks ${j.maks_hari} ${j.satuan_maks.toLowerCase()}`);
  }
  return bagian.join(" · ");
}

const draftDari = (j: BarisJenis): JenisDraft => ({
  id_jenis: j.id_jenis,
  nama: j.nama,
  kelompok: j.kelompok as JenisDraft["kelompok"],
  izin_pemutus: j.izin_pemutus as JenisDraft["izin_pemutus"],
  boleh_urgent: j.boleh_urgent === 1,
  potong_jatah: j.potong_jatah === 1,
  dampak_gaji: j.dampak_gaji as JenisDraft["dampak_gaji"],
  maks_hari: j.maks_hari,
  satuan_maks: j.satuan_maks as JenisDraft["satuan_maks"],
  wajib_dokumen: j.wajib_dokumen === 1,
  is_aktif: j.is_aktif === 1,
});

const KOSONG: JenisDraft = {
  nama: "",
  kelompok: "Izin",
  izin_pemutus: "hr.request.decide",
  boleh_urgent: false,
  potong_jatah: false,
  dampak_gaji: "Dibayar",
  maks_hari: null,
  satuan_maks: "Hari Kerja",
  wajib_dokumen: false,
  is_aktif: true,
};

/** Jenis pengajuan cuti/izin (HRIS Fase 2) di tab Organisasi, `hr.org.manage`. */
export function JenisPengajuanOrganisasi({
  org,
  bolehUbah,
  onBerhasil,
  onGalat,
}: {
  org: OrgKepegawaian;
  bolehUbah: boolean;
  onBerhasil: (pesan: string) => Promise<void>;
  onGalat: (pesan: string) => void;
}) {
  const [sunting, setSunting] = useState<JenisDraft | null>(null);
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const simpan = async (draft: JenisDraft, berhasil: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await simpanJenisPengajuan(draft);
      setSunting(null);
      await onBerhasil(berhasil);
    } catch (error) {
      onGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <section aria-labelledby="judul-jenis-pengajuan" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="judul-jenis-pengajuan"
          className="text-base font-semibold text-white"
        >
          Jenis pengajuan cuti dan izin
        </h2>
        {bolehUbah ? (
          <button
            type="button"
            className={TOMBOL_UTAMA}
            onClick={() => setSunting(KOSONG)}
          >
            Tambah jenis pengajuan
          </button>
        ) : null}
      </div>
      <p className="text-sm text-slate-400">
        Pengajuan lama menyimpan salinan jenisnya, jadi mengubah jenis di sini
        hanya berlaku untuk pengajuan berikutnya.
      </p>
      <ul className="space-y-2">
        {org.jenis_pengajuan.map((j) => (
          <li
            key={j.id_jenis}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
          >
            <div>
              <span className="font-semibold text-white">{j.nama}</span>
              {j.is_aktif === 1 ? null : (
                <span className="text-slate-400"> · nonaktif</span>
              )}
              <span className="block text-xs text-slate-400">{ringkas(j)}</span>
            </div>
            {bolehUbah ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() => setSunting(draftDari(j))}
                >
                  Ubah
                </button>
                <button
                  type="button"
                  className={TOMBOL}
                  disabled={menyimpan}
                  onClick={() =>
                    void simpan(
                      { ...draftDari(j), is_aktif: j.is_aktif !== 1 },
                      j.is_aktif === 1
                        ? `"${j.nama}" dinonaktifkan.`
                        : `"${j.nama}" diaktifkan.`,
                    )
                  }
                >
                  {j.is_aktif === 1 ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            ) : null}
          </li>
        ))}
        {org.jenis_pengajuan.length === 0 ? (
          <li className="text-sm text-slate-400">Belum ada jenis pengajuan.</li>
        ) : null}
      </ul>
      {sunting ? (
        <ModalJenisPengajuan
          awal={sunting}
          menyimpan={menyimpan}
          onClose={() => setSunting(null)}
          onSimpan={(draft) =>
            void simpan(draft, `Jenis pengajuan "${draft.nama}" disimpan.`)
          }
        />
      ) : null}
    </section>
  );
}

function ModalJenisPengajuan({
  awal,
  menyimpan,
  onClose,
  onSimpan,
}: {
  awal: JenisDraft;
  menyimpan: boolean;
  onClose: () => void;
  onSimpan: (draft: JenisDraft) => void;
}) {
  const [d, setD] = useState<JenisDraft>(awal);
  const [maks, setMaks] = useState(
    awal.maks_hari === null ? "" : String(awal.maks_hari),
  );
  const ubah = (sebagian: Partial<JenisDraft>) =>
    setD((lama) => ({ ...lama, ...sebagian }));
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan({
      ...d,
      potong_jatah: d.kelompok === "Cuti" && d.potong_jatah,
      maks_hari: maks.trim() === "" ? null : Number(maks),
    });
  };
  return (
    <Modal
      title={awal.id_jenis ? "Ubah jenis pengajuan" : "Tambah jenis pengajuan"}
      onClose={onClose}
      hideFooter
    >
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label htmlFor="jenis-pengajuan-nama" className={LABEL}>
            Nama
          </label>
          <input
            id="jenis-pengajuan-nama"
            required
            minLength={2}
            maxLength={60}
            value={d.nama}
            onChange={(e) => ubah({ nama: e.target.value })}
            className={INPUT}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="jenis-pengajuan-kelompok" className={LABEL}>
              Kelompok
            </label>
            <select
              id="jenis-pengajuan-kelompok"
              value={d.kelompok}
              onChange={(e) =>
                ubah({ kelompok: e.target.value as JenisDraft["kelompok"] })
              }
              className={INPUT}
            >
              {KELOMPOK.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="jenis-pengajuan-pemutus" className={LABEL}>
              Diputus oleh
            </label>
            <select
              id="jenis-pengajuan-pemutus"
              value={d.izin_pemutus}
              onChange={(e) =>
                ubah({
                  izin_pemutus: e.target.value as JenisDraft["izin_pemutus"],
                })
              }
              className={INPUT}
            >
              {Object.entries(NAMA_PEMUTUS).map(([kunci, nama]) => (
                <option key={kunci} value={kunci}>
                  {nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="jenis-pengajuan-gaji" className={LABEL}>
              Dampak ke gaji
            </label>
            <select
              id="jenis-pengajuan-gaji"
              value={d.dampak_gaji}
              onChange={(e) =>
                ubah({
                  dampak_gaji: e.target.value as JenisDraft["dampak_gaji"],
                })
              }
              className={INPUT}
            >
              {DAMPAK_GAJI.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="jenis-pengajuan-maks" className={LABEL}>
                Paling lama
              </label>
              <input
                id="jenis-pengajuan-maks"
                type="number"
                min={1}
                max={366}
                inputMode="numeric"
                placeholder="Tanpa batas"
                value={maks}
                onChange={(e) => setMaks(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="jenis-pengajuan-satuan" className={LABEL}>
                Satuan
              </label>
              <select
                id="jenis-pengajuan-satuan"
                value={d.satuan_maks}
                onChange={(e) =>
                  ubah({
                    satuan_maks: e.target.value as JenisDraft["satuan_maks"],
                  })
                }
                className={INPUT}
              >
                {SATUAN_MAKS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className={LABEL}>Aturan</legend>
          {(
            [
              ["boleh_urgent", "Boleh diajukan urgent (langsung disetujui)"],
              ["potong_jatah", "Memotong jatah cuti tahunan"],
              ["wajib_dokumen", "Perlu dokumen pendukung"],
              ["is_aktif", "Aktif"],
            ] as const
          ).map(([kunci, label]) => {
            const mati = kunci === "potong_jatah" && d.kelompok !== "Cuti";
            return (
              <label
                key={kunci}
                htmlFor={`jenis-pengajuan-${kunci}`}
                className="flex items-center gap-2 text-sm text-slate-200"
              >
                <input
                  id={`jenis-pengajuan-${kunci}`}
                  type="checkbox"
                  checked={d[kunci] && !mati}
                  disabled={mati}
                  onChange={(e) => ubah({ [kunci]: e.target.checked })}
                />
                {label}
                {mati ? (
                  <span className="text-xs text-slate-400">
                    (hanya kelompok Cuti)
                  </span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}
