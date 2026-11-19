"use client";

import { useEffect, useRef, useState } from "react";
import { PilihCari } from "@/components/ui/PilihCari";
import {
  getJadwalMengajar,
  type TeachingScheduleRow,
} from "@/lib/gateways/academic";
import { kunciSel, petakanPerGuru } from "./aturanJadwalGrid";

/**
 * Jadwal mingguan satu guru di semua rombel, hanya untuk dibaca. Kelas
 * gabungan tampil dalam satu sel. Perubahan tetap lewat Grid per rombel.
 */

const NAMA_HARI = [
  "",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];

export interface JadwalPerGuruProps {
  tahunAjaranList: Record<string, unknown>[];
  guruList: Record<string, unknown>[];
  rombelList: Record<string, unknown>[];
  onFeedback: (tone: "success" | "error", message: string) => void;
}

export function JadwalPerGuru({
  tahunAjaranList,
  guruList,
  rombelList,
  onFeedback,
}: JadwalPerGuruProps) {
  const [idTahun, setIdTahun] = useState(
    String(
      tahunAjaranList.find((ta) => ta.is_aktif === 1 || ta.is_aktif === "1")
        ?.id_tahun_ajaran ??
        tahunAjaranList[0]?.id_tahun_ajaran ??
        "",
    ),
  );
  const [idGuru, setIdGuru] = useState(String(guruList[0]?.id_guru ?? ""));
  const [rows, setRows] = useState<TeachingScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Prop induk berganti identitas tiap render; jangan jadikan dependensi efek.
  const onFeedbackRef = useRef(onFeedback);
  onFeedbackRef.current = onFeedback;

  useEffect(() => {
    if (!idGuru || !idTahun) {
      setRows([]);
      return;
    }
    let batal = false;
    setLoading(true);
    getJadwalMengajar({ id_guru: idGuru, id_tahun_ajaran: idTahun })
      .then((data) => {
        if (!batal) setRows(data);
      })
      .catch((error: unknown) => {
        if (batal) return;
        setRows([]);
        onFeedbackRef.current(
          "error",
          error instanceof Error ? error.message : "Gagal memuat jadwal guru.",
        );
      })
      .finally(() => {
        if (!batal) setLoading(false);
      });
    return () => {
      batal = true;
    };
  }, [idGuru, idTahun]);

  const peta = petakanPerGuru(rows);
  const namaMapel = new Map(
    rows.map((row) => [row.id_mapel, row.nama_mapel ?? row.id_mapel]),
  );
  const namaRombel = new Map(
    rombelList.map((rom) => [String(rom.id_rombel), String(rom.nama_rombel)]),
  );
  for (const row of rows) {
    if (!namaRombel.has(row.id_rombel)) {
      namaRombel.set(row.id_rombel, row.nama_rombel ?? row.id_rombel);
    }
  }
  const kunci = [...peta.sel.keys()];
  const hariTampil = kunci.some((k) => k.startsWith("7:"))
    ? [1, 2, 3, 4, 5, 6, 7]
    : [1, 2, 3, 4, 5, 6];
  const jamTampil = [
    ...new Set(kunci.map((k) => Number(k.slice(k.indexOf(":") + 1)))),
  ].sort((a, b) => a - b);

  const kelasSelect =
    "rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-sky-500 focus:outline-none";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="guru-tahun-ajaran"
          className="text-xs font-semibold text-slate-400"
        >
          Tahun ajaran:
        </label>
        <PilihCari
          id="guru-tahun-ajaran"
          value={idTahun}
          onChange={(event) => setIdTahun(event.target.value)}
          className={kelasSelect}
        >
          {tahunAjaranList.map((ta) => (
            <option
              key={String(ta.id_tahun_ajaran)}
              value={String(ta.id_tahun_ajaran)}
            >
              {String(ta.nama_tahun)} ({String(ta.semester)})
            </option>
          ))}
        </PilihCari>
        <label
          htmlFor="guru-jadwal"
          className="text-xs font-semibold text-slate-400"
        >
          Guru:
        </label>
        <PilihCari
          id="guru-jadwal"
          value={idGuru}
          onChange={(event) => setIdGuru(event.target.value)}
          className={kelasSelect}
        >
          {guruList.map((guru) => (
            <option key={String(guru.id_guru)} value={String(guru.id_guru)}>
              {String(guru.nama ?? guru.nama_lengkap ?? guru.id_guru)}
            </option>
          ))}
        </PilihCari>
      </div>

      {rows.length > 0 ? (
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-200">
            {peta.jpTatapMuka} JP
          </span>{" "}
          tatap muka per minggu, {peta.jpRombel} JP bila dihitung per rombel.
          Selisihnya berasal dari kelas yang digabung pada jam yang sama.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[720px] table-fixed text-left text-sm text-slate-300">
          <thead className="bg-slate-800/80 text-xs font-semibold uppercase text-slate-400">
            <tr>
              <th className="w-20 px-3 py-2">Jam ke</th>
              {hariTampil.map((hari) => (
                <th key={hari} className="px-2 py-2">
                  {NAMA_HARI[hari]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td
                  colSpan={hariTampil.length + 1}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  Memuat jadwal guru...
                </td>
              </tr>
            ) : jamTampil.length === 0 ? (
              <tr>
                <td
                  colSpan={hariTampil.length + 1}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  Guru ini belum punya jadwal pada tahun ajaran tersebut.
                </td>
              </tr>
            ) : (
              jamTampil.map((jam) => (
                <tr key={jam}>
                  <th
                    scope="row"
                    className="px-3 py-1.5 align-top font-mono text-xs text-slate-300"
                  >
                    {jam}
                  </th>
                  {hariTampil.map((hari) => {
                    const isi = peta.sel.get(kunciSel(hari, jam)) ?? [];
                    return (
                      <td key={hari} className="p-1 align-top">
                        {isi.map((item) => (
                          <div
                            key={item.id_mapel}
                            className={`rounded-lg border px-2 py-1.5 text-xs ${
                              isi.length > 1
                                ? "border-rose-500/40 bg-rose-500/10"
                                : "border-sky-500/30 bg-sky-500/10"
                            }`}
                          >
                            <span className="block truncate font-semibold text-slate-100">
                              {namaMapel.get(item.id_mapel)}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              {item.rombel
                                .map((id) => namaRombel.get(id) ?? id)
                                .join(", ")}
                            </span>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {[...peta.sel.values()].some((isi) => isi.length > 1) ? (
        <p className="text-[11px] text-rose-400">
          Sel merah: guru ini terjadwal untuk dua mapel berbeda pada jam yang
          sama.
        </p>
      ) : null}
    </div>
  );
}
