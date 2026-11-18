import { describe, expect, test } from "bun:test";
import type { RekapBeban, SetupSurat } from "@/lib/validations/hr-beban";
import {
  type BarisNilai,
  type PenilaianKinerja,
  TIPE_MANUAL,
} from "@/lib/validations/hr-kinerja";
import bawaan from "@/lib/validations/hr-surat-bawaan.json";
import {
  barisSkPtm,
  dasarSurat,
  gabungJabatan,
  type IsianLembarKinerja,
  kepalaUnit,
  ketuaYayasan,
  lembarKinerja,
  nomorSurat,
  romawi,
  suratKeteranganAktif,
  suratPembagianTugas,
  suratPemberhentian,
  suratPengalamanKerja,
  suratPengangkatan,
  suratPeringatan,
  suratTugasLuar,
  suratTugasTambahan,
  tanggalWibDari,
  unitSkTugas,
  uraiDasar,
} from "./suratKepegawaian";

const JAHAT = `<script>"&'`;

function setup(isi: Partial<SetupSurat> = {}): SetupSurat {
  return {
    kop: {},
    pengaturan: {},
    kepala: [],
    pegawai: [],
    status: [],
    tanggal: "2026-11-15",
    hari_ini: "2026-11-15",
    ...isi,
  };
}

describe("nomorSurat", () => {
  const isian = {
    urut: " 012 ",
    kode: "SK-PTM",
    unit: "SMP",
    tanggal: "2026-11-15",
  };

  test("pola bawaan dan setiap token", () => {
    expect(nomorSurat("", isian)).toEqual({
      ok: true,
      nilai: "012/SK-PTM/SMP/XI/2026",
    });
    expect(nomorSurat("{tahun}-{romawi}-{urut}", isian)).toEqual({
      ok: true,
      nilai: "2026-XI-012",
    });
  });

  test("Romawi tiap bulan", () => {
    expect([1, 4, 9, 12].map(romawi)).toEqual(["I", "IV", "IX", "XII"]);
    expect(romawi(0)).toBe("");
    expect(romawi(13)).toBe("");
    expect(
      nomorSurat("{urut}/{romawi}", { ...isian, tanggal: "2026-01-02" }),
    ).toEqual({ ok: true, nilai: "012/I" });
  });

  test("pola tanpa {urut} ditolak", () => {
    expect(nomorSurat("SK/{kode}/{tahun}", isian)).toEqual({
      ok: false,
      galat: "Pola nomor wajib memuat {urut}.",
    });
  });

  test("token kosong tidak meninggalkan garis miring ganda", () => {
    expect(nomorSurat("", { ...isian, unit: "", urut: "" })).toEqual({
      ok: true,
      nilai: "SK-PTM/XI/2026",
    });
    expect(nomorSurat("", { ...isian, tanggal: "rusak" })).toEqual({
      ok: true,
      nilai: "012/SK-PTM/SMP",
    });
  });
});

