"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PilihCari } from "@/components/ui/PilihCari";
import {
  getDaftarPenugasanGuru,
  getJadwalMengajar,
  hapusJadwalMengajar,
  simpanJadwalMengajar,
  type TeachingScheduleRow,
} from "@/lib/gateways/academic";
import type { LessonPeriodRow } from "@/lib/gateways/class-attendance";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { jamKbmAktif, rentangJamKe } from "@/lib/validations/class-attendance";
import {
  type Grid,
  type IsiSel,
  jpPerMapel,
  kunciSel,
  petakanGrid,
  type RencanaSimpan,
  rencanaSimpan,
  salinKeGrid,
  selisihGrid,
  terapkanPerubahan,
} from "./aturanJadwalGrid";
import { PilihRombelBanyak } from "./PilihRombelBanyak";

/**
 * Editor grid hari × jam ke untuk satu rombel: pilih mapel sebagai "kuas",
 * lalu klik sel-selnya. Pengajar terisi dari penugasan guru mapel rombel itu.
 * Perubahan baru dikirim saat "Simpan perubahan", baris demi baris lewat
 * gateway yang sama dengan form Tambah Jadwal.
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
const SEMUA_HARI = [1, 2, 3, 4, 5, 6, 7];
/** Baris jam bila sekolah belum mengisi jadwal bel. */
const JAM_TANPA_BEL = Array.from({ length: 10 }, (_, i) => i + 1);

const pesanGalat = (error: unknown, cadangan: string) =>
  error instanceof Error ? error.message : cadangan;

export interface JadwalGridProps {
  tahunAjaranList: Record<string, unknown>[];
  /** Semua rombel, untuk sumber "Salin dari...". */
  rombelList: Record<string, unknown>[];
  /** Rombel yang bisa dibuka (sudah tersaring filter unit). */
  rombelPilihan: Record<string, unknown>[];
  idRombelAwal: string;
  guruList: Record<string, unknown>[];
  mapelUntuk: (idRombel: string) => Record<string, unknown>[];
  belUntuk: (idRombel: string, hari: number) => LessonPeriodRow[];
  canManage: boolean;
  onFeedback: (tone: "success" | "error", message: string) => void;
  onTersimpan: () => void;
}

