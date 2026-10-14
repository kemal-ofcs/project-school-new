"use client";

import { useCallback, useEffect, useState } from "react";
import { EksporErapor } from "@/components/nilai/EksporErapor";
import { buatRekapPdf } from "@/components/nilai/rekapPdf";
import { saveFileWithPicker } from "@/lib/client/download";
import { saveWorkbook } from "@/lib/client/xlsx";
import {
  getRekapNilaiAkhir,
  type RekapNilaiAkhir,
} from "@/lib/gateways/grades";

/**
 * Tab Rekap Nilai Akhir (N2a): satu baris per siswa untuk satu rombel ×
 * mapel × semester, dihitung backend saat diminta (tanpa pembekuan). Dipakai
 * apa adanya oleh `/nilai` Web/Desktop dan Mobile (disalin lewat `filesToCopy`).
 */

const KOTAK = "rounded-xl border border-white/10 bg-slate-900/95 p-4";
const TOMBOL_KEDUA =
  "min-h-11 rounded-lg border border-white/15 px-3 py-2 text-white text-sm disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";
const GALAT =
  "rounded-lg border border-rose-500/30 bg-rose-500/20 p-3 text-rose-100 text-sm";

function angka(nilai: number | null): string {
  return nilai === null
    ? "—"
    : nilai.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function tanggalPendek(tanggal: string): string {
  const [, bulan, hari] = tanggal.split("-");
  return hari && bulan ? `${hari}/${bulan}` : tanggal;
}

function catatanBolos(
  bolos: RekapNilaiAkhir["siswa"][number]["kehadiran"]["bolos"],
): string {
  return bolos
    .map((b) => `Bolos: ${b.mapel.join(", ")} (${tanggalPendek(b.tanggal)})`)
    .join("; ");
}

interface PropsRekap {
  idTahunAjaran: string;
  semester: string;
  idRombel: string;
  idMapel: string;
  namaRombel: string;
  namaTahun: string;
}

/** Ekspor e-Rapor (N3) cukup butuh rombel; rekap per mapel di bawahnya. */
export function RekapNilai(props: PropsRekap) {
  return (
    <div className="space-y-4">
      <EksporErapor
        idTahunAjaran={props.idTahunAjaran}
        semester={props.semester}
        idRombel={props.idRombel}
      />
      <RekapIsi {...props} />
    </div>
  );
}

function RekapIsi({
  idTahunAjaran,
  semester,
  idRombel,
  idMapel,
  namaRombel,
  namaTahun,
}: PropsRekap) {
  const [data, setData] = useState<RekapNilaiAkhir | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [cari, setCari] = useState("");
  const [yakinEkspor, setYakinEkspor] = useState<"excel" | "pdf" | null>(null);
  const [kabarEkspor, setKabarEkspor] = useState<string | null>(null);
  const lengkap = Boolean(idTahunAjaran && idRombel && idMapel);

  const muat = useCallback(async () => {
    if (!lengkap) {
      setData(null);
      return;
    }
    setMemuat(true);
    setGalat(null);
    setYakinEkspor(null);
    try {
      setData(
        await getRekapNilaiAkhir(idTahunAjaran, semester, idRombel, idMapel),
      );
    } catch (error) {
      setData(null);
      setGalat(
        error instanceof Error && error.message
          ? error.message
          : "Rekap nilai akhir tidak bisa dihitung.",
      );
    } finally {
      setMemuat(false);
    }
  }, [lengkap, idTahunAjaran, semester, idRombel, idMapel]);

  useEffect(() => {
    void muat();
  }, [muat]);

  async function ekspor(format: "excel" | "pdf", sudahYakin = false) {
    if (!data) return;
    if (data.nilai_kosong > 0 && !sudahYakin) {
      setYakinEkspor(format);
      return;
    }
    setYakinEkspor(null);
    if (format === "pdf") {
      await unduhPdf(data);
      return;
    }
    const headers = [
      "Nama",
      "NIS",
      ...data.jenis.flatMap((j) => [`Rata ${j.nama}`, `Bobot ${j.nama} (%)`]),
      "Kehadiran (%)",
      "Bobot Kehadiran (%)",
      "Hari Efektif",
      "Masuk",
      "Izin/Sakit",
      "Tidak Masuk",
      "Catatan",
      "Nilai Akhir",
    ];
    const rows: Record<string, unknown>[] = data.siswa.map((s) => {
      const baris: Record<string, unknown> = {
        Nama: s.nama_lengkap,
        NIS: s.nis,
        "Kehadiran (%)": s.kehadiran.persen,
        "Bobot Kehadiran (%)": s.kehadiran.bobot_efektif,
        "Hari Efektif": s.kehadiran.hari_efektif,
        Masuk: s.kehadiran.masuk,
        "Izin/Sakit": s.kehadiran.izin_sakit,
        "Tidak Masuk": s.kehadiran.tidak_masuk,
        Catatan: catatanBolos(s.kehadiran.bolos),
        "Nilai Akhir": s.nilai_akhir,
      };
      data.jenis.forEach((j, indeks) => {
        baris[`Rata ${j.nama}`] = s.komponen[indeks]?.rata ?? null;
        baris[`Bobot ${j.nama} (%)`] =
          s.komponen[indeks]?.bobot_efektif ?? null;
      });
      return baris;
    });
    rows.push(
      {},
      {
        Nama: `Dihitung ${data.dicetak} WIB untuk ${data.rentang.mulai} s.d. ${data.rentang.selesai}. Belum dibekukan.`,
      },
    );
    for (const catatan of data.catatan) rows.push({ Nama: catatan });
    try {
      const hasil = await saveWorkbook({
        headers,
        rows,
        filename: `rekap-nilai-${data.nama_mapel}-${semester}.xlsx`.replace(
          /\s+/g,
          "-",
        ),
        sheetName: "Rekap Nilai",
      });
      setKabarEkspor(
        hasil.sukses
          ? "Berkas Excel tersimpan."
          : hasil.cancelled
            ? null
            : "Berkas Excel tidak bisa disimpan.",
      );
    } catch (error) {
      setKabarEkspor(
        error instanceof Error && error.message
          ? error.message
          : "Berkas Excel tidak bisa disimpan.",
      );
    }
  }

  async function unduhPdf(rekap: RekapNilaiAkhir) {
    try {
      const isi = await buatRekapPdf(rekap, {
        namaRombel,
        namaTahun,
        semester,
      });
      const hasil = await saveFileWithPicker(
        new Blob([isi], { type: "application/pdf" }),
        `rekap-nilai-${rekap.nama_mapel}-${namaRombel}-${semester}.pdf`.replace(
          /\s+/g,
          "-",
        ),
        {
          description: "Dokumen PDF (*.pdf)",
          accept: { "application/pdf": [".pdf"] },
        },
      );
      setKabarEkspor(
        hasil.sukses
          ? "Berkas PDF tersimpan."
          : hasil.cancelled
            ? null
            : "Berkas PDF tidak bisa disimpan.",
      );
    } catch (error) {
      setKabarEkspor(
        error instanceof Error && error.message
          ? error.message
          : "Berkas PDF tidak bisa dibuat.",
      );
    }
  }

  if (!lengkap) {
    return (
      <p className={`${KOTAK} text-slate-400 text-sm`}>
        Pilih tahun ajaran, rombel, dan mata pelajaran di saringan atas untuk
        melihat rekap nilai akhir.
      </p>
    );
  }
  if (memuat && !data) {
    return <p className="text-slate-400 text-sm">Menghitung nilai akhir…</p>;
  }
  if (galat) {
    return (
      <div className={`${GALAT} space-y-3`}>
        <p>{galat}</p>
        <button
          className={TOMBOL_KEDUA}
          onClick={() => void muat()}
          type="button"
        >
          Hitung ulang
        </button>
      </div>
    );
  }
  if (!data) return null;

  const kata = cari.trim().toLowerCase();
  const siswa = data.siswa.filter(
    (s) =>
      !kata ||
      s.nama_lengkap.toLowerCase().includes(kata) ||
      s.nis.toLowerCase().includes(kata),
  );

  return (
    <section className={`${KOTAK} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <p className="font-semibold text-white">{data.nama_mapel}</p>
          <p className="text-slate-400">
            Hari efektif {data.rentang.mulai} s.d. {data.rentang.selesai} ·
            dihitung {data.dicetak} WIB, belum dibekukan
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={TOMBOL_KEDUA}
            onClick={() => void muat()}
            type="button"
          >
            Hitung ulang
          </button>
          <button
            className={TOMBOL_KEDUA}
            disabled={data.siswa.length === 0}
            onClick={() => void ekspor("excel")}
            type="button"
          >
            Ekspor Excel
          </button>
          <button
            className={TOMBOL_KEDUA}
            disabled={data.siswa.length === 0}
            onClick={() => void ekspor("pdf")}
            type="button"
          >
            Unduh PDF
          </button>
        </div>
      </div>

      {yakinEkspor ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-amber-100 text-sm" role="alert">
            {data.nilai_kosong} nilai kosong akan dihitung 0 di berkas{" "}
            {yakinEkspor === "pdf" ? "PDF" : "Excel"}.
          </p>
          <button
            className={TOMBOL_KEDUA}
            onClick={() => void ekspor(yakinEkspor, true)}
            type="button"
          >
            Ya, lanjutkan
          </button>
          <button
            className={TOMBOL_KEDUA}
            onClick={() => setYakinEkspor(null)}
            type="button"
          >
            Jangan ekspor
          </button>
        </div>
      ) : null}
      {kabarEkspor ? (
        <p className="text-slate-300 text-sm">{kabarEkspor}</p>
      ) : null}

      {data.catatan.length > 0 || data.nilai_kosong > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-amber-100 text-sm">
          {data.catatan.map((c) => (
            <li key={c}>
              {c}. Bobotnya dibagi ke komponen lain untuk mapel ini.
            </li>
          ))}
          {data.nilai_kosong > 0 ? (
            <li>{data.nilai_kosong} nilai belum diisi dan dihitung 0.</li>
          ) : null}
        </ul>
      ) : null}

      <div>
        <label className="block text-slate-400 text-xs" htmlFor="rekap-cari">
          Cari peserta didik
        </label>
        <input
          className="mt-1 w-full min-h-11 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white sm:max-w-xs"
          id="rekap-cari"
          onChange={(e) => setCari(e.target.value)}
          placeholder="Nama atau NIS"
          type="search"
          value={cari}
        />
      </div>

      {data.siswa.length === 0 ? (
        <p className="text-slate-400 text-sm">
          Rombel ini belum punya siswa aktif.
        </p>
      ) : siswa.length === 0 ? (
        <p className="text-slate-400 text-sm">
          Tidak ada peserta didik yang cocok dengan "{cari.trim()}".
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-slate-400 text-xs">
              <tr>
                <th className="py-2 pr-3">Nama</th>
                {data.jenis.map((j) => (
                  <th className="py-2 pr-3 text-right" key={j.id_jenis}>
                    {j.nama}
                    <span className="block font-normal">bobot {j.bobot}%</span>
                  </th>
                ))}
                <th className="py-2 pr-3 text-right">
                  Kehadiran
                  <span className="block font-normal">
                    bobot {data.bobot_kehadiran}%
                  </span>
                </th>
                <th className="py-2 text-right">Nilai akhir</th>
              </tr>
            </thead>
            <tbody>
              {siswa.map((s) => (
                <tr
                  className="border-white/5 border-t align-top"
                  key={s.id_siswa}
                >
                  <td className="py-2 pr-3 text-white">
                    {s.nama_lengkap}
                    {s.nis ? (
                      <span className="ml-2 text-slate-400 text-xs">
                        {s.nis}
                      </span>
                    ) : null}
                    {s.kehadiran.bolos.length > 0 ? (
                      <span className="block text-amber-100 text-xs">
                        {catatanBolos(s.kehadiran.bolos)}
                      </span>
                    ) : null}
                  </td>
                  {s.komponen.map((k) => (
                    <td
                      className="py-2 pr-3 text-right text-slate-300"
                      key={k.id_jenis}
                    >
                      {angka(k.rata)}
                      {k.bobot_efektif !== null ? (
                        <span className="block text-slate-400 text-xs">
                          {angka(k.bobot_efektif)}%
                        </span>
                      ) : null}
                    </td>
                  ))}
                  <td className="py-2 pr-3 text-right text-slate-300">
                    {s.kehadiran.persen === null
                      ? "—"
                      : `${angka(s.kehadiran.persen)}%`}
                    <span className="block text-slate-400 text-xs">
                      {s.kehadiran.masuk}/
                      {s.kehadiran.hari_efektif - s.kehadiran.izin_sakit} hari
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold text-white">
                    {s.nilai_akhir ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