describe("penanda tangan dan dasar", () => {
  const kepala = {
    kunci_unit: "smp",
    unit: "SMP",
    id_karyawan: "K1",
    nama: "Ani",
    gelar: "S.Pd.",
    nip: "1980",
  };

  test("kepala unit, cadangan profil sekolah, lalu kosong", () => {
    expect(kepalaUnit(setup({ kepala: [kepala] }), " SMP ")).toEqual({
      jabatan: "Kepala SMP",
      nama: "Ani, S.Pd.",
      nip: "1980",
    });
    const profil = setup({
      kepala: [kepala],
      kop: { kepala_nama: "Pak Budi", kepala_jabatan: "Kepala Sekolah" },
    });
    expect(kepalaUnit(profil, "SD")).toEqual({
      jabatan: "Kepala Sekolah",
      nama: "Pak Budi",
      nip: "",
    });
    expect(kepalaUnit(setup(), "SD")).toEqual({
      jabatan: "Kepala SD",
      nama: "",
      nip: "",
    });
  });

  test("jabatan + lembaga tanpa kata ganda", () => {
    expect(gabungJabatan("Ketua Yayasan", "Yayasan Pendidikan X")).toBe(
      "Ketua Yayasan Pendidikan X",
    );
    expect(gabungJabatan("Kepala SMA", "sma Contoh")).toBe("Kepala sma Contoh");
    expect(gabungJabatan("Ketua Pengurus", "Yayasan X")).toBe(
      "Ketua Pengurus Yayasan X",
    );
    expect(gabungJabatan("Kepala Sekolah", "")).toBe("Kepala Sekolah");
  });

  test("ketua yayasan dari pengaturan", () => {
    expect(ketuaYayasan(setup())).toEqual({
      jabatan: "Ketua Yayasan",
      nama: "",
      nip: "",
    });
  });

  test("teks dasar: pengaturan, kosong = bawaan", () => {
    expect(dasarSurat(setup(), "ptm")).toBe(bawaan.ptm);
    expect(
      dasarSurat(setup({ pengaturan: { "hr_surat_dasar:ptm": "x" } }), "ptm"),
    ).toBe("x");
    expect(uraiDasar("a\n\n b \n---\n1\n")).toEqual({
      menimbang: ["a", "b"],
      mengingat: ["1"],
    });
    expect(uraiDasar("a")).toEqual({ menimbang: ["a"], mengingat: [] });
    for (const jenis of ["ptm", "tugas", "angkat"] as const) {
      const d = uraiDasar(bawaan[jenis]);
      expect(d.menimbang.length).toBeGreaterThan(0);
      expect(d.mengingat.length).toBeGreaterThan(0);
    }
  });
});

const rekap = (isi: Partial<RekapBeban>): RekapBeban => ({
  id_unik: "G1",
  nama: "Ani",
  gelar: "",
  nip: "",
  nuptk: "",
  unit: "SMP",
  status: "",
  aktif: true,
  jp_tatap_muka: 0,
  jp_tugas: 0,
  total: 0,
  mapel: [],
  per_unit: [],
  tugas: [],
  jam_rusak: [],
  tanda: [],
  ...isi,
});

const mapel = (nama_rombel: string, unit: string, jp: number) => ({
  id_rombel: nama_rombel,
  nama_rombel,
  id_mapel: "MTK",
  nama_mapel: "Matematika",
  unit,
  jp,
  jp_penugasan: null,
});

const tugas = (nama_jenis: string, unit: string, ekuivalen_jp: number) => ({
  id_tugas: nama_jenis,
  id_karyawan: "G1",
  id_jenis: nama_jenis,
  nama_jenis,
  ekuivalen_jp,
  unit,
  nama_rombel: "",
  nomor_sk: "",
  tanggal_sk: "",
});

describe("barisSkPtm (per unit rombel)", () => {
  const dua = rekap({
    unit: "SMP",
    jp_tatap_muka: 10,
    mapel: [mapel("7A", "SMP", 6), mapel("10A", "SMA", 4)],
    per_unit: [
      { unit: "SMA", jp: 4 },
      { unit: "SMP", jp: 6 },
    ],
    tugas: [tugas("Piket", "", 1), tugas("Kalab", "SMA", 12)],
  });

  test("guru dua unit muncul di dua SK dengan JP unit itu", () => {
    const smp = barisSkPtm([dua], "smp");
    expect(smp[0].mapel.map((m) => m.nama_rombel)).toEqual(["7A"]);
    expect([smp[0].jp_tatap_muka, smp[0].jp_tugas, smp[0].total]).toEqual([
      6, 1, 7,
    ]);
    const sma = barisSkPtm([dua], "SMA");
    expect([sma[0].jp_tatap_muka, sma[0].jp_tugas, sma[0].total]).toEqual([
      4, 12, 16,
    ]);
    const semua = barisSkPtm([dua], "");
    expect([semua[0].jp_tatap_muka, semua[0].jp_tugas]).toEqual([10, 13]);
  });

  test("guru tanpa jadwal dan tugas di unit itu tidak ikut", () => {
    expect(barisSkPtm([dua], "SD")).toEqual([]);
  });

  test("unit SK tugas: unit bersama, berbeda atau kosong = yayasan", () => {
    const t = {
      id_karyawan: "G1",
      nama_jenis: "Piket",
      nama_rombel: "",
      ekuivalen_jp: 1,
      tahun_ajaran: "2026/2027",
      tanggal_mulai: "2026-07-13",
      tanggal_selesai: "",
    };
    expect(
      unitSkTugas([
        { ...t, unit: "SMP" },
        { ...t, unit: " smp" },
      ]),
    ).toBe("SMP");
    expect(
      unitSkTugas([
        { ...t, unit: "SMP" },
        { ...t, unit: "SD" },
      ]),
    ).toBe("");
    expect(unitSkTugas([{ ...t, unit: "" }])).toBe("");
  });
});