export function JadwalGrid({
  tahunAjaranList,
  rombelList,
  rombelPilihan,
  idRombelAwal,
  guruList,
  mapelUntuk,
  belUntuk,
  canManage,
  onFeedback,
  onTersimpan,
}: JadwalGridProps) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const isSubmittingRef = useRef(false);
  // Prop dari halaman induk berganti identitas tiap render; jangan jadikan
  // dependensi efek muat.
  const onFeedbackRef = useRef(onFeedback);
  onFeedbackRef.current = onFeedback;
  const muatKeRef = useRef(0);
  const guruTerakhirRef = useRef(new Map<string, string>());

  const tahunAktif = String(
    tahunAjaranList.find((ta) => ta.is_aktif === 1 || ta.is_aktif === "1")
      ?.id_tahun_ajaran ??
      tahunAjaranList[0]?.id_tahun_ajaran ??
      "",
  );

  const [idTahun, setIdTahun] = useState(tahunAktif);
  const [idRombel, setIdRombel] = useState(
    idRombelAwal || String(rombelPilihan[0]?.id_rombel ?? ""),
  );
  const [rows, setRows] = useState<TeachingScheduleRow[]>([]);
  const [penugasan, setPenugasan] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Grid>(new Map());
  const [hariBerubah, setHariBerubah] = useState<Set<number>>(new Set());
  const [kuas, setKuas] = useState<IsiSel | "hapus" | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [salinTahun, setSalinTahun] = useState(tahunAktif);
  const [salinRombel, setSalinRombel] = useState("");
  // Kelas paralel yang ikut menerima perubahan grid ini saat disimpan.
  const [rombelIkut, setRombelIkut] = useState<Set<string>>(new Set());

  // Filter unit di panel bisa menyembunyikan rombel yang sedang dibuka.
  useEffect(() => {
    if (
      rombelPilihan.length > 0 &&
      !rombelPilihan.some((rom) => String(rom.id_rombel) === idRombel)
    ) {
      setIdRombel(String(rombelPilihan[0]?.id_rombel ?? ""));
    }
  }, [rombelPilihan, idRombel]);

  const muat = useCallback(async () => {
    const ke = ++muatKeRef.current;
    if (!idRombel || !idTahun) {
      setRows([]);
      setPenugasan([]);
      setSel(new Map());
      setHariBerubah(new Set());
      return;
    }
    setLoading(true);
    try {
      const [jadwal, tugas] = await Promise.all([
        getJadwalMengajar({ id_rombel: idRombel, id_tahun_ajaran: idTahun }),
        getDaftarPenugasanGuru(idRombel),
      ]);
      // Jawaban rombel lama yang datang terlambat tidak boleh menimpa grid.
      if (ke !== muatKeRef.current) return;
      setRows(jadwal);
      setPenugasan(
        tugas.filter((row) => String(row.id_tahun_ajaran) === idTahun),
      );
      setSel(petakanGrid(jadwal).sel);
      setHariBerubah(new Set());
    } catch (error: unknown) {
      if (ke === muatKeRef.current) {
        onFeedbackRef.current(
          "error",
          pesanGalat(error, "Gagal memuat jadwal rombel ini."),
        );
      }
    } finally {
      if (ke === muatKeRef.current) setLoading(false);
    }
  }, [idRombel, idTahun]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const peta = useMemo(() => petakanGrid(rows), [rows]);
  const rencana = useMemo(
    () => rencanaSimpan(peta.bisaDiubah, sel, hariBerubah),
    [peta, sel, hariBerubah],
  );
  const jumlahPerubahan =
    rencana.hapus.length + rencana.ubah.length + rencana.tambah.length;

  const mapelPilihan = mapelUntuk(idRombel);
  const guruPenugasan = useMemo(
    () =>
      new Map(
        penugasan.map((row) => [String(row.id_mapel), String(row.id_guru)]),
      ),
    [penugasan],
  );
  const jp = jpPerMapel(sel, peta.tetap);

  const namaMapel = new Map<string, string>();
  for (const row of rows) namaMapel.set(row.id_mapel, row.nama_mapel ?? "");
  for (const mapel of mapelPilihan) {
    namaMapel.set(
      String(mapel.id_mapel),
      String(mapel.kode_mapel || mapel.nama_mapel || mapel.id_mapel),
    );
  }
  const namaGuru = new Map<string, string>();
  for (const row of rows) namaGuru.set(row.id_guru, row.nama_guru ?? "");
  for (const guru of guruList) {
    namaGuru.set(
      String(guru.id_guru),
      String(guru.nama ?? guru.nama_lengkap ?? guru.id_guru),
    );
  }
  const namaRombel = (id: string) => {
    const rom = rombelList.find((row) => String(row.id_rombel) === id);
    return rom ? `${String(rom.tingkat)} - ${String(rom.nama_rombel)}` : id;
  };

  const adaIsiHari7 =
    [...sel.keys()].some((kunci) => kunci.startsWith("7:")) ||
    peta.tetap.some((row) => row.hari === 7);
  const hariTampil = adaIsiHari7 ? SEMUA_HARI : SEMUA_HARI.slice(0, 6);
  const belHari = new Map(
    hariTampil.map((hari) => [hari, jamKbmAktif(belUntuk(idRombel, hari))]),
  );
  const nomorJam = new Set<number>();
  for (const bel of belHari.values()) {
    for (const row of bel) nomorJam.add(row.jam_ke);
  }
  for (const kunci of [...sel.keys(), ...peta.terkunci]) {
    nomorJam.add(Number(kunci.slice(kunci.indexOf(":") + 1)));
  }
  const jamTampil =
    nomorJam.size > 0 ? [...nomorJam].sort((a, b) => a - b) : JAM_TANPA_BEL;
  const pukul = (hari: number, jam: number) => {
    const row = belHari.get(hari)?.find((bel) => bel.jam_ke === jam);
    return row ? `${row.jam_mulai}–${row.jam_selesai}` : "";
  };
  const pukulBaris = (jam: number) =>
    hariTampil.map((hari) => pukul(hari, jam)).find(Boolean) ?? "";

  const gantiSasaran = async (ubah: () => void) => {
    if (
      jumlahPerubahan > 0 &&
      !(await konfirmasi({
        title: "Buang perubahan grid?",
        description:
          "Perubahan di grid ini belum disimpan dan akan hilang bila kamu pindah.",
        confirmLabel: "Ya, buang",
        tone: "warning",
      }))
    ) {
      return;
    }
    // Pengajar kuas berasal dari penugasan rombel lama.
    setKuas(null);
    setRombelIkut(new Set());
    ubah();
  };

  const pilihKuas = (idMapel: string) => {
    setKuas({
      id_mapel: idMapel,
      id_guru:
        guruPenugasan.get(idMapel) ??
        guruTerakhirRef.current.get(idMapel) ??
        "",
    });
  };

  const klikSel = (hari: number, jam: number) => {
    const kunci = kunciSel(hari, jam);
    if (!canManage || peta.terkunci.has(kunci)) return;
    if (kuas === null) {
      onFeedback("error", "Pilih mata pelajaran di atas grid dulu.");
      return;
    }
    const lama = sel.get(kunci);
    const next = new Map(sel);
    if (
      kuas === "hapus" ||
      (lama?.id_mapel === kuas.id_mapel && lama.id_guru === kuas.id_guru)
    ) {
      next.delete(kunci);
    } else if (!kuas.id_guru) {
      onFeedback("error", "Pilih pengajar untuk mata pelajaran ini dulu.");
      return;
    } else {
      next.set(kunci, kuas);
    }
    setSel(next);
    setHariBerubah(new Set(hariBerubah).add(hari));
  };

  const batalkan = () => {
    setSel(peta.sel);
    setHariBerubah(new Set());
  };

  const label = (hari: number, jamKe: string) =>
    `${NAMA_HARI[hari] ?? hari} jam ${jamKe}`;

  /** Urutan hapus → ubah → tambah dijelaskan di `rencanaSimpan`. */
  const jalankan = async (
    langkah: RencanaSimpan,
    lama: readonly TeachingScheduleRow[],
    rombel: string,
    awalan: string,
  ) => {
    const gagal: string[] = [];
    for (const id of langkah.hapus) {
      const row = lama.find((item) => item.id_jadwal === id);
      try {
        await hapusJadwalMengajar(id);
      } catch (error: unknown) {
        gagal.push(
          `${awalan}${row ? label(row.hari, row.jam_ke) : id}: ${pesanGalat(error, "gagal dihapus")}`,
        );
      }
    }
    for (const baris of [...langkah.ubah, ...langkah.tambah]) {
      try {
        await simpanJadwalMengajar({
          ...baris,
          id_tahun_ajaran: idTahun,
          id_rombel: rombel,
          is_aktif: 1,
        });
      } catch (error: unknown) {
        gagal.push(
          `${awalan}${label(baris.hari, baris.jam_ke)}: ${pesanGalat(error, "gagal disimpan")}`,
        );
      }
    }
    return gagal;
  };

  const simpan = async () => {
    if (isSubmittingRef.current || jumlahPerubahan === 0) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    // Diambil sebelum `muat()` mengganti grid dengan isi database.
    const perubahan = selisihGrid(peta.sel, sel);
    const ikut = [...rombelIkut].filter((id) => id !== idRombel);
    try {
      const gagal = await jalankan(rencana, peta.bisaDiubah, idRombel, "");
      const dilewati: string[] = [];
      for (const idIkut of ikut) {
        const awalan = `${namaRombel(idIkut)} `;
        try {
          const [jadwal, tugas] = await Promise.all([
            getJadwalMengajar({ id_rombel: idIkut, id_tahun_ajaran: idTahun }),
            getDaftarPenugasanGuru(idIkut),
          ]);
          const tujuan = petakanGrid(jadwal);
          const boleh = new Set(
            mapelUntuk(idIkut).map((mapel) => String(mapel.id_mapel)),
          );
          const hasil = terapkanPerubahan(tujuan, perubahan, {
            mapelBoleh: (id) => boleh.has(id),
            guruPenugasan: new Map(
              tugas
                .filter((row) => String(row.id_tahun_ajaran) === idTahun)
                .map((row) => [String(row.id_mapel), String(row.id_guru)]),
            ),
          });
          for (const kunci of hasil.dilewati) {
            const [hari, jam] = kunci.split(":");
            dilewati.push(`${awalan}${label(Number(hari), jam)}`);
          }
          gagal.push(
            ...(await jalankan(
              rencanaSimpan(tujuan.bisaDiubah, hasil.sel, hasil.hariBerubah),
              tujuan.bisaDiubah,
              idIkut,
              awalan,
            )),
          );
        } catch (error: unknown) {
          gagal.push(
            `${namaRombel(idIkut)}: ${pesanGalat(error, "gagal dimuat")}`,
          );
        }
      }
      // Grid dimuat ulang dari database supaya yang tampil adalah yang benar-benar tersimpan.
      await muat();
      onTersimpan();
      const catatanLewat =
        dilewati.length > 0
          ? ` Dilewati karena sudah berisi mapel lain atau mapelnya tidak berlaku di rombel itu: ${dilewati.join("; ")}.`
          : "";
      if (gagal.length === 0) {
        onFeedback(
          "success",
          ikut.length > 0
            ? `Jadwal tersimpan di ${ikut.length + 1} rombel.${catatanLewat}`
            : "Jadwal rombel tersimpan.",
        );
      } else {
        onFeedback(
          "error",
          `${gagal.length} perubahan gagal. ${gagal.join("; ")}${catatanLewat}`,
        );
      }
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const salin = async () => {
    if (!salinRombel || isSubmittingRef.current) return;
    if (salinRombel === idRombel && salinTahun === idTahun) {
      onFeedback("error", "Sumbernya sama dengan jadwal yang sedang dibuka.");
      return;
    }
    if (
      sel.size > 0 &&
      !(await konfirmasi({
        title: "Ganti isi grid?",
        description: `Isi grid sekarang diganti jadwal ${namaRombel(salinRombel)}. Belum ada yang tersimpan sampai kamu menekan Simpan perubahan.`,
        confirmLabel: "Ya, ganti",
        tone: "warning",
      }))
    ) {
      return;
    }
    try {
      const sumber = await getJadwalMengajar({
        id_rombel: salinRombel,
        id_tahun_ajaran: salinTahun,
      });
      const boleh = new Set(mapelPilihan.map((m) => String(m.id_mapel)));
      const hasil = salinKeGrid(sumber, {
        terkunci: peta.terkunci,
        mapelBoleh: (id) => boleh.has(id),
        guruPenugasan,
      });
      if (hasil.disalin === 0) {
        onFeedback(
          "error",
          "Tidak ada jadwal yang bisa disalin dari sumber itu.",
        );
        return;
      }
      setSel(hasil.sel);
      setHariBerubah(new Set(SEMUA_HARI));
      onFeedback(
        "success",
        `${hasil.disalin} jadwal disalin ke grid${
          hasil.dilewati > 0
            ? `, ${hasil.dilewati} dilewati (mapel unit lain atau jam yang berisi lebih dari satu mapel)`
            : ""
        }. Periksa, lalu tekan Simpan perubahan.`,
      );
    } catch (error: unknown) {
      onFeedback("error", pesanGalat(error, "Gagal memuat jadwal sumber."));
    }
  };

  const kelasSelect =
    "rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-sky-500 focus:outline-none";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="grid-tahun-ajaran"
          className="text-xs font-semibold text-slate-400"
        >
          Tahun ajaran:
        </label>
        <PilihCari
          id="grid-tahun-ajaran"
          value={idTahun}
          onChange={(event) => {
            const nilai = event.target.value;
            void gantiSasaran(() => setIdTahun(nilai));
          }}
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
          htmlFor="grid-rombel"
          className="text-xs font-semibold text-slate-400"
        >
          Rombel:
        </label>
        <PilihCari
          id="grid-rombel"
          value={idRombel}
          onChange={(event) => {
            const nilai = event.target.value;
            void gantiSasaran(() => setIdRombel(nilai));
          }}
          className={kelasSelect}
        >
          {rombelPilihan.map((rom) => (
            <option key={String(rom.id_rombel)} value={String(rom.id_rombel)}>
              Kelas {String(rom.tingkat)} - {String(rom.nama_rombel)}
            </option>
          ))}
        </PilihCari>
      </div>

      {canManage && idRombel ? (
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
          <p className="text-xs text-slate-400">
            Pilih mata pelajaran, lalu klik sel jadwalnya. Klik sel yang sudah
            berisi mapel yang sama untuk mengosongkannya.
          </p>
          <div className="flex flex-wrap gap-2">
            {mapelPilihan.map((mapel) => {
              const id = String(mapel.id_mapel);
              const terpasang = jp.get(id) ?? 0;
              const beban = Number(mapel.beban_jam ?? 0);
              const aktif =
                kuas !== null && kuas !== "hapus" && kuas.id_mapel === id;
              const nadaJp =
                beban <= 0
                  ? "text-slate-400"
                  : terpasang < beban
                    ? "text-amber-400"
                    : terpasang === beban
                      ? "text-emerald-400"
                      : "text-rose-400";
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={aktif}
                  onClick={() => pilihKuas(id)}
                  title={String(mapel.nama_mapel)}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                    aktif
                      ? "border-sky-400 bg-sky-500/15 text-slate-100"
                      : "border-white/10 bg-slate-800 text-slate-300 hover:border-sky-500/50"
                  }`}
                >
                  <span className="block font-semibold">
                    {String(mapel.kode_mapel || mapel.nama_mapel)}
                  </span>
                  <span className={`block text-[11px] ${nadaJp}`}>
                    {terpasang}
                    {beban > 0 ? `/${beban}` : ""} JP
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={kuas === "hapus"}
              onClick={() => setKuas("hapus")}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                kuas === "hapus"
                  ? "border-rose-400 bg-rose-500/15 text-rose-300"
                  : "border-white/10 bg-slate-800 text-rose-400 hover:border-rose-500/50"
              }`}
            >
              Kosongkan sel
            </button>
          </div>

          {kuas !== null && kuas !== "hapus" ? (
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="grid-pengajar"
                className="text-xs font-semibold text-slate-400"
              >
                Pengajar {namaMapel.get(kuas.id_mapel) ?? ""}:
              </label>
              <PilihCari
                id="grid-pengajar"
                value={kuas.id_guru}
                onChange={(event) => {
                  const idGuru = event.target.value;
                  guruTerakhirRef.current.set(kuas.id_mapel, idGuru);
                  setKuas({ ...kuas, id_guru: idGuru });
                }}
                className={kelasSelect}
              >
                <option value="">Pilih pengajar</option>
                {guruList.map((guru) => (
                  <option
                    key={String(guru.id_guru)}
                    value={String(guru.id_guru)}
                  >
                    {String(guru.nama ?? guru.nama_lengkap ?? guru.id_guru)}
                  </option>
                ))}
              </PilihCari>
              {guruPenugasan.has(kuas.id_mapel) ? (
                <span className="text-[11px] text-slate-400">
                  Dari penugasan guru mapel rombel ini.
                </span>
              ) : (
                <span className="text-[11px] text-amber-400">
                  Mapel ini belum punya penugasan di rombel ini.
                </span>
              )}
            </div>
          ) : null}

          <details
            className="rounded-lg border border-white/10 p-2"
            open={rombelIkut.size > 0}
          >
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">
              Terapkan juga ke rombel lain
              {rombelIkut.size > 0 ? ` (${rombelIkut.size} dipilih)` : ""}
            </summary>
            <p className="mt-2 text-[11px] leading-4 text-slate-400">
              Untuk kelas paralel yang belajar bersama. Saat disimpan, sel yang
              kamu ubah di grid ini ikut diubah di rombel terpilih. Sel yang di
              sana sudah berisi mapel lain tidak ditimpa. Pengajarnya dari
              penugasan masing-masing rombel.
            </p>
            <div className="mt-2">
              <PilihRombelBanyak
                rombelList={rombelPilihan}
                terpilih={rombelIkut}
                onChange={setRombelIkut}
                kecuali={idRombel}
              />
            </div>
          </details>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[720px] table-fixed text-left text-sm text-slate-300">
          <thead className="bg-slate-800/80 text-xs font-semibold uppercase text-slate-400">
            <tr>
              <th className="w-24 px-3 py-2">Jam ke</th>
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
                  Memuat jadwal rombel...
                </td>
              </tr>
            ) : !idRombel ? (
              <tr>
                <td
                  colSpan={hariTampil.length + 1}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  Belum ada rombel.
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
                    {pukulBaris(jam) ? (
                      <span className="block font-sans text-[11px] font-normal text-slate-500">
                        {pukulBaris(jam)}
                      </span>
                    ) : null}
                  </th>
                  {hariTampil.map((hari) => {
                    const kunci = kunciSel(hari, jam);
                    const bel = belHari.get(hari) ?? [];
                    const isi = sel.get(kunci);
                    if (peta.terkunci.has(kunci)) {
                      const nama = peta.tetap
                        .filter((row) => {
                          const r = rentangJamKe(row.jam_ke);
                          return (
                            row.hari === hari &&
                            r !== null &&
                            r.awal <= jam &&
                            jam <= r.akhir
                          );
                        })
                        .map(
                          (row) => namaMapel.get(row.id_mapel) || row.id_mapel,
                        )
                        .join(" / ");
                      return (
                        <td key={hari} className="p-1">
                          <div
                            title="Jam ini berisi lebih dari satu mapel. Ubah lewat tampilan Daftar."
                            className="rounded-lg border border-dashed border-white/15 px-2 py-1.5 text-[11px] text-slate-400"
                          >
                            <span className="block truncate">{nama}</span>
                            <span className="block">Ubah lewat Daftar</span>
                          </div>
                        </td>
                      );
                    }
                    if (
                      !isi &&
                      bel.length > 0 &&
                      !bel.some((b) => b.jam_ke === jam)
                    ) {
                      return (
                        <td
                          key={hari}
                          className="p-1 text-center text-slate-600"
                          title={`${NAMA_HARI[hari]} tidak punya jam ke-${jam} di jadwal bel.`}
                        >
                          —
                        </td>
                      );
                    }
                    const sama =
                      isi !== undefined &&
                      kuas !== null &&
                      kuas !== "hapus" &&
                      isi.id_mapel === kuas.id_mapel;
                    const keterangan = isi
                      ? `${namaMapel.get(isi.id_mapel) || isi.id_mapel}, ${namaGuru.get(isi.id_guru) || isi.id_guru}`
                      : "kosong";
                    return (
                      <td key={hari} className="p-1">
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => klikSel(hari, jam)}
                          aria-label={`${NAMA_HARI[hari]} jam ke-${jam}: ${keterangan}`}
                          title={pukul(hari, jam) || undefined}
                          className={`min-h-11 w-full rounded-lg border px-2 py-1.5 text-left text-xs transition disabled:cursor-default ${
                            isi
                              ? sama
                                ? "border-sky-400 bg-sky-500/15 text-slate-100"
                                : "border-sky-500/30 bg-sky-500/10 text-slate-100"
                              : "border-white/5 bg-slate-900/40 text-slate-600 enabled:hover:border-sky-500/40"
                          }`}
                        >
                          {isi ? (
                            <>
                              <span className="block truncate font-semibold">
                                {namaMapel.get(isi.id_mapel) || isi.id_mapel}
                              </span>
                              <span className="block truncate text-[11px] text-slate-400">
                                {namaGuru.get(isi.id_guru) || isi.id_guru}
                              </span>
                            </>
                          ) : canManage ? (
                            "+"
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canManage && idRombel ? (
        <details className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-300">
            Salin dari rombel atau tahun ajaran lain
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
              Tahun ajaran sumber
              <PilihCari
                value={salinTahun}
                onChange={(event) => setSalinTahun(event.target.value)}
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
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
              Rombel sumber
              <PilihCari
                value={salinRombel}
                onChange={(event) => setSalinRombel(event.target.value)}
                className={kelasSelect}
              >
                <option value="">Pilih rombel</option>
                {rombelList
                  .filter(
                    (rom) =>
                      !(
                        String(rom.id_rombel) === idRombel &&
                        salinTahun === idTahun
                      ),
                  )
                  .map((rom) => (
                    <option
                      key={String(rom.id_rombel)}
                      value={String(rom.id_rombel)}
                    >
                      Kelas {String(rom.tingkat)} - {String(rom.nama_rombel)}
                    </option>
                  ))}
              </PilihCari>
            </label>
            <button
              type="button"
              onClick={() => void salin()}
              disabled={!salinRombel || menyimpan}
              className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-sky-400 disabled:opacity-50"
            >
              Salin ke grid
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-400">
            Pengajar diambil dari penugasan guru mapel rombel ini bila ada.
            Hasil salinan belum tersimpan sampai kamu menekan Simpan perubahan.
          </p>
        </details>
      ) : null}

      {canManage && jumlahPerubahan > 0 ? (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-slate-900/95 p-3">
          <span className="text-xs text-slate-300">
            {jumlahPerubahan} perubahan belum disimpan
            {rombelIkut.size > 0
              ? `, juga diterapkan ke ${rombelIkut.size} rombel lain`
              : ""}
            .
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={batalkan}
              disabled={menyimpan}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 disabled:opacity-50"
            >
              Batalkan
            </button>
            <button
              type="button"
              data-konfirmasi
              onClick={() => void simpan()}
              disabled={menyimpan}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {menyimpan ? "Menyimpan..." : "Simpan perubahan"}
            </button>
          </div>
        </div>
      ) : null}

      {dialogKonfirmasi}
    </div>
  );
}
