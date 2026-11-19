"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import { muatJenisReimburse, simpanJenisReimburse } from "@/lib/gateways/hris";
import {
  type JenisReimburse,
  MAKS_NAMA_JENIS_REIMBURSE,
  MAKS_NOMINAL_REIMBURSE,
} from "@/lib/validations/hr-reimburse";
import { INPUT, LABEL, pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** Kategori reimbursement (§26.5 nomor 5), disunting `hr.reimburse.config`. */
export function JenisReimburseOrganisasi({
  bolehUbah,
  onPesan,
}: {
  bolehUbah: boolean;
  onPesan: (pesan: string) => void;
}) {
  const [jenis, setJenis] = useState<JenisReimburse[] | null>(null);
  const [sunting, setSunting] = useState<JenisReimburse | "baru" | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      setJenis((await muatJenisReimburse()).jenis);
      setGalat(null);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  return (
    <section aria-labelledby="judul-jenis-reimburse" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="judul-jenis-reimburse"
          className="text-base font-semibold text-white"
        >
          Jenis reimbursement
        </h2>
        {bolehUbah ? (
          <button
            type="button"
            className={TOMBOL_UTAMA}
            onClick={() => setSunting("baru")}
          >
            Tambah jenis
          </button>
        ) : null}
      </div>
      {galat ? (
        <p className="text-sm text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}
      {!jenis && !galat ? (
        <p className="text-sm text-slate-400">Memuat…</p>
      ) : null}
      <ul className="space-y-2">
        {(jenis ?? []).map((j) => (
          <li
            key={j.id_jenis}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
          >
            <span>
              <span className="font-semibold text-white">{j.nama}</span>
              <span className="text-slate-400">
                {j.wajib_nota ? " · wajib nota" : ""}
                {j.batas_bulanan !== null
                  ? ` · batas ${IDR.format(j.batas_bulanan)}/bulan`
                  : ""}
                {j.is_aktif ? "" : " · nonaktif"}
              </span>
            </span>
            {bolehUbah ? (
              <button
                type="button"
                className={TOMBOL}
                onClick={() => setSunting(j)}
              >
                Ubah
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {sunting ? (
        <ModalJenis
          awal={sunting === "baru" ? null : sunting}
          onClose={() => setSunting(null)}
          onTersimpan={async (nama) => {
            setSunting(null);
            onPesan(`Jenis reimbursement "${nama}" disimpan.`);
            await muat();
          }}
        />
      ) : null}
    </section>
  );
}

function ModalJenis({
  awal,
  onClose,
  onTersimpan,
}: {
  awal: JenisReimburse | null;
  onClose: () => void;
  onTersimpan: (nama: string) => Promise<void>;
}) {
  const [nama, setNama] = useState(awal?.nama ?? "");
  const [wajibNota, setWajibNota] = useState(awal?.wajib_nota ?? false);
  const [batas, setBatas] = useState(
    awal?.batas_bulanan != null ? String(awal.batas_bulanan) : "",
  );
  const [aktif, setAktif] = useState(awal?.is_aktif ?? true);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    try {
      await simpanJenisReimburse({
        id_jenis: awal?.id_jenis ?? "",
        nama,
        wajib_nota: wajibNota,
        batas_bulanan: batas === "" ? null : Number(batas),
        is_aktif: aktif,
      });
      await onTersimpan(nama.trim());
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <Modal
      title={awal ? "Ubah jenis reimbursement" : "Tambah jenis reimbursement"}
      onClose={onClose}
      hideFooter
    >
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label className={LABEL} htmlFor="jenis-rmb-nama">
            Nama jenis
          </label>
          <input
            id="jenis-rmb-nama"
            required
            maxLength={MAKS_NAMA_JENIS_REIMBURSE}
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="jenis-rmb-batas">
            Batas per pegawai per bulan (Rp, opsional)
          </label>
          <input
            id="jenis-rmb-batas"
            type="number"
            min={1}
            max={MAKS_NOMINAL_REIMBURSE}
            step={1}
            aria-describedby="jenis-rmb-batas-ket"
            value={batas}
            onChange={(e) => setBatas(e.target.value)}
            className={INPUT}
          />
          <p id="jenis-rmb-batas-ket" className="mt-1 text-xs text-slate-400">
            Klaim di atas batas tetap bisa diajukan dan hanya ditandai.
          </p>
        </div>
        <label
          htmlFor="jenis-rmb-nota"
          className="flex items-center gap-2 text-sm text-slate-200"
        >
          <input
            id="jenis-rmb-nota"
            type="checkbox"
            className="size-4"
            checked={wajibNota}
            onChange={(e) => setWajibNota(e.target.checked)}
          />
          Wajib nota (tanpa nota hanya ditandai)
        </label>
        <label
          htmlFor="jenis-rmb-aktif"
          className="flex items-center gap-2 text-sm text-slate-200"
        >
          <input
            id="jenis-rmb-aktif"
            type="checkbox"
            className="size-4"
            checked={aktif}
            onChange={(e) => setAktif(e.target.checked)}
          />
          Aktif
        </label>
        {galat ? (
          <p className="text-sm text-rose-300" role="alert">
            {galat}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            {menyimpan ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
