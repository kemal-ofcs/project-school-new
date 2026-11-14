"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import {
  muatSaldoCuti,
  type PeriodeCuti,
  type SaldoCuti,
  sesuaikanJatahCuti,
} from "@/lib/gateways/hr-pengajuan";
import {
  JENIS_PENYESUAIAN,
  LABEL_TANDA,
  LABEL_TANDA_CUTI,
} from "@/lib/validations/hr-pengajuan";
import {
  INPUT,
  LABEL,
  PERINGATAN,
  pesanGalat,
  TOMBOL,
  TOMBOL_UTAMA,
} from "./gaya";

type Pegawai = NonNullable<SaldoCuti["pegawai"]>;

const rentang = (p: PeriodeCuti) => `${p.mulai} s.d. ${p.selesai}`;

/**
 * Tab Cuti di rincian pegawai (§20.5 layar 3): jatah per periode, riwayat
 * pengajuan, dan penyesuaian bagi pemegang `hr.leave.adjust`. Saldo tidak
 * disimpan; setiap angka diturunkan backend dari pengajuan dan penyesuaian.
 */
export function CutiPegawai({
  idKaryawan,
  bolehSesuaikan,
}: {
  idKaryawan: string;
  bolehSesuaikan: boolean;
}) {
  const [data, setData] = useState<Pegawai | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [form, setForm] = useState<"baru" | { batal: string } | null>(null);

  const muat = useCallback(async () => {
    try {
      setData((await muatSaldoCuti(idKaryawan)).pegawai);
      setGalat(null);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, [idKaryawan]);

  useEffect(() => {
    void muat();
  }, [muat]);

  if (galat && !data) {
    return (
      <p className="text-sm text-rose-300" role="alert">
        {galat}
      </p>
    );
  }
  if (!data) return <p className="text-sm text-slate-400">Memuat…</p>;

  const periode = [...data.periode].reverse();
  return (
    <div className="space-y-4">
      {pesan ? (
        <output className="block text-sm text-emerald-300">{pesan}</output>
      ) : null}
      {data.tanda.length > 0 ? (
        <ul className={PERINGATAN}>
          {data.tanda.map((t) => (
            <li key={t}>{LABEL_TANDA_CUTI[t] ?? t}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-slate-400">
        Kelompok {data.kelompok}, TMT {data.tmt || "-"}.{" "}
        {data.berjalan
          ? `Sisa periode berjalan: ${data.berjalan.sisa} hari.`
          : "Belum ada periode jatah yang berjalan."}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Jatah cuti per periode</caption>
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th scope="col" className="py-2 pr-2">
                Periode
              </th>
              <th scope="col" className="px-2 text-right">
                Hak
              </th>
              <th scope="col" className="px-2 text-right">
                Dibawa
              </th>
              <th scope="col" className="px-2 text-right">
                Penyesuaian
              </th>
              <th scope="col" className="px-2 text-right">
                Terpakai
              </th>
              <th scope="col" className="pl-2 text-right">
                Sisa
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-200">
            {periode.map((p) => (
              <tr key={p.mulai}>
                <td className="py-2 pr-2">
                  {rentang(p)}
                  {p.sebelum_berhak ? (
                    <span className="block text-xs text-slate-400">
                      sebelum berhak cuti
                    </span>
                  ) : null}
                </td>
                <td className="px-2 text-right">{p.hak}</td>
                <td className="px-2 text-right">
                  {p.bawaan}
                  {p.bawaan > 0 ? (
                    <span className="block text-xs text-slate-400">
                      {p.bawaan_hangus > 0
                        ? `${p.bawaan_hangus} hangus`
                        : `pakai s.d. ${p.bawaan_sampai ?? "-"}`}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 text-right">{p.penyesuaian}</td>
                <td className="px-2 text-right">{p.terpakai}</td>
                <td
                  className={`pl-2 text-right font-semibold ${p.sisa < 0 ? "text-rose-300" : ""}`}
                >
                  {p.sisa}
                </td>
              </tr>
            ))}
            {periode.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-2 text-slate-400">
                  Belum ada periode jatah. Isi TMT pegawai di tab Kerja.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="judul-penyesuaian" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id="judul-penyesuaian"
            className="text-sm font-semibold text-white"
          >
            Penyesuaian
          </h3>
          {bolehSesuaikan && data.periode.length > 0 ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() => setForm("baru")}
            >
              Tambah penyesuaian
            </button>
          ) : null}
        </div>
        <ul className="space-y-2 text-sm">
          {data.penyesuaian
            .filter((r) => r.jenis !== "Pembatalan")
            .map((r) => (
              <li
                key={r.id_penyesuaian}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2"
              >
                <span
                  className={r.dibatalkan ? "text-slate-500 line-through" : ""}
                >
                  {r.jenis} {r.hari > 0 ? `+${r.hari}` : r.hari} hari · periode{" "}
                  {r.periode} · {r.alasan}
                  <span className="block text-xs text-slate-400">
                    {r.dicatat_oleh}, {r.created_at}
                  </span>
                </span>
                {bolehSesuaikan && !r.dibatalkan ? (
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setForm({ batal: r.id_penyesuaian })}
                  >
                    Batalkan
                  </button>
                ) : null}
              </li>
            ))}
          {data.penyesuaian.length === 0 ? (
            <li className="text-slate-400">Belum ada penyesuaian.</li>
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="judul-riwayat-cuti" className="space-y-2">
        <h3
          id="judul-riwayat-cuti"
          className="text-sm font-semibold text-white"
        >
          Riwayat pengajuan
        </h3>
        <ul className="space-y-2 text-sm">
          {data.riwayat.map((p) => (
            <li
              key={p.id_pengajuan}
              className="rounded-xl border border-white/10 px-3 py-2"
            >
              <span className="font-semibold text-white">{p.nama_jenis}</span>{" "}
              <span className="text-slate-300">
                {p.tanggal_mulai === p.tanggal_selesai
                  ? p.tanggal_mulai
                  : `${p.tanggal_mulai} s.d. ${p.tanggal_selesai}`}{" "}
                · {p.status}
              </span>
              {p.tanda.length > 0 ? (
                <span className="block text-xs text-amber-200">
                  {p.tanda.map((t) => LABEL_TANDA[t] ?? t).join(" · ")}
                </span>
              ) : null}
            </li>
          ))}
          {data.riwayat.length === 0 ? (
            <li className="text-slate-400">Belum ada pengajuan.</li>
          ) : null}
        </ul>
      </section>

      {form ? (
        <ModalPenyesuaian
          idKaryawan={idKaryawan}
          periode={data.periode}
          batal={form === "baru" ? null : form.batal}
          onClose={() => setForm(null)}
          onSelesai={async (teks) => {
            setForm(null);
            setPesan(teks);
            await muat();
          }}
        />
      ) : null}
    </div>
  );
}

function ModalPenyesuaian({
  idKaryawan,
  periode,
  batal,
  onClose,
  onSelesai,
}: {
  idKaryawan: string;
  periode: PeriodeCuti[];
  batal: string | null;
  onClose: () => void;
  onSelesai: (pesan: string) => Promise<void>;
}) {
  const [periodeDipilih, setPeriodeDipilih] = useState(
    periode.at(-1)?.mulai ?? "",
  );
  const [jenis, setJenis] = useState<string>(JENIS_PENYESUAIAN[0]);
  const [hari, setHari] = useState("");
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await sesuaikanJatahCuti(
        batal
          ? { batal, alasan }
          : {
              id_karyawan: idKaryawan,
              periode: periodeDipilih,
              jenis,
              hari: Number(hari),
              alasan,
            },
      );
      await onSelesai(
        batal ? "Penyesuaian dibatalkan." : "Penyesuaian jatah tersimpan.",
      );
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <Modal
      title={batal ? "Batalkan penyesuaian" : "Tambah penyesuaian jatah"}
      onClose={onClose}
      hideFooter
    >
      <form className="space-y-4" onSubmit={(e) => void kirim(e)}>
        {galat ? (
          <p className="text-sm text-rose-300" role="alert">
            {galat}
          </p>
        ) : null}
        {batal ? null : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="cuti-periode" className={LABEL}>
                Periode
              </label>
              <select
                id="cuti-periode"
                value={periodeDipilih}
                onChange={(e) => setPeriodeDipilih(e.target.value)}
                className={INPUT}
              >
                {periode.map((p) => (
                  <option key={p.mulai} value={p.mulai}>
                    {rentang(p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cuti-jenis" className={LABEL}>
                Jenis
              </label>
              <select
                id="cuti-jenis"
                value={jenis}
                onChange={(e) => setJenis(e.target.value)}
                className={INPUT}
              >
                {JENIS_PENYESUAIAN.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cuti-hari" className={LABEL}>
                Hari (minus untuk mengurangi)
              </label>
              <input
                id="cuti-hari"
                type="number"
                required
                min={-366}
                max={366}
                inputMode="numeric"
                value={hari}
                onChange={(e) => setHari(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>
        )}
        <div>
          <label htmlFor="cuti-alasan" className={LABEL}>
            Alasan
          </label>
          <textarea
            id="cuti-alasan"
            required
            maxLength={500}
            rows={3}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <p className="text-xs text-slate-400">
          Penyesuaian tidak bisa disunting; koreksi berikutnya dicatat sebagai
          baris baru atau dengan membatalkan yang ini.
        </p>
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
