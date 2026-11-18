"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import { getDaftarTahunAjaran } from "@/lib/gateways/academic";
import {
  muatDaftarKinerja,
  muatRincianKinerja,
  muatRiwayatKinerja,
  muatSetupSurat,
  putuskanPenilaianKinerja,
  simpanPenilaianKinerja,
} from "@/lib/gateways/hris";
import { syncNow } from "@/lib/gateways/sync-status";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import {
  type BarisNilai,
  type DaftarKinerja,
  formatNilai,
  JENIS_PERIODE,
  type JenisKeputusan,
  type JenisPeriode,
  kalimatRincian,
  nilaiAkhir,
  PESAN_OTOMATIS_BERUBAH,
  type RincianKinerja,
  type RiwayatKinerja,
  type SatuanMengajar,
  STATUS_DIAJUKAN,
  STATUS_DIBATALKAN,
  STATUS_DRAF,
  STATUS_FINAL,
  type StatusKinerja,
  type TahunAjaran,
  type TandaKinerja,
  type TemplateKinerja,
  TIPE_JURNAL,
  TIPE_KEHADIRAN,
  TIPE_MANUAL,
  TIPE_PRESENSI,
  uraiRincian,
} from "@/lib/validations/hr-kinerja";
import {
  INPUT,
  LABEL,
  PERINGATAN,
  pesanGalat,
  TOMBOL,
  TOMBOL_UTAMA,
} from "./gaya";
import { cetakSurat, lembarKinerja, tanggalWibDari } from "./suratKepegawaian";

/**
 * Alur penilaian kinerja (HRIS Fase 5b, §23.2.2–23.2.6): daftar per periode,
 * rincian dengan rumus kehadiran, dan aksi Ajukan/Kembalikan/Final/Batal/
 * Koreksi. Izin, cakupan unit, dan "diri sendiri" dinilai ulang backend dari
 * sesi; tombol di sini hanya menyembunyikan yang jelas tidak berlaku.
 */

const LABEL_TANDA: Record<TandaKinerja, string> = {
  bukan_penilai_bawaan: "Bukan penilai bawaan",
  dinilai_dan_difinalkan_sama: "Dinilai dan difinalkan orang yang sama",
  otomatis_diubah: "Skor otomatis diubah penilai",
  otomatis_manual: "Aspek otomatis diisi manual",
  periode_tidak_penuh: "Tidak aktif sepanjang periode",
  periode_belum_selesai: "Dihitung sebelum periode selesai",
  pengajuan_menunggu: "Ada pengajuan cuti/izin yang belum diputus",
  asn: "ASN: penilaian resminya di platform pemerintah",
  otomatis_berubah: "Hitungan hari ini berbeda dari angka yang dibekukan",
};

const WARNA_STATUS: Record<StatusKinerja, string> = {
  Draf: "bg-slate-700 text-slate-200",
  Diajukan: "bg-amber-400/15 text-amber-100",
  Final: "bg-emerald-400/15 text-emerald-100",
  Dibatalkan: "bg-rose-400/15 text-rose-100",
};

type Saringan = "Semua" | "Belum dinilai" | StatusKinerja;
const SARINGAN: Saringan[] = [
  "Semua",
  "Belum dinilai",
  STATUS_DRAF,
  STATUS_DIAJUKAN,
  STATUS_FINAL,
  STATUS_DIBATALKAN,
];

type TahunPilihan = TahunAjaran & { aktif: boolean };

