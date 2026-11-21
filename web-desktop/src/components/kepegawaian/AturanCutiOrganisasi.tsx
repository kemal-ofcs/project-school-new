"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type AturanCuti,
  muatSaldoCuti,
  simpanAturanCuti,
} from "@/lib/gateways/hr-pengajuan";
import {
  BATAS_CUTI,
  KELOMPOK_CUTI,
  type KelompokCuti,
} from "@/lib/validations/hr-pengajuan";
import { INPUT, LABEL, pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";

const NAMA_KELOMPOK: Record<KelompokCuti, string> = {
  guru: "Guru",
  tendik: "Tendik",
};

type Kelompok = Record<KelompokCuti, AturanCuti>;
/** Jabatan beraturan sendiri; jabatan yang tidak ada di sini ikut Guru/Tendik. */
type PerJabatan = Record<string, AturanCuti>;

/** Isian satu aturan cuti; dipakai Guru, Tendik, dan setiap jabatan. */
function IsianAturan({
  id,
  aturan,
  ubah,
}: {
  id: string;
  aturan: AturanCuti;
  ubah: (sebagian: Partial<AturanCuti>) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor={`${id}-periode`} className={LABEL}>
          Periode jatah
        </label>
        <select
          id={`${id}-periode`}
          value={aturan.periode}
          onChange={(e) => ubah({ periode: e.target.value })}
          className={INPUT}
        >
          <option value="tahunan">Tahunan (mulai bulan tertentu)</option>
          <option value="ulang_tahun_kerja">Ulang tahun kerja dari TMT</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-sisa`} className={LABEL}>
          Sisa akhir periode
        </label>
        <select
          id={`${id}-sisa`}
          value={aturan.sisa}
          onChange={(e) => ubah({ sisa: e.target.value })}
          className={INPUT}
        >
          <option value="hangus">Hangus</option>
          <option value="dibawa">Dibawa ke periode berikutnya</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {BATAS_CUTI.map(([isian, label, min, maks]) =>
          isian === "bulan_awal" &&
          aturan.periode !== "tahunan" ? null : (isian === "bawa_maks" ||
              isian === "bawa_bulan") &&
            aturan.sisa !== "dibawa" ? null : (
            <div key={isian}>
              <label htmlFor={`${id}-${isian}`} className={LABEL}>
                {label}
              </label>
              <input
                id={`${id}-${isian}`}
                type="number"
                required
                min={min}
                max={maks}
                inputMode="numeric"
                value={aturan[isian]}
                onChange={(e) => ubah({ [isian]: Number(e.target.value) })}
                className={INPUT}
              />
            </div>
          ),
        )}
      </div>
    </>
  );
}

/**
 * Aturan jatah cuti per kelompok (§20.2.4) dan per jabatan (2026-11-21) di tab
 * Organisasi, `hr.org.manage`. Disimpan di `setting_gex_system` lewat outbox
 * `setting`; sisa jatah dihitung ulang untuk semua periode begitu aturannya
 * berubah. Aturan jabatan menimpa aturan Guru/Tendik pegawai berjabatan itu.
 */
export function AturanCutiOrganisasi({
  bolehUbah,
  jabatan,
  onBerhasil,
  onGalat,
}: {
  bolehUbah: boolean;
  jabatan: readonly { id_jabatan: string; nama: string; is_aktif: number }[];
  onBerhasil: (pesan: string) => Promise<void>;
  onGalat: (pesan: string) => void;
}) {
  const [aturan, setAturan] = useState<Kelompok | null>(null);
  const [awal, setAwal] = useState<Kelompok | null>(null);
  const [perJabatan, setPerJabatan] = useState<PerJabatan>({});
  const [jabatanAwal, setJabatanAwal] = useState<PerJabatan>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);
  const onGalatRef = useRef(onGalat);
  onGalatRef.current = onGalat;

  // Lewat ref supaya efek muat sekali tidak bergantung pada fungsi yang
  // dibuat ulang setiap render.
  const terimaRef = useRef((hasil: Kelompok & { jabatan?: PerJabatan }) => {
    const kelompok = { guru: hasil.guru, tendik: hasil.tendik };
    setAturan(kelompok);
    setAwal(kelompok);
    setPerJabatan(hasil.jabatan ?? {});
    setJabatanAwal(hasil.jabatan ?? {});
  });
  const terima = terimaRef.current;

  useEffect(() => {
    muatSaldoCuti(null)
      .then((hasil) => terimaRef.current(hasil.aturan))
      .catch((error: unknown) => onGalatRef.current(pesanGalat(error)));
  }, []);

  if (!aturan || !awal) {
    return <p className="text-sm text-slate-400">Memuat aturan cuti…</p>;
  }

  const ubah = (k: KelompokCuti, sebagian: Partial<AturanCuti>) =>
    setAturan((lama) =>
      lama ? { ...lama, [k]: { ...lama[k], ...sebagian } } : lama,
    );
  const aturJabatan = (id: string, isi: AturanCuti | null) =>
    setPerJabatan((lama) => {
      const baru = { ...lama };
      if (isi) baru[id] = isi;
      else delete baru[id];
      return baru;
    });

  const gantiPeriode = KELOMPOK_CUTI.some(
    (k) =>
      aturan[k].periode !== awal[k].periode ||
      aturan[k].bulan_awal !== awal[k].bulan_awal,
  );
  // Jabatan nonaktif tetap tampil bila masih beraturan sendiri.
  const daftarJabatan = jabatan.filter(
    (j) => j.is_aktif === 1 || perJabatan[j.id_jabatan],
  );

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      // Hanya yang beraturan sendiri, ditambah `null` untuk yang baru
      // dikembalikan ke Guru/Tendik; jabatan lain tidak ditulis.
      const kirimJabatan: Record<string, AturanCuti | null> = {
        ...Object.fromEntries(Object.keys(jabatanAwal).map((id) => [id, null])),
        ...perJabatan,
      };
      terima(await simpanAturanCuti({ ...aturan, jabatan: kirimJabatan }));
      await onBerhasil("Aturan cuti tersimpan.");
    } catch (error) {
      onGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <section aria-labelledby="judul-aturan-cuti" className="space-y-3">
      <h2 id="judul-aturan-cuti" className="text-base font-semibold text-white">
        Aturan cuti
      </h2>
      <p className="text-sm text-slate-400">
        Guru = personil yang punya data guru; selain itu tendik. Jabatan yang
        diberi aturan sendiri menimpa aturan Guru/Tendik untuk pegawai
        berjabatan itu. Jatah dihitung dari TMT, tidak disimpan, jadi perubahan
        di sini berlaku untuk semua periode termasuk yang sudah lewat.
      </p>
      <form className="space-y-4" onSubmit={(e) => void kirim(e)}>
        <div className="grid gap-4 md:grid-cols-2">
          {KELOMPOK_CUTI.map((k) => (
            <fieldset
              key={k}
              disabled={!bolehUbah}
              className="space-y-3 rounded-xl border border-white/10 p-3"
            >
              <legend className="px-1 text-sm font-semibold text-white">
                {NAMA_KELOMPOK[k]}
              </legend>
              <IsianAturan
                id={`cuti-${k}`}
                aturan={aturan[k]}
                ubah={(s) => ubah(k, s)}
              />
            </fieldset>
          ))}
        </div>

        <fieldset disabled={!bolehUbah} className="space-y-3">
          <legend className="text-sm font-semibold text-white">
            Per jabatan
          </legend>
          {Object.keys(perJabatan).length > 0 ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() => setPerJabatan({})}
            >
              Semua jabatan ikut Guru/Tendik
            </button>
          ) : null}
          {daftarJabatan.length === 0 ? (
            <p className="text-sm text-slate-400">
              Belum ada jabatan. Tambahkan di bagian Jabatan.
            </p>
          ) : null}
          <ul className="space-y-2">
            {daftarJabatan.map((j) => {
              const isi = perJabatan[j.id_jabatan];
              const idIsian = `cuti-jab-${j.id_jabatan}`;
              return (
                <li
                  key={j.id_jabatan}
                  className="space-y-3 rounded-xl border border-white/10 bg-slate-900 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor={idIsian}
                      className="font-semibold text-white"
                    >
                      {j.nama}
                      {j.is_aktif === 1 ? "" : " (nonaktif)"}
                    </label>
                    <select
                      id={idIsian}
                      value={isi ? "sendiri" : "kelompok"}
                      onChange={(e) =>
                        aturJabatan(
                          j.id_jabatan,
                          e.target.value === "sendiri"
                            ? { ...aturan.tendik }
                            : null,
                        )
                      }
                      className={`${INPUT} w-auto`}
                    >
                      <option value="kelompok">Ikut aturan Guru/Tendik</option>
                      <option value="sendiri">Aturan sendiri</option>
                    </select>
                  </div>
                  {isi ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {KELOMPOK_CUTI.map((k) => (
                          <button
                            key={k}
                            type="button"
                            className={TOMBOL}
                            onClick={() =>
                              aturJabatan(j.id_jabatan, { ...aturan[k] })
                            }
                          >
                            Salin dari {NAMA_KELOMPOK[k]}
                          </button>
                        ))}
                      </div>
                      <IsianAturan
                        id={idIsian}
                        aturan={isi}
                        ubah={(s) =>
                          aturJabatan(j.id_jabatan, { ...isi, ...s })
                        }
                      />
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </fieldset>

        {gantiPeriode ? (
          <output className="block text-sm text-amber-200">
            Periode jatah berubah: sisa cuti semua pegawai di kelompok itu akan
            dihitung ulang dengan periode baru.
          </output>
        ) : null}
        {bolehUbah ? (
          <div className="flex justify-end">
            <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
              Simpan aturan cuti
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
