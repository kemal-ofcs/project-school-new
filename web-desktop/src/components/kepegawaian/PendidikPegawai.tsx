"use client";

import { type FormEvent, useRef, useState } from "react";
import {
  hapusPendidikan,
  hapusSertifikasi,
  type PendidikanBaris,
  type ProfilPegawai,
  type SertifikasiBaris,
  simpanPendidikan,
  simpanSertifikasi,
} from "@/lib/gateways/hris";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { JENJANG } from "@/lib/validations/hris";
import { INPUT, LABEL, pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";

type Sunting =
  | { jenis: "pendidikan"; data: PendidikanBaris | null }
  | { jenis: "sertifikasi"; data: SertifikasiBaris | null };

const angkaAtauNull = (teks: string) =>
  teks.trim() === "" ? null : Number(teks);

/**
 * Riwayat pendidikan dan sertifikat pendidik (cloud-only, Q-31). Linieritas
 * adalah tanda manual (Q-36), tidak dicocokkan otomatis dengan mapel.
 */
export function PendidikPegawai({
  idKaryawan,
  pendidik,
  bolehUbah,
  onBerubah,
}: {
  idKaryawan: string;
  pendidik: NonNullable<ProfilPegawai["pendidik"]>;
  bolehUbah: boolean;
  onBerubah: () => Promise<void>;
}) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const [sunting, setSunting] = useState<Sunting | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const jalankan = async (aksi: () => Promise<unknown>) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    try {
      await aksi();
      setSunting(null);
      await onBerubah();
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const hapus = async (judul: string, aksi: () => Promise<unknown>) => {
    const setuju = await konfirmasi({
      title: `Hapus ${judul}?`,
      description: "Baris ini dihapus permanen dari database.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (setuju) await jalankan(aksi);
  };

  return (
    <div className="space-y-6 text-sm">
      {dialogKonfirmasi}
      {galat ? (
        <p className="text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}

      <section aria-labelledby="judul-pendidikan" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="judul-pendidikan" className="font-semibold text-white">
            Riwayat pendidikan
          </h3>
          {bolehUbah ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() => setSunting({ jenis: "pendidikan", data: null })}
            >
              Tambah pendidikan
            </button>
          ) : null}
        </div>
        <ul className="space-y-2">
          {pendidik.pendidikan.map((p) => (
            <li
              key={p.id_pendidikan}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
            >
              <span>
                <span className="font-semibold text-white">
                  {p.jenjang} {p.prodi}
                </span>
                <span className="text-slate-400">
                  {p.perguruan_tinggi ? ` · ${p.perguruan_tinggi}` : ""}
                  {p.tahun_lulus ? ` · lulus ${p.tahun_lulus}` : ""}
                  {p.linier === 1 ? " · linier" : ""}
                </span>
              </span>
              {bolehUbah ? (
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setSunting({ jenis: "pendidikan", data: p })}
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    className={TOMBOL}
                    disabled={menyimpan}
                    onClick={() =>
                      void hapus(`pendidikan ${p.jenjang}`, () =>
                        hapusPendidikan(p.id_pendidikan),
                      )
                    }
                  >
                    Hapus
                  </button>
                </span>
              ) : null}
            </li>
          ))}
          {pendidik.pendidikan.length === 0 ? (
            <li className="text-slate-400">Belum ada riwayat pendidikan.</li>
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="judul-sertifikasi" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="judul-sertifikasi" className="font-semibold text-white">
            Sertifikat pendidik
          </h3>
          {bolehUbah ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() => setSunting({ jenis: "sertifikasi", data: null })}
            >
              Tambah sertifikat
            </button>
          ) : null}
        </div>
        <ul className="space-y-2">
          {pendidik.sertifikasi.map((s) => (
            <li
              key={s.id_sertifikasi}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
            >
              <span>
                <span className="font-semibold text-white">
                  {s.bidang_studi}
                </span>
                <span className="text-slate-400">
                  {s.tahun ? ` · ${s.tahun}` : ""}
                  {s.nrg ? ` · NRG ${s.nrg}` : ""}
                  {s.nomor_sertifikat ? ` · ${s.nomor_sertifikat}` : ""}
                </span>
              </span>
              {bolehUbah ? (
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() =>
                      setSunting({ jenis: "sertifikasi", data: s })
                    }
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    className={TOMBOL}
                    disabled={menyimpan}
                    onClick={() =>
                      void hapus(`sertifikat ${s.bidang_studi}`, () =>
                        hapusSertifikasi(s.id_sertifikasi),
                      )
                    }
                  >
                    Hapus
                  </button>
                </span>
              ) : null}
            </li>
          ))}
          {pendidik.sertifikasi.length === 0 ? (
            <li className="text-slate-400">Belum ada sertifikat pendidik.</li>
          ) : null}
        </ul>
      </section>

      {sunting?.jenis === "pendidikan" ? (
        <FormPendidikan
          key={sunting.data?.id_pendidikan ?? "baru"}
          awal={sunting.data}
          menyimpan={menyimpan}
          onBatal={() => setSunting(null)}
          onSimpan={(draft) =>
            jalankan(() =>
              simpanPendidikan({
                ...draft,
                id: sunting.data?.id_pendidikan,
                id_karyawan: idKaryawan,
              }),
            )
          }
        />
      ) : null}
      {sunting?.jenis === "sertifikasi" ? (
        <FormSertifikasi
          key={sunting.data?.id_sertifikasi ?? "baru"}
          awal={sunting.data}
          menyimpan={menyimpan}
          onBatal={() => setSunting(null)}
          onSimpan={(draft) =>
            jalankan(() =>
              simpanSertifikasi({
                ...draft,
                id: sunting.data?.id_sertifikasi,
                id_karyawan: idKaryawan,
              }),
            )
          }
        />
      ) : null}
    </div>
  );
}

function FormPendidikan({
  awal,
  menyimpan,
  onBatal,
  onSimpan,
}: {
  awal: PendidikanBaris | null;
  menyimpan: boolean;
  onBatal: () => void;
  onSimpan: (draft: {
    jenjang: string;
    prodi: string;
    perguruan_tinggi: string;
    tahun_lulus: number | null;
    linier: number;
    catatan: string;
  }) => void;
}) {
  const [jenjang, setJenjang] = useState(awal?.jenjang ?? "S1");
  const [prodi, setProdi] = useState(awal?.prodi ?? "");
  const [kampus, setKampus] = useState(awal?.perguruan_tinggi ?? "");
  const [tahun, setTahun] = useState(String(awal?.tahun_lulus ?? ""));
  const [linier, setLinier] = useState(awal?.linier === 1);
  const [catatan, setCatatan] = useState(awal?.catatan ?? "");
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan({
      jenjang,
      prodi,
      perguruan_tinggi: kampus,
      tahun_lulus: angkaAtauNull(tahun),
      linier: linier ? 1 : 0,
      catatan,
    });
  };
  return (
    <form
      onSubmit={kirim}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-sky-500/30 p-3 sm:grid-cols-2"
    >
      <h3 className="font-semibold text-white sm:col-span-2">
        {awal ? "Ubah pendidikan" : "Tambah pendidikan"}
      </h3>
      <div>
        <label htmlFor="pdk-jenjang" className={LABEL}>
          Jenjang
        </label>
        <select
          id="pdk-jenjang"
          value={jenjang}
          onChange={(e) => setJenjang(e.target.value)}
          className={INPUT}
        >
          {JENJANG.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="pdk-tahun" className={LABEL}>
          Tahun lulus
        </label>
        <input
          id="pdk-tahun"
          type="number"
          min={1950}
          max={2100}
          value={tahun}
          onChange={(e) => setTahun(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="pdk-prodi" className={LABEL}>
          Program studi / jurusan
        </label>
        <input
          id="pdk-prodi"
          maxLength={150}
          value={prodi}
          onChange={(e) => setProdi(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="pdk-kampus" className={LABEL}>
          Sekolah / perguruan tinggi
        </label>
        <input
          id="pdk-kampus"
          maxLength={150}
          value={kampus}
          onChange={(e) => setKampus(e.target.value)}
          className={INPUT}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="pdk-catatan" className={LABEL}>
          Catatan
        </label>
        <input
          id="pdk-catatan"
          maxLength={500}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          className={INPUT}
        />
      </div>
      <label className="flex items-center gap-2 text-slate-200 sm:col-span-2">
        <input
          type="checkbox"
          checked={linier}
          onChange={(e) => setLinier(e.target.checked)}
        />
        Linier dengan mapel yang diajar (ditandai manual)
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className={TOMBOL} onClick={onBatal}>
          Batal
        </button>
        <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
          Simpan
        </button>
      </div>
    </form>
  );
}

function FormSertifikasi({
  awal,
  menyimpan,
  onBatal,
  onSimpan,
}: {
  awal: SertifikasiBaris | null;
  menyimpan: boolean;
  onBatal: () => void;
  onSimpan: (draft: {
    nomor_sertifikat: string;
    nrg: string;
    tahun: number | null;
    bidang_studi: string;
    catatan: string;
  }) => void;
}) {
  const [nomor, setNomor] = useState(awal?.nomor_sertifikat ?? "");
  const [nrg, setNrg] = useState(awal?.nrg ?? "");
  const [tahun, setTahun] = useState(String(awal?.tahun ?? ""));
  const [bidang, setBidang] = useState(awal?.bidang_studi ?? "");
  const [catatan, setCatatan] = useState(awal?.catatan ?? "");
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan({
      nomor_sertifikat: nomor,
      nrg,
      tahun: angkaAtauNull(tahun),
      bidang_studi: bidang,
      catatan,
    });
  };
  return (
    <form
      onSubmit={kirim}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-sky-500/30 p-3 sm:grid-cols-2"
    >
      <h3 className="font-semibold text-white sm:col-span-2">
        {awal ? "Ubah sertifikat" : "Tambah sertifikat"}
      </h3>
      <div className="sm:col-span-2">
        <label htmlFor="srt-bidang" className={LABEL}>
          Bidang studi sertifikasi
        </label>
        <input
          id="srt-bidang"
          required
          maxLength={150}
          value={bidang}
          onChange={(e) => setBidang(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="srt-nomor" className={LABEL}>
          Nomor sertifikat
        </label>
        <input
          id="srt-nomor"
          maxLength={80}
          value={nomor}
          onChange={(e) => setNomor(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="srt-nrg" className={LABEL}>
          NRG (12 digit)
        </label>
        <input
          id="srt-nrg"
          inputMode="numeric"
          maxLength={20}
          value={nrg}
          onChange={(e) => setNrg(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="srt-tahun" className={LABEL}>
          Tahun sertifikat
        </label>
        <input
          id="srt-tahun"
          type="number"
          min={1950}
          max={2100}
          value={tahun}
          onChange={(e) => setTahun(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="srt-catatan" className={LABEL}>
          Catatan
        </label>
        <input
          id="srt-catatan"
          maxLength={500}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          className={INPUT}
        />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className={TOMBOL} onClick={onBatal}>
          Batal
        </button>
        <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
          Simpan
        </button>
      </div>
    </form>
  );
}