function Lencana({ status }: { status: StatusKinerja }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${WARNA_STATUS[status]}`}
    >
      {status}
    </span>
  );
}

function DaftarTanda({ tanda }: { tanda: TandaKinerja[] }) {
  if (tanda.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {tanda.map((t) => (
        <li
          key={t}
          className="rounded-full border border-amber-300/25 px-2 py-0.5 text-xs text-amber-100"
        >
          {LABEL_TANDA[t]}
        </li>
      ))}
    </ul>
  );
}

const nilaiTampil = (nilai: number | null, predikat: string | null) =>
  nilai === null ? "-" : `${formatNilai(nilai)} ${predikat ?? ""}`.trim();

/** Bagian Penilaian di tab Kinerja `/kepegawaian`. */
export function DaftarPenilaianKinerja({
  template,
  bolehNilai,
  bolehPutus,
  onPesan,
  onGalat,
}: {
  template: TemplateKinerja[];
  bolehNilai: boolean;
  bolehPutus: boolean;
  onPesan: (pesan: string) => void;
  onGalat: (pesan: string) => void;
}) {
  const [tahun, setTahun] = useState<TahunPilihan[]>([]);
  const [jenis, setJenis] = useState<JenisPeriode>("Semester");
  const [kunci, setKunci] = useState("");
  const [data, setData] = useState<DaftarKinerja | null>(null);
  const [saring, setSaring] = useState<Saringan>("Semua");
  const [perluSaya, setPerluSaya] = useState(false);
  const [buka, setBuka] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    getDaftarTahunAjaran()
      .then((rows) => {
        const daftar = rows.map((r) => ({
          id_tahun_ajaran: String(r.id_tahun_ajaran ?? ""),
          nama_tahun: String(r.nama_tahun ?? ""),
          semester: String(r.semester ?? ""),
          tanggal_mulai: String(r.tanggal_mulai ?? ""),
          tanggal_selesai: String(r.tanggal_selesai ?? ""),
          aktif: Number(r.is_aktif) === 1,
        }));
        daftar.sort((a, b) => b.tanggal_mulai.localeCompare(a.tanggal_mulai));
        setTahun(daftar);
        const awal = daftar.find((t) => t.aktif) ?? daftar[0];
        if (awal) setKunci(awal.id_tahun_ajaran);
      })
      .catch((error) => onGalat(pesanGalat(error)));
  }, [onGalat]);

  const pilihan = useMemo(() => {
    if (jenis === "Semester") {
      return tahun.map((t) => ({
        nilai: t.id_tahun_ajaran,
        label: `${t.nama_tahun} Semester ${t.semester}`,
      }));
    }
    return [...new Set(tahun.map((t) => t.nama_tahun))].map((n) => ({
      nilai: n,
      label: `Tahun Ajaran ${n}`,
    }));
  }, [jenis, tahun]);

  const gantiJenis = (baru: JenisPeriode) => {
    setJenis(baru);
    const aktif = tahun.find((t) => t.aktif) ?? tahun[0];
    if (!aktif) return;
    setKunci(baru === "Semester" ? aktif.id_tahun_ajaran : aktif.nama_tahun);
  };

  const muat = useCallback(async () => {
    if (!kunci) return;
    try {
      setData(await muatDaftarKinerja(jenis, kunci));
    } catch (error) {
      setData(null);
      onGalat(pesanGalat(error));
    }
  }, [jenis, kunci, onGalat]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const mulaiMenilai = async (idKaryawan: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      const hasil = await simpanPenilaianKinerja({
        aksi: "Buat",
        id_karyawan: idKaryawan,
        periode_jenis: jenis,
        periode_kunci: kunci,
      });
      await muat();
      setBuka(hasil.id_penilaian);
    } catch (error) {
      onGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  // Dialog cetak dibuka sesudah modal rincian ditutup: Escape di `Modal`
  // menutup setiap modal yang terbuka (§21).
  const cetak = (r: RincianKinerja) => {
    setBuka(null);
    const final = r.keputusan.filter((k) => k.jenis === "Final").at(-1);
    const tanggal = tanggalWibDari(final?.created_at ?? "");
    muatSetupSurat(tanggal)
      .then((setup) =>
        cetakSurat(lembarKinerja({ setup, nomor: "", tanggal }, r)),
      )
      .catch((error) => onGalat(pesanGalat(error)));
  };

  const penilaian = (data?.penilaian ?? []).filter(
    (p) =>
      (saring === "Semua" || saring === p.status) &&
      (!perluSaya || p.perlu_saya),
  );
  const belum = (data?.belum_dinilai ?? []).filter(
    (b) =>
      (saring === "Semua" || saring === "Belum dinilai") &&
      (!perluSaya || b.perlu_saya),
  );

  return (
    <section aria-labelledby="judul-penilaian-kinerja" className="space-y-3">
      <h2
        id="judul-penilaian-kinerja"
        className="text-base font-semibold text-white"
      >
        Penilaian
      </h2>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_12rem]">
        <div>
          <label htmlFor="kinerja-jenis-periode" className={LABEL}>
            Periode
          </label>
          <select
            id="kinerja-jenis-periode"
            value={jenis}
            onChange={(e) => gantiJenis(e.target.value as JenisPeriode)}
            className={INPUT}
          >
            {JENIS_PERIODE.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="kinerja-kunci-periode" className={LABEL}>
            {jenis === "Semester" ? "Semester" : "Tahun ajaran"}
          </label>
          <select
            id="kinerja-kunci-periode"
            value={kunci}
            onChange={(e) => setKunci(e.target.value)}
            className={INPUT}
          >
            {pilihan.map((p) => (
              <option key={p.nilai} value={p.nilai}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="kinerja-saring" className={LABEL}>
            Status
          </label>
          <select
            id="kinerja-saring"
            value={saring}
            onChange={(e) => setSaring(e.target.value as Saringan)}
            className={INPUT}
          >
            {SARINGAN.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={perluSaya}
          onChange={(e) => setPerluSaya(e.target.checked)}
        />
        Hanya yang perlu saya nilai
      </label>
      {tahun.length === 0 ? (
        <p className="text-sm text-slate-400">
          Belum ada tahun ajaran. Tambahkan dulu di menu Akademik.
        </p>
      ) : !data ? (
        <p className="text-sm text-slate-400">Memuat penilaian…</p>
      ) : (
        <>
          <p className="text-sm text-slate-400">
            {data.periode.nama}: {data.periode.mulai} s.d.{" "}
            {data.periode.selesai}. Penilaian bisa diajukan sejak periode
            dimulai; angka otomatis dihitung sampai hari pengajuan.
          </p>
          {penilaian.length === 0 && belum.length === 0 ? (
            <p className="text-sm text-slate-400">
              Tidak ada pegawai untuk saringan ini.
            </p>
          ) : null}
          <ul className="space-y-2">
            {penilaian.map((p) => (
              <li
                key={p.id_penilaian}
                className="rounded-2xl border border-white/10 bg-slate-900 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold text-white">
                      {p.nama}{" "}
                      <span className="text-sm font-normal text-slate-400">
                        {p.kelompok}
                        {p.unit ? ` · ${p.unit}` : ""}
                        {p.id_ref ? " · koreksi" : ""}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                      <Lencana status={p.status} />
                      <span className="tabular-nums">
                        {nilaiTampil(p.nilai_akhir, p.predikat)}
                      </span>
                      {p.perlu_saya ? (
                        <span className="text-xs text-sky-200">
                          Perlu Anda nilai
                        </span>
                      ) : null}
                    </div>
                    <DaftarTanda tanda={p.tanda} />
                  </div>
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setBuka(p.id_penilaian)}
                  >
                    Buka
                  </button>
                </div>
              </li>
            ))}
            {belum.map((b) => (
              <li
                key={b.id_karyawan}
                className="rounded-2xl border border-dashed border-white/10 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">
                      {b.nama}{" "}
                      <span className="text-sm font-normal text-slate-400">
                        {b.kelompok}
                        {b.unit ? ` · ${b.unit}` : ""}
                      </span>
                    </p>
                    <p className="text-sm text-slate-400">
                      Belum dinilai
                      {b.perlu_saya ? " · perlu Anda nilai" : ""}
                      {b.penilai_bawaan ? "" : " · belum ada penilai bawaan"}
                      {b.periode_tidak_penuh
                        ? " · tidak aktif sepanjang periode"
                        : ""}
                    </p>
                  </div>
                  {bolehNilai ? (
                    <button
                      type="button"
                      className={TOMBOL}
                      disabled={menyimpan}
                      onClick={() => void mulaiMenilai(b.id_karyawan)}
                    >
                      Mulai menilai
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {buka ? (
        <ModalPenilaian
          idAwal={buka}
          template={template}
          bolehNilai={bolehNilai}
          bolehPutus={bolehPutus}
          onClose={() => {
            setBuka(null);
            void muat();
          }}
          onCetak={cetak}
          onPesan={onPesan}
        />
      ) : null}
    </section>
  );
}

type Isian = Record<string, { skor: string; catatan: string }>;
const KOSONG = { skor: "", catatan: "" };

function isianAwal(r: RincianKinerja): Isian {
  return Object.fromEntries(
    r.nilai.map((b) => {
      // Skor otomatis yang mengikuti hitungan disimpan kosong di layar supaya
      // ikut hitungan terbaru, sama dengan `isianTersimpan`.
      const ikut =
        b.tipe !== TIPE_MANUAL &&
        b.skor_hitung !== null &&
        b.skor === b.skor_hitung;
      return [
        b.id_aspek,
        {
          skor: ikut || b.skor === null ? "" : String(b.skor),
          catatan: b.catatan ?? "",
        },
      ];
    }),
  );
}

const MAKS_DAFTAR = 30;

const teksSatuan = (s: SatuanMengajar) =>
  `${s.tanggal} ${s.nama_rombel} jam ${s.jam}`;

/**
 * Rumus dan angka satu aspek otomatis: dari `rincian` beku sesudah Draf,
 * selain itu dari hitungan hidup beserta tanggal (dan rombel) yang menurunkan
 * nilainya.
 */
function PanelOtomatis({ b, data }: { b: BarisNilai; data: RincianKinerja }) {
  const beku = data.status === STATUS_DRAF ? null : b.rincian;
  const r = uraiRincian(beku ?? data.hidup[b.tipe]?.rincian ?? null);
  if (!r) {
    return (
      <p className="text-sm text-slate-400">
        Pegawai tidak aktif di periode ini; aspek ini tidak bisa dihitung.
      </p>
    );
  }
  const k = data.kehadiran;
  const m = data.mengajar;
  const daftar: [string, string[]][] = beku
    ? []
    : b.tipe === TIPE_KEHADIRAN && k
      ? [
          ["Tanpa catatan", k.tanggal_kosong],
          ["Alfa", k.tanggal_alfa],
          ["Terlambat", k.tanggal_telat],
        ]
      : b.tipe === TIPE_PRESENSI && m
        ? [["Presensi belum terisi", m.belum_terisi.map(teksSatuan)]]
        : b.tipe === TIPE_JURNAL && m
          ? [["Jurnal belum diisi", m.tanpa_jurnal.map(teksSatuan)]]
          : [];
  return (
    <div className="space-y-1 rounded-xl border border-white/10 p-3 text-sm text-slate-300">
      <p>
        {kalimatRincian(r)} Dihitung sampai {r.sampai}.
      </p>
      {daftar
        .filter(([, isi]) => isi.length > 0)
        .map(([label, isi]) => (
          <p key={label}>
            {label}: {isi.slice(0, MAKS_DAFTAR).join(", ")}
            {isi.length > MAKS_DAFTAR
              ? `, dan ${isi.length - MAKS_DAFTAR} lainnya`
              : ""}
          </p>
        ))}
    </div>
  );
}

function ModalPenilaian({
  idAwal,
  template,
  bolehNilai,
  bolehPutus,
  onClose,
  onCetak,
  onPesan,
}: {
  idAwal: string;
  template: TemplateKinerja[];
  bolehNilai: boolean;
  bolehPutus: boolean;
  onClose: () => void;
  onCetak: (r: RincianKinerja) => void;
  onPesan: (pesan: string) => void;
}) {
  const [id, setId] = useState(idAwal);
  const [data, setData] = useState<RincianKinerja | null>(null);
  const [isian, setIsian] = useState<Isian>({});
  const [catatan, setCatatan] = useState("");
  const [alasan, setAlasan] = useState("");
  const [idTemplate, setIdTemplate] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [peringatan, setPeringatan] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const muat = useCallback(async () => {
    try {
      const r = await muatRincianKinerja(id);
      setData(r);
      setIsian(isianAwal(r));
      setCatatan(r.penilaian.catatan);
      setIdTemplate(r.penilaian.id_template);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, [id]);

  useEffect(() => {
    void muat();
  }, [muat]);

  if (!data) {
    return (
      <Modal title="Penilaian kinerja" onClose={onClose} hideFooter>
        <p
          className="text-sm text-slate-400"
          role={galat ? "alert" : undefined}
        >
          {galat ?? "Memuat…"}
        </p>
      </Modal>
    );
  }

  const p = data.penilaian;
  const koreksi = p.id_ref !== "";
  const bisaIsi =
    data.status === STATUS_DRAF &&
    !data.sendiri &&
    (bolehNilai || (koreksi && bolehPutus));
  const bisaPutus =
    data.status === STATUS_DIAJUKAN && bolehPutus && !data.sendiri;
  const bisaBatal =
    (data.status === STATUS_DRAF || data.status === STATUS_DIAJUKAN) &&
    (bolehNilai || bolehPutus) &&
    !data.sendiri;
  const bisaKoreksi =
    data.status === STATUS_FINAL &&
    bolehPutus &&
    !data.sendiri &&
    data.berlaku === id;
  const panduanAspek = new Map(
    template.flatMap((t) => t.aspek).map((a) => [a.id_aspek, a.panduan]),
  );
  const templateSekelompok = template.filter(
    (t) => t.kelompok === p.kelompok && t.is_aktif === 1,
  );

  const skorDipakai = (b: BarisNilai) => {
    const isi = isian[b.id_aspek]?.skor ?? "";
    if (isi !== "") return Number(isi);
    return data.hidup[b.tipe]?.skor ?? null;
  };
  const nilaiHidup = bisaIsi
    ? nilaiAkhir(data.nilai.map((b) => ({ ...b, skor: skorDipakai(b) })))
    : data.nilai_akhir;

  const jalankan = async (kerja: () => Promise<string>) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    try {
      const pesan = await kerja();
      onPesan(pesan);
      setAlasan("");
      await muat();
    } catch (error) {
      const pesan = pesanGalat(error);
      setGalat(pesan);
      if (pesan === PESAN_OTOMATIS_BERUBAH) await muat();
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const simpanDraf = () =>
    simpanPenilaianKinerja({
      aksi: "Simpan",
      id_penilaian: id,
      catatan,
      nilai: data.nilai.map((b) => ({
        id_aspek: b.id_aspek,
        skor:
          isian[b.id_aspek]?.skor === ""
            ? null
            : Number(isian[b.id_aspek]?.skor),
        catatan: isian[b.id_aspek]?.catatan ?? "",
      })),
    });

  const kirimDraf = (event: FormEvent) => {
    event.preventDefault();
    void jalankan(async () => {
      await simpanDraf();
      return "Draf penilaian disimpan.";
    });
  };

  const ajukan = () =>
    jalankan(async () => {
      await simpanDraf();
      // Presensi dan absensi perangkat ini yang masih di outbox harus sampai
      // ke cloud dulu; gagal sinkron tidak menahan pengajuan.
      if (isDesktopRuntime()) {
        try {
          await syncNow();
          setPeringatan(null);
        } catch {
          setPeringatan(
            "Sinkronisasi gagal; data perangkat ini yang belum terkirim tidak ikut dihitung.",
          );
        }
      }
      const rincian = Object.fromEntries(
        data.nilai
          .filter((b) => b.tipe !== TIPE_MANUAL && data.hidup[b.tipe])
          .map((b) => [b.id_aspek, data.hidup[b.tipe]?.rincian ?? ""]),
      );
      await putuskanPenilaianKinerja({
        id_penilaian: id,
        jenis: "Ajukan",
        rincian,
      });
      return "Penilaian diajukan.";
    });

  const putuskan = (jenis: JenisKeputusan, pesan: string) =>
    jalankan(async () => {
      await putuskanPenilaianKinerja({ id_penilaian: id, jenis, alasan });
      return pesan;
    });

  const muatUlang = () =>
    jalankan(async () => {
      await simpanPenilaianKinerja({
        aksi: "Muat ulang",
        id_penilaian: id,
        id_template: idTemplate,
      });
      return "Aspek dimuat ulang dari template.";
    });

  const buatKoreksi = () =>
    jalankan(async () => {
      const hasil = await simpanPenilaianKinerja({
        aksi: "Koreksi",
        id_penilaian: id,
        alasan_koreksi: alasan,
      });
      setId(hasil.id_penilaian);
      return "Koreksi dibuat sebagai draf.";
    });

  const ubahIsian = (idAspek: string, isi: Partial<Isian[string]>) =>
    setIsian((lama) => ({
      ...lama,
      [idAspek]: { ...KOSONG, ...lama[idAspek], ...isi },
    }));

  return (
    <Modal
      title={`Kinerja: ${p.nama}`}
      subtitle={`${p.periode_nama} · ${p.template_nama}${koreksi ? " · koreksi" : ""}`}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
          <Lencana status={data.status} />
          <span className="tabular-nums">
            Nilai akhir{" "}
            {nilaiTampil(
              nilaiHidup,
              data.status === STATUS_FINAL ? data.predikat : null,
            )}
          </span>
          <span>
            Penilai: {p.penilai_nama || "-"}
            {data.penilai_bawaan
              ? ` · bawaan ${data.penilai_bawaan.nama ?? data.penilai_bawaan.id}`
              : " · belum ada penilai bawaan"}
          </span>
        </div>
        <DaftarTanda tanda={data.tanda} />
        {koreksi && p.alasan_koreksi ? (
          <p className="text-sm text-slate-300">
            Alasan koreksi: {p.alasan_koreksi}
          </p>
        ) : null}
        {galat ? (
          <p className="text-sm text-rose-300" role="alert">
            {galat}
          </p>
        ) : null}
        {peringatan ? <p className={PERINGATAN}>{peringatan}</p> : null}

        <form className="space-y-3" onSubmit={kirimDraf}>
          {data.nilai.map((b) => {
            const hidup = data.hidup[b.tipe];
            const otomatis = b.tipe !== TIPE_MANUAL;
            const panduan = panduanAspek.get(b.id_aspek);
            return (
              <fieldset
                key={b.id_aspek}
                className="space-y-2 rounded-xl border border-white/10 p-3"
              >
                <legend className="px-1 text-sm font-semibold text-white">
                  {b.aspek_nama}{" "}
                  <span className="font-normal text-slate-400">
                    bobot {b.bobot}
                    {otomatis ? ` · ${b.tipe}` : ""}
                  </span>
                </legend>
                {panduan ? (
                  <p className="text-xs text-slate-400">{panduan}</p>
                ) : null}
                {otomatis ? <PanelOtomatis b={b} data={data} /> : null}
                {bisaIsi && otomatis && hidup && hidup.skor === null ? (
                  <p className="text-xs text-slate-400">
                    Aspek ini tidak bisa dihitung otomatis; isi skor beserta
                    catatan alasannya.
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
                  {bisaIsi ? (
                    <select
                      aria-label={`Skor ${b.aspek_nama}`}
                      value={isian[b.id_aspek]?.skor ?? ""}
                      onChange={(e) =>
                        ubahIsian(b.id_aspek, { skor: e.target.value })
                      }
                      className={INPUT}
                    >
                      <option value="">
                        {hidup && hidup.skor !== null
                          ? `Ikuti hitungan (${hidup.skor})`
                          : "Belum diisi"}
                      </option>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <option key={s} value={String(s)}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-slate-200">
                      Skor {b.skor ?? "-"}
                      {b.skor_hitung !== null && b.skor !== b.skor_hitung
                        ? ` (hitungan ${b.skor_hitung})`
                        : ""}
                    </p>
                  )}
                  {bisaIsi ? (
                    <textarea
                      aria-label={`Catatan ${b.aspek_nama}`}
                      rows={1}
                      maxLength={1000}
                      placeholder={
                        otomatis
                          ? "Catatan (wajib bila skor berbeda dari hitungan)"
                          : "Catatan"
                      }
                      value={isian[b.id_aspek]?.catatan ?? ""}
                      onChange={(e) =>
                        ubahIsian(b.id_aspek, { catatan: e.target.value })
                      }
                      className={`${INPUT} py-2`}
                    />
                  ) : b.catatan ? (
                    <p className="text-sm text-slate-300">{b.catatan}</p>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
          <div>
            <label htmlFor="kinerja-catatan-umum" className={LABEL}>
              Catatan penilai
            </label>
            {bisaIsi ? (
              <textarea
                id="kinerja-catatan-umum"
                rows={3}
                maxLength={2000}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                className={`${INPUT} py-2`}
              />
            ) : (
              <p id="kinerja-catatan-umum" className="text-sm text-slate-300">
                {p.catatan || "-"}
              </p>
            )}
          </div>
          {bisaIsi ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="submit" className={TOMBOL} disabled={menyimpan}>
                Simpan draf
              </button>
              <button
                type="button"
                data-konfirmasi
                className={TOMBOL_UTAMA}
                disabled={menyimpan}
                onClick={() => void ajukan()}
              >
                Ajukan
              </button>
            </div>
          ) : null}
        </form>

        {bisaIsi && templateSekelompok.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
            <div className="min-w-48 flex-1">
              <label htmlFor="kinerja-muat-template" className={LABEL}>
                Template
              </label>
              <select
                id="kinerja-muat-template"
                value={idTemplate}
                onChange={(e) => setIdTemplate(e.target.value)}
                className={INPUT}
              >
                {templateSekelompok.map((t) => (
                  <option key={t.id_template} value={t.id_template}>
                    {t.nama}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              data-konfirmasi
              className={TOMBOL}
              disabled={menyimpan}
              onClick={() => void muatUlang()}
            >
              Muat ulang template
            </button>
          </div>
        ) : null}

        {data.status === STATUS_FINAL ? (
          <div className="flex justify-end border-t border-white/10 pt-3">
            <button
              type="button"
              className={TOMBOL}
              onClick={() => onCetak(data)}
            >
              Cetak lembar hasil
            </button>
          </div>
        ) : null}

        {bisaPutus || bisaBatal || bisaKoreksi ? (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <label htmlFor="kinerja-alasan" className={LABEL}>
              Alasan (wajib untuk Kembalikan, Batal, dan koreksi)
            </label>
            <textarea
              id="kinerja-alasan"
              rows={2}
              maxLength={1000}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              className={`${INPUT} py-2`}
            />
            <div className="flex flex-wrap justify-end gap-2">
              {bisaPutus ? (
                <>
                  <button
                    type="button"
                    data-konfirmasi
                    className={TOMBOL}
                    disabled={menyimpan}
                    onClick={() =>
                      void putuskan("Kembalikan", "Penilaian dikembalikan.")
                    }
                  >
                    Kembalikan
                  </button>
                  <button
                    type="button"
                    data-konfirmasi
                    className={TOMBOL_UTAMA}
                    disabled={menyimpan}
                    onClick={() => void putuskan("Final", "Penilaian final.")}
                  >
                    Final
                  </button>
                </>
              ) : null}
              {bisaBatal ? (
                <button
                  type="button"
                  data-konfirmasi
                  className={TOMBOL}
                  disabled={menyimpan}
                  onClick={() =>
                    void putuskan("Batal", "Penilaian dibatalkan.")
                  }
                >
                  Batalkan penilaian
                </button>
              ) : null}
              {bisaKoreksi ? (
                <button
                  type="button"
                  data-konfirmasi
                  className={TOMBOL}
                  disabled={menyimpan}
                  onClick={() => void buatKoreksi()}
                >
                  Buat koreksi
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {data.sp.length > 0 ? (
          <div className="space-y-1 border-t border-white/10 pt-3 text-sm text-slate-300">
            <p className="font-semibold text-white">
              SP berlaku dalam periode (informasi, tidak mengubah nilai)
            </p>
            <ul className="space-y-1">
              {data.sp.map((s) => (
                <li key={s.id_sp}>
                  {s.tingkat} {s.nomor ? `${s.nomor} ` : ""}({s.tanggal} s.d.{" "}
                  {s.berlaku_sampai}): {s.pelanggaran}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.keluarga.length > 1 ? (
          <div className="space-y-1 border-t border-white/10 pt-3 text-sm text-slate-300">
            <p className="font-semibold text-white">Riwayat koreksi</p>
            <ul className="space-y-1">
              {data.keluarga.map((k) => (
                <li
                  key={k.id_penilaian}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span>{k.id_ref ? "Koreksi" : "Penilaian awal"}</span>
                  <Lencana status={k.status} />
                  <span className="tabular-nums">
                    {nilaiTampil(k.nilai_akhir, k.predikat)}
                  </span>
                  {k.berlaku ? (
                    <span className="text-xs text-emerald-200">Berlaku</span>
                  ) : null}
                  {k.id_penilaian === id ? (
                    <span className="text-xs text-slate-400">dibuka</span>
                  ) : (
                    <button
                      type="button"
                      className={TOMBOL}
                      onClick={() => setId(k.id_penilaian)}
                    >
                      Buka
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** Tab Kinerja di rincian pegawai (`hr.performance.view`): riwayat per periode. */
export function KinerjaPegawai({ idKaryawan }: { idKaryawan: string }) {
  const [data, setData] = useState<RiwayatKinerja | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    muatRiwayatKinerja(idKaryawan)
      .then(setData)
      .catch((error) => setGalat(pesanGalat(error)));
  }, [idKaryawan]);

  if (galat) {
    return (
      <p className="text-sm text-rose-300" role="alert">
        {galat}
      </p>
    );
  }
  if (!data) return <p className="text-sm text-slate-400">Memuat…</p>;
  if (data.penilaian.length === 0) {
    return (
      <p className="text-sm text-slate-400">Belum ada penilaian kinerja.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {data.penilaian.map((p) => (
        <li
          key={p.id_penilaian}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3 text-sm text-slate-300"
        >
          <span className="font-semibold text-white">{p.periode_nama}</span>
          {p.id_ref ? <span>koreksi</span> : null}
          <Lencana status={p.status} />
          <span className="tabular-nums">
            {nilaiTampil(p.nilai_akhir ?? null, p.predikat ?? null)}
          </span>
          {p.berlaku ? (
            <span className="text-xs text-emerald-200">Berlaku</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
