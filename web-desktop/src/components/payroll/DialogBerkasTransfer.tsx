"use client";

import { useEffect, useRef, useState } from "react";
import { hariIniWib, INPUT, LABEL } from "@/components/inventory/gaya";
import { Modal } from "@/components/ui/Modal";
import { PilihCari } from "@/components/ui/PilihCari";
import { saveFileWithPicker } from "@/lib/client/download";
import { berkasTransfer } from "@/lib/client/transfer-excel";
import {
  muatPengaturanTransfer,
  pratinjauTransfer,
  unduhTransfer,
} from "@/lib/gateways/payroll";
import {
  type HasilBerkasTransfer,
  LABEL_JENIS_TRANSFER,
  LABEL_TANDA_TRANSFER,
  type PengaturanTransfer,
  type PilihanTransfer,
  selFormat,
  type TandaTransfer,
} from "@/lib/validations/transfer";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const TOMBOL =
  "min-h-10 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50";
const TOMBOL_UTAMA =
  "min-h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50";
const PERINGATAN =
  "rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100";
const PRATINJAU_BARIS = 5;

function pesanGalat(error: unknown) {
  return error instanceof Error ? error.message : "Permintaan gagal.";
}

/**
 * Berkas transfer gaji ke bank (§26.5 nomor 1). Pratinjau tanpa jejak; unduh
 * mencatat `TRANSFER_EXPORT` di cloud lalu menyusun berkas di perangkat.
 * Status run tidak berubah.
 */