describe("templat: nilai di-escape, data kosong tanpa 'undefined'", () => {
  const kosong = { setup: setup(), nomor: "", tanggal: "" };
  const jahatSetup = setup({
    kop: {
      nama: JAHAT,
      alamat: JAHAT,
      kepala_nama: JAHAT,
      logo_url: JAHAT,
    },
    pengaturan: {
      hr_surat_kota: JAHAT,
      hr_surat_yayasan_ketua: JAHAT,
      hr_surat_yayasan_nama: JAHAT,
      "hr_surat_dasar:ptm": `${JAHAT}\n---\n${JAHAT}`,
      "hr_surat_dasar:tugas": JAHAT,
      "hr_surat_dasar:angkat": JAHAT,
    },
    kepala: [
      {
        kunci_unit: JAHAT.toLowerCase(),
        unit: JAHAT,
        id_karyawan: "K",
        nama: JAHAT,
        gelar: JAHAT,
        nip: JAHAT,
      },
    ],
    pegawai: [
      {
        id_unik: "G1",
        nama: JAHAT,
        gelar: JAHAT,
        nip: JAHAT,
        nuptk: JAHAT,
        jabatan: JAHAT,
        unit: JAHAT,
        tmt: "2020-01-01",
        guru: 1,
      },
    ],
    status: [{ id_unik: "G1", status: JAHAT }],
  });
  const jahat = { setup: jahatSetup, nomor: JAHAT, tanggal: "2026-11-15" };
  const semester = {
    id_tahun_ajaran: "ta",
    nama_tahun: JAHAT,
    semester: JAHAT,
    tanggal_mulai: "",
    tanggal_selesai: "",
    is_aktif: 1,
  };
  const tugasSk = {
    id_karyawan: "G1",
    nama_jenis: JAHAT,
    unit: JAHAT,
    nama_rombel: JAHAT,
    ekuivalen_jp: 2,
    tahun_ajaran: JAHAT,
    tanggal_mulai: "2026-07-13",
    tanggal_selesai: "",
  };
  const isiRekap = rekap({
    nama: JAHAT,
    gelar: JAHAT,
    nip: JAHAT,
    unit: JAHAT,
    mapel: [{ ...mapel(JAHAT, JAHAT, 2), nama_mapel: JAHAT }],
    per_unit: [{ unit: JAHAT, jp: 2 }],
    tugas: [{ ...tugas(JAHAT, JAHAT, 2), nama_rombel: JAHAT }],
  });

  const bentuk = (d: typeof kosong) => [
    suratPembagianTugas(d, {
      unit: d === kosong ? "" : JAHAT,
      semester:
        d === kosong ? { ...semester, nama_tahun: "", semester: "" } : semester,
      rekap: d === kosong ? [] : [isiRekap],
    }),
    suratTugasTambahan(
      d,
      d === kosong ? [{ ...tugasSk, nama_jenis: "", unit: "" }] : [tugasSk],
    ),
    suratTugasTambahan(d, [tugasSk, { ...tugasSk, id_karyawan: "X" }]),
    suratPengangkatan(d, { id_karyawan: "G1", status: JAHAT, tmt: "" }),
    suratTugasLuar(d, {
      id_karyawan: "G1",
      tanggal_mulai: "2026-11-16",
      tanggal_selesai: "2026-11-17",
      keperluan: d === kosong ? "" : JAHAT,
      tujuan: d === kosong ? "" : JAHAT,
      penyelenggara: d === kosong ? "" : JAHAT,
    }),
    suratKeteranganAktif(d, {
      id_karyawan: "G1",
      mapel: d === kosong ? [] : [JAHAT],
    }),
    ...[suratPemberhentian, suratPengalamanKerja].map((rakit) =>
      rakit(d, {
        id_karyawan: "G1",
        status_kepegawaian: d === kosong ? "GTY" : JAHAT,
        masa_kerja_mulai: d === kosong ? "" : "2020-07-01",
        tanggal_terakhir: d === kosong ? "" : "2026-06-30",
        alasan_nama: d === kosong ? "" : JAHAT,
      }),
    ),
    ...["SP1", "SP3"].map((tingkat) =>
      suratPeringatan(d, {
        id_karyawan: "G1",
        tingkat,
        tanggal: "2026-01-10",
        berlaku_sampai: "2026-07-09",
        pelanggaran:
          d === kosong
            ? ""
            : `${JAHAT}
${JAHAT}`,
        harapan: d === kosong ? "" : JAHAT,
        penanda:
          d === kosong
            ? { nama: "", jabatan: "", nip: "" }
            : { nama: JAHAT, jabatan: JAHAT, nip: JAHAT },
        alasan_cabut: d === kosong ? null : JAHAT,
      }),
    ),
  ];

  test("setiap nilai di-escape", () => {
    for (const html of bentuk(jahat)) {
      expect(html).not.toContain("<script>");
      expect(html).not.toContain(`"&'`);
      expect(html).toContain("&lt;script&gt;&quot;&amp;");
    }
  });

  test("data kosong tidak menghasilkan undefined/null/NaN", () => {
    for (const html of bentuk(kosong)) {
      expect(html).not.toMatch(/undefined|null|NaN/);
    }
  });

  test("SP: tingkat, masa berlaku, tanda DICABUT, dan kolom tanda terima", () => {
    const [sp1, sp3] = bentuk(kosong).slice(-2);
    expect(sp1).toContain("SURAT PERINGATAN PERTAMA (SP1)");
    expect(sp1).toContain("10 Januari 2026 sampai dengan 9 Juli 2026");
    expect(sp1).toContain("Diterima oleh,");
    expect(sp1).not.toContain("DICABUT");
    expect(sp3).toContain("peringatan terakhir");
    const [, dicabut] = bentuk(jahat).slice(-2);
    expect(dicabut).toContain("<strong>DICABUT</strong>");
    expect(dicabut).toContain("&lt;script&gt;&quot;&amp;'<br>&lt;script&gt;");
  });

  test("surat keluar: penanda tangan, masa kerja, tanpa pesangon", () => {
    const isian = {
      id_karyawan: "G1",
      status_kepegawaian: "GTY",
      masa_kerja_mulai: "2020-07-01",
      tanggal_terakhir: "2026-06-30",
      alasan_nama: "Mengundurkan Diri",
    };
    const d = {
      setup: setup({
        pengaturan: { hr_surat_yayasan_ketua: "Ketua Uji" },
      }),
      nomor: "001/SK-BERHENTI/2026",
      tanggal: "2026-07-01",
    };
    const sk = suratPemberhentian(d, isian);
    expect(sk).toContain("PEMBERHENTIAN GURU TETAP YAYASAN");
    expect(sk).toContain("30 Juni 2026");
    expect(sk).toContain("mengundurkan diri");
    expect(sk).toContain("Ketua Uji");
    // Menimbang/Mengingat SK Pemberhentian selalu teks bawaan.
    expect(sk).toContain("Pemutusan Hubungan Kerja");
    const ket = suratPengalamanKerja(d, isian);
    expect(ket).toContain("SURAT KETERANGAN PENGALAMAN KERJA");
    expect(ket).toContain("6 tahun");
    expect(ket).not.toContain("Mengundurkan Diri");
    for (const html of [sk, ket]) {
      expect(html).not.toMatch(/UPMK|pesangon|Rp/);
    }
  });

  test("teks bawaan tercetak saat pengaturan kosong", () => {
    const [ptm] = bentuk(kosong);
    expect(ptm).toContain("Sistem Pendidikan Nasional");
    expect(ptm).toContain('<ol type="a">');
  });
});

describe("lembarKinerja (Fase 5c)", () => {
  const kepala = {
    kunci_unit: "smp",
    unit: "SMP",
    id_karyawan: "K1",
    nama: "Ani",
    gelar: "S.Pd.",
    nip: "1980",
  };
  const penilaian = (
    isi: Partial<PenilaianKinerja> = {},
  ): PenilaianKinerja => ({
    id_penilaian: "knj-1",
    id_karyawan: "G1",
    nama: "Guru Satu",
    id_ref: "",
    alasan_koreksi: "",
    periode_jenis: "Semester",
    periode_kunci: "ta-2",
    periode_nama: "2023/2024 Semester Genap",
    periode_mulai: "2024-01-08",
    periode_selesai: "2024-01-19",
    id_template: "ktp-guru",
    template_nama: "Kinerja Guru",
    kelompok: "Guru",
    unit: "SMP",
    jabatan: "Guru Mapel",
    status_kepegawaian: "GTY",
    id_penilai: "K1",
    penilai_nama: "Ani",
    penilai_oleh: "kepsek",
    catatan: "",
    dihitung_sampai: "2024-01-19",
    dibuat_oleh: "kepsek",
    created_at: "x",
    updated_at: "x",
    ...isi,
  });
  const baris = (isi: Partial<BarisNilai>): BarisNilai => ({
    id_aspek: "a",
    aspek_nama: "Aspek",
    tipe: TIPE_MANUAL,
    bobot: 10,
    urutan: 0,
    skor: 4,
    skor_hitung: null,
    catatan: null,
    rincian: null,
    ...isi,
  });
  const nilai: BarisNilai[] = [
    baris({
      id_aspek: "k",
      aspek_nama: "Kehadiran",
      tipe: "Otomatis Kehadiran",
      skor: 3,
      skor_hitung: 3,
      rincian: "K|9|7|1|1|0|0|833|950,900,800,700|2024-01-19",
    }),
    baris({
      id_aspek: "pk",
      aspek_nama: "Keterisian presensi kelas",
      tipe: "Otomatis Presensi Kelas",
      skor: 4,
      skor_hitung: 3,
      catatan: "PTS tidak dicatat",
      rincian: "PK|9|2|6|1|1|857|950,900,800,700|2024-01-19",
    }),
    baris({
      id_aspek: "j",
      aspek_nama: "Kelengkapan jurnal",
      tipe: "Otomatis Jurnal",
      skor: 3,
      skor_hitung: 3,
      rincian: "J|6|5|833|950,900,800,700|2024-01-19",
    }),
    baris({ id_aspek: "m", aspek_nama: "Supervisi", bobot: 70 }),
  ];
  const isian = (
    isi: Partial<IsianLembarKinerja> = {},
  ): IsianLembarKinerja => ({
    penilaian: penilaian(),
    status: "Final",
    nilai,
    nilai_akhir: 7000,
    predikat: "Cukup",
    rentang: { mulai: "2024-01-08", akhir: "2024-01-19", penuh: true },
    ...isi,
  });
  const dasar = (isi: Partial<SetupSurat> = {}) => ({
    setup: setup({
      kepala: [kepala],
      pengaturan: {
        hr_surat_kota: "Bandung",
        hr_surat_yayasan_ketua: "Pak Ketua",
        hr_surat_yayasan_nama: "Yayasan Contoh",
      },
      pegawai: [
        {
          id_unik: "G1",
          nama: "Guru Satu",
          gelar: "S.Pd.",
          nip: "1990",
          nuptk: "123",
          jabatan: "Guru",
          unit: "SMP",
          tmt: "2020-01-01",
          guru: 1,
        },
      ],
      status: [{ id_unik: "G1", status: "GTY" }],
      ...isi,
    }),
    nomor: "",
    tanggal: "2024-01-22",
  });

  test("tanggal Final UTC dibaca sebagai tanggal WIB", () => {
    expect(tanggalWibDari("2024-01-21 18:30:00")).toBe("2024-01-22");
    expect(tanggalWibDari("2024-01-21 16:59:59")).toBe("2024-01-21");
    expect(tanggalWibDari("rusak")).toBe("");
  });

  test("hanya penilaian Final", () => {
    expect(() => lembarKinerja(dasar(), isian({ status: "Diajukan" }))).toThrow(
      "Hanya penilaian Final yang bisa dicetak.",
    );
  });

  test("rumus aspek otomatis dari rincian beku, termasuk dihitung sampai", () => {
    const html = lembarKinerja(dasar(), isian());
    expect(html).toContain("LEMBAR HASIL PENILAIAN KINERJA GURU");
    expect(html).toContain(
      "(2 × tepat 7 + terlambat 1) ÷ (2 × 9 hari wajib) = 83,3%",
    );
    expect(html).toContain("presensi terisi 6 ÷ 7 JP terjadwal = 85,7%");
    expect(html).toContain("1 belum ditangani");
    expect(html).toContain("JP berjurnal 5 ÷ 6 JP terisi = 83,3%");
    expect(html).toContain("Dihitung sampai 19 Januari 2024.");
    expect(html).toContain("Hitungan 3, diubah penilai. PTS tidak dicatat");
    expect(html).toContain("<strong>70,00</strong>");
    expect(html).toContain("Cukup");
    expect(html).toContain("Bandung, 22 Januari 2024");
    expect(html).toContain("NUPTK");
    expect(html).not.toContain("KOREKSI");
  });

  test("penilai kepala unit: mengetahui ketua yayasan; selain itu kepala unit", () => {
    const sendiri = lembarKinerja(dasar(), isian());
    expect(sendiri).toContain("Mengetahui, Ketua Yayasan Contoh");
    expect(sendiri).toContain("Pak Ketua");
    const wakil = lembarKinerja(
      dasar(),
      isian({
        penilaian: penilaian({ id_penilai: "W1", penilai_nama: "Wakasek" }),
      }),
    );
    expect(wakil).toContain("Mengetahui, Kepala SMP");
    expect(wakil).toContain("Ani, S.Pd.");
  });

  test("koreksi dan periode tidak penuh", () => {
    const html = lembarKinerja(
      dasar(),
      isian({
        penilaian: penilaian({
          id_ref: "knj-0",
          alasan_koreksi: "absensi dikoreksi",
        }),
        rentang: { mulai: "2024-01-10", akhir: "2024-01-19", penuh: false },
      }),
    );
    expect(html).toContain(
      "<strong>KOREKSI</strong> atas penilaian sebelumnya: absensi dikoreksi",
    );
    expect(html).toContain("Masa aktif dinilai");
    expect(html).toContain("10 Januari 2024 s.d. 19 Januari 2024");
  });

  test("D = 0 dan data kosong tidak merusak lembar", () => {
    const html = lembarKinerja(
      setupKosong(),
      isian({
        penilaian: penilaian({ kelompok: "Tendik", unit: "", id_penilai: "" }),
        nilai: [
          baris({
            aspek_nama: "Kehadiran",
            tipe: "Otomatis Kehadiran",
            skor: 4,
            catatan: "manual",
            rincian: "K|0|0|0|0|0|0||950,900,800,700|2024-01-19",
          }),
        ],
        nilai_akhir: null,
        predikat: null,
        rentang: null,
      }),
    );
    expect(html).toContain("TENAGA KEPENDIDIKAN");
    expect(html).toContain("tidak bisa dihitung, skor diisi penilai");
    expect(html).not.toContain("NUPTK");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  test("nilai jahat di-escape", () => {
    const html = lembarKinerja(
      dasar({ pengaturan: { hr_surat_kota: JAHAT } }),
      isian({
        penilaian: penilaian({
          nama: JAHAT,
          id_karyawan: "X",
          catatan: JAHAT,
          template_nama: JAHAT,
          penilai_nama: JAHAT,
          periode_nama: JAHAT,
          id_ref: "knj-0",
          alasan_koreksi: JAHAT,
        }),
        nilai: [baris({ aspek_nama: JAHAT, catatan: JAHAT })],
        predikat: JAHAT,
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;&quot;&amp;");
  });
});

function setupKosong() {
  return { setup: setup(), nomor: "", tanggal: "" };
}