export function DialogBerkasTransfer({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const [atur, setAtur] = useState<PengaturanTransfer | null>(null);
  const [idRekening, setIdRekening] = useState("");
  const [idFormat, setIdFormat] = useState("");
  const [tanggal, setTanggal] = useState(hariIniWib);
  const [hasil, setHasil] = useState<HasilBerkasTransfer | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [proses, setProses] = useState<"pratinjau" | "unduh" | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    let batal = false;
    void muatPengaturanTransfer()
      .then((a) => {
        if (batal) return;
        setAtur(a);
        const aktif = a.rekening.filter((r) => r.is_aktif === 1);
        if (aktif.length === 1) setIdRekening(aktif[0].id_rekening);
      })
      .catch((error) => {
        if (!batal) setGalat(pesanGalat(error));
      });
    return () => {
      batal = true;
    };
  }, []);

  const pilihan = (): PilihanTransfer => ({
    run_id: runId,
    id_rekening: idRekening,
    id_format: idFormat || null,
    tanggal_efektif: tanggal || null,
  });

  const jalankan = async (
    jenis: "pratinjau" | "unduh",
    kerja: () => Promise<void>,
  ) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setProses(jenis);
    setGalat(null);
    setKabar(null);
    try {
      await kerja();
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setProses(null);
    }
  };

  const pratinjau = () =>
    jalankan("pratinjau", async () => {
      setHasil(await pratinjauTransfer(pilihan()));
    });

  const unduh = () =>
    jalankan("unduh", async () => {
      const h = await unduhTransfer(pilihan());
      setHasil(h);
      const berkas = berkasTransfer(h);
      const simpan = await saveFileWithPicker(berkas.blob, berkas.nama, {
        description: berkas.nama,
        accept: { [berkas.mime]: [`.${berkas.nama.split(".").pop()}`] },
      });
      if (simpan.sukses) setKabar(`${berkas.nama} disimpan.`);
      else if (simpan.cancelled)
        setKabar("Penyimpanan dibatalkan; unduhan tetap tercatat.");
    });

  const rekening = atur?.rekening.filter((r) => r.is_aktif === 1) ?? [];
  const format = atur?.format.filter((f) => f.is_aktif === 1) ?? [];
  const siap = idRekening !== "" && proses === null;

  return (
    <Modal
      title="Berkas transfer gaji"
      titleId="modal-berkas-transfer"
      onClose={onClose}
      maxWidth="max-w-4xl"
      hideFooter
    >
      <div className="space-y-4 text-sm">
        <p className="text-slate-400">
          Berkas diunggah sendiri ke internet banking. Tandai proses gaji
          Dibayar setelah transfer di bank berhasil.
        </p>
        {!atur && !galat ? <p className="text-slate-400">Memuat…</p> : null}
        {atur && rekening.length === 0 ? (
          <p className={PERINGATAN}>
            Belum ada rekening debet aktif. Superadmin menambahkannya di
            Pengaturan, tab Gaji & Pajak.
          </p>
        ) : null}
        {atur ? (
          <form
            data-tanpa-konfirmasi
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void pratinjau();
            }}
          >
            <div>
              <label className={LABEL} htmlFor="transfer-rekening">
                Rekening debet
              </label>
              <PilihCari
                id="transfer-rekening"
                required
                value={idRekening}
                onChange={(e) => {
                  setIdRekening(e.target.value);
                  setHasil(null);
                }}
                className={INPUT}
              >
                <option value="">Pilih rekening</option>
                {rekening.map((r) => (
                  <option key={r.id_rekening} value={r.id_rekening}>
                    {`${r.nama_bank} ${r.no_rekening} a.n. ${r.nama_rekening}`}
                  </option>
                ))}
              </PilihCari>
            </div>
            <div>
              <label className={LABEL} htmlFor="transfer-format">
                Format berkas
              </label>
              <select
                id="transfer-format"
                value={idFormat}
                onChange={(e) => {
                  setIdFormat(e.target.value);
                  setHasil(null);
                }}
                className={INPUT}
              >
                <option value="">Excel umum</option>
                {format.map((f) => (
                  <option key={f.id_format} value={f.id_format}>
                    {`${f.nama} (${f.jenis.toUpperCase()})`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="transfer-tanggal">
                Tanggal efektif
              </label>
              <input
                id="transfer-tanggal"
                type="date"
                value={tanggal}
                onChange={(e) => {
                  setTanggal(e.target.value);
                  setHasil(null);
                }}
                className={INPUT}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-3">
              <button type="submit" className={TOMBOL} disabled={!siap}>
                {proses === "pratinjau" ? "Memuat…" : "Pratinjau"}
              </button>
              <button
                type="button"
                className={TOMBOL_UTAMA}
                disabled={!siap || !hasil}
                onClick={() => void unduh()}
              >
                {proses === "unduh" ? "Menyiapkan…" : "Unduh berkas"}
              </button>
            </div>
          </form>
        ) : null}
        {galat ? (
          <p className="text-rose-300" role="alert">
            {galat}
          </p>
        ) : null}
        {kabar ? (
          <output className="block text-emerald-300">{kabar}</output>
        ) : null}
        {hasil ? <Pratinjau hasil={hasil} /> : null}
      </div>
    </Modal>
  );
}

function Pratinjau({ hasil }: { hasil: HasilBerkasTransfer }) {
  const s = hasil.susunan;
  const r = s.ringkasan;
  const hitung = new Map<TandaTransfer, number>();
  for (const b of [...s.baris, ...s.manual, ...s.luar_cakupan]) {
    for (const t of b.tanda) hitung.set(t, (hitung.get(t) ?? 0) + 1);
  }
  const kolom = hasil.format?.kolom ?? null;
  const sel = kolom ? selFormat(s, { kolom }) : null;
  const terakhir = hasil.riwayat[0];

  return (
    <section aria-label="Pratinjau berkas" className="space-y-3">
      {hasil.run.status === "PAID" ? (
        <p className={PERINGATAN}>
          Proses gaji ini sudah ditandai Dibayar. Pastikan transfer belum
          dilakukan sebelum mengunggah berkas lagi.
        </p>
      ) : null}
      {terakhir ? (
        <p className={PERINGATAN}>
          Berkas proses gaji ini sudah diunduh {hasil.riwayat.length} kali,
          terakhir {terakhir.created_at} oleh {terakhir.performed_by}.
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-400">Masuk berkas</dt>
          <dd className="font-semibold text-white">
            {r.jumlah_baris} baris · {IDR.format(r.total)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">
            {LABEL_JENIS_TRANSFER.sesama} / {LABEL_JENIS_TRANSFER.antarbank}
          </dt>
          <dd className="font-semibold text-white">
            {r.per_jenis.sesama.jumlah} / {r.per_jenis.antarbank.jumlah}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Perlu dibayar manual</dt>
          <dd className="font-semibold text-white">
            {r.jumlah_manual} · {IDR.format(r.total_manual)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Total gaji bersih</dt>
          <dd className="font-semibold text-white">
            {IDR.format(r.total_run)}
          </dd>
        </div>
      </dl>
      {r.jumlah_luar_cakupan > 0 ? (
        <p className="text-slate-400">
          {r.jumlah_luar_cakupan} baris ({IDR.format(r.total_luar_cakupan)}) di
          luar cakupan format ini; unduh dengan format lain untuk membayarnya.
        </p>
      ) : null}
      {hasil.format && r.jumlah_manual > 0 ? (
        <p className="text-slate-400">
          Baris yang perlu dibayar manual tidak masuk berkas format ini. Pilih
          Excel umum untuk mendapat daftarnya.
        </p>
      ) : null}
      {hitung.size > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {[...hitung].map(([t, jumlah]) => (
            <li
              key={t}
              className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100"
            >
              {LABEL_TANDA_TRANSFER[t]}: {jumlah}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-xs">
          <caption className="sr-only">
            {PRATINJAU_BARIS} baris pertama berkas
          </caption>
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              {(
                sel?.judul ?? ["No", "Nama", "Bank", "Rekening", "Nominal"]
              ).map((j, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: judul kolom format boleh sama
                <th key={i} className="px-2 py-2">
                  {j}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {s.baris.slice(0, PRATINJAU_BARIS).map((b, i) => (
              <tr key={b.id_karyawan}>
                {sel
                  ? sel.baris[i].map((v, k) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: kolom berurutan tetap
                      <td key={k} className="px-2 py-1.5">
                        {String(v)}
                      </td>
                    ))
                  : [
                      b.nomor_urut,
                      b.nama_karyawan,
                      b.nama_bank,
                      b.no_rekening,
                      IDR.format(b.nominal),
                    ].map((v, k) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: kolom berurutan tetap
                      <td key={k} className="px-2 py-1.5">
                        {v}
                      </td>
                    ))}
              </tr>
            ))}
            {s.baris.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-slate-400" colSpan={99}>
                  Tidak ada baris yang masuk berkas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
