import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import {
  GelombangTidakTerbukaError,
  KuotaPenuhError,
  readGelombangAktif,
  readStatusPendaftaran,
  tulisPendaftaran,
} from "./pmb";

/**
 * DDL di bawah disalin dari `db-migrations.ts` / `turso.rs`.
 *
 * Kesamaannya dijaga `bun run audit:schema` (yang menjalankan kedua jalur
 * provisioning dan membandingkan tabel yang NYATA terbentuk) dan
 * `bun run audit:sql` (yang meminta SQLite mem-`prepare` setiap query modul ini
 * terhadap skema sungguhan). Tes ini menambahkan lapisan ketiga: perilakunya —
 * CHECK constraint yang benar-benar menolak, UNIQUE yang benar-benar bentrok,
 * dan transaksi yang benar-benar utuh.
 */
async function siapkanDatabase() {
  const client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON;");
  await client.execute(`
    CREATE TABLE pmb_gelombang (
      id_gelombang TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      tahun_ajaran TEXT NOT NULL,
      tanggal_buka TEXT NOT NULL,
      tanggal_tutup TEXT NOT NULL,
      kuota INTEGER NOT NULL DEFAULT 0,
      biaya_pendaftaran INTEGER NOT NULL DEFAULT 0,
      is_aktif INTEGER NOT NULL DEFAULT 0 CHECK(is_aktif IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE pmb_pendaftar (
      id_pendaftar TEXT PRIMARY KEY,
      nomor_pendaftaran TEXT NOT NULL,
      id_gelombang TEXT NOT NULL,
      nama_lengkap TEXT NOT NULL,
      nisn TEXT,
      jenis_kelamin TEXT CHECK(jenis_kelamin IN ('L', 'P')),
      tempat_lahir TEXT,
      tanggal_lahir TEXT,
      asal_sekolah TEXT,
      alamat TEXT,
      nama_wali TEXT NOT NULL,
      no_whatsapp_wali TEXT NOT NULL,
      email_wali TEXT,
      pilihan_jurusan TEXT,
      status TEXT NOT NULL DEFAULT 'Baru'
        CHECK(status IN ('Baru', 'Berkas Lengkap', 'Terverifikasi',
                         'Diterima', 'Ditolak', 'Dibatalkan', 'Terdaftar')),
      catatan_verifikator TEXT,
      diverifikasi_oleh TEXT,
      diverifikasi_at TEXT,
      id_siswa TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE pmb_berkas (
      id_berkas TEXT PRIMARY KEY,
      id_pendaftar TEXT NOT NULL,
      jenis TEXT NOT NULL
        CHECK(jenis IN ('kartu_keluarga', 'akta_lahir', 'ijazah', 'rapor',
                        'foto', 'lainnya')),
      nama_file TEXT NOT NULL,
      mime TEXT NOT NULL
        CHECK(mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
      ukuran_byte INTEGER NOT NULL,
      konten_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (id_pendaftar) REFERENCES pmb_pendaftar(id_pendaftar)
        ON DELETE CASCADE
    );
  `);
  await client.execute(
    "CREATE UNIQUE INDEX idx_pmb_pendaftar_nomor ON pmb_pendaftar(nomor_pendaftaran);",
  );
  return client;
}

type Klien = Awaited<ReturnType<typeof siapkanDatabase>>;

/**
 * Gelombang aktif yang dijamin ada.
 *
 * Ditulis sebagai helper alih-alih `gelombang!` di setiap tes: tanda seru itu
 * mematikan pemeriksaan tipe, dan ketika query-nya suatu saat berhenti
 * mengembalikan baris, belasan tes akan gagal dengan "cannot read property of
 * null" alih-alih menunjuk penyebabnya.
 */
async function gelombangTerbuka(client: Klien) {
  const gelombang = await readGelombangAktif(client);
  if (!gelombang) throw new Error("Gelombang uji tidak terbaca.");
  return gelombang;
}

async function tambahGelombang(
  client: Klien,
  opsi: {
    id?: string;
    aktif?: boolean;
    kuota?: number;
    buka?: string;
    tutup?: string;
  } = {},
) {
  await client.execute({
    sql: `INSERT INTO pmb_gelombang (
            id_gelombang, nama, tahun_ajaran, tanggal_buka, tanggal_tutup,
            kuota, biaya_pendaftaran, is_aktif, created_at, updated_at
          ) VALUES (?, 'Gelombang 1', '2026/2027', ?, ?, ?, 0, ?,
                    datetime('now'), datetime('now'));`,
    args: [
      opsi.id ?? "gel-1",
      opsi.buka ?? "2000-01-01",
      opsi.tutup ?? "2999-12-31",
      opsi.kuota ?? 0,
      opsi.aktif === false ? 0 : 1,
    ],
  });
}

const MASUKAN = {
  namaLengkap: "Bagas Pratama",
  nisn: "0071234567",
  jenisKelamin: "L" as const,
  tempatLahir: "Bandung",
  tanggalLahir: "2010-05-17",
  asalSekolah: "SMP Negeri 3",
  alamat: "Jl. Kenanga 12",
  namaWali: "Sri Wahyuni",
  noWhatsappWali: "+6281200000000",
  emailWali: null,
  pilihanJurusan: "TKJ",
  berkas: [],
};

describe("readGelombangAktif", () => {
  test("gelombang yang dibuka dan masih dalam rentang tanggal ditemukan", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);

    const gelombang = await readGelombangAktif(client);

    expect(gelombang?.id).toBe("gel-1");
    expect(gelombang?.tahunAjaran).toBe("2026/2027");
  });

  test("gelombang nonaktif tidak dianggap terbuka", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client, { aktif: false });

    expect(await readGelombangAktif(client)).toBeNull();
  });

  test("gelombang yang sudah lewat tanggal tutupnya tidak dianggap terbuka", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client, {
      buka: "2000-01-01",
      tutup: "2000-12-31",
    });

    expect(await readGelombangAktif(client)).toBeNull();
  });

  test("gelombang yang belum dibuka tidak dianggap terbuka", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client, {
      buka: "2900-01-01",
      tutup: "2999-12-31",
    });

    expect(await readGelombangAktif(client)).toBeNull();
  });
});

describe("tulisPendaftaran", () => {
  test("menyimpan pendaftar dan mengembalikan nomornya", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);
    const gelombang = await gelombangTerbuka(client);

    const hasil = await tulisPendaftaran(client, gelombang, MASUKAN);

    expect(hasil.nomorPendaftaran).toMatch(/^PMB-2026-[A-Z0-9]{6}$/);
    expect(hasil.idPendaftar).toMatch(/^pmb-\d+-[0-9a-f]{12}$/);

    const baris = await client.execute(
      "SELECT status, nama_lengkap, no_whatsapp_wali FROM pmb_pendaftar;",
    );
    expect(baris.rows).toHaveLength(1);
    expect(baris.rows[0]?.status).toBe("Baru");
    expect(baris.rows[0]?.no_whatsapp_wali).toBe("+6281200000000");
  });

  test("berkas tersimpan bersama pendaftarnya", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);
    const gelombang = await gelombangTerbuka(client);

    await tulisPendaftaran(client, gelombang, {
      ...MASUKAN,
      berkas: [
        {
          jenis: "kartu_keluarga",
          namaFile: "kk.pdf",
          mime: "application/pdf",
          ukuranByte: 1024,
          kontenBase64: "AAAA",
        },
        {
          jenis: "foto",
          namaFile: "foto.jpg",
          mime: "image/jpeg",
          ukuranByte: 2048,
          kontenBase64: "BBBB",
        },
      ],
    });

    const berkas = await client.execute(
      "SELECT jenis FROM pmb_berkas ORDER BY jenis;",
    );
    expect(berkas.rows.map((b) => b.jenis)).toEqual(["foto", "kartu_keluarga"]);
  });

  test("berkas yang ditolak CHECK tidak menyisakan pendaftar setengah jadi", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);
    const gelombang = await gelombangTerbuka(client);

    // Zod SENGAJA dilewati di sini. Yang sedang diuji adalah batas yang
    // sebenarnya — database — karena validator bisa saja suatu hari melonggar
    // atau dilewati jalur lain, sementara CHECK constraint tidak.
    const berkasCacat = {
      jenis: "foto",
      namaFile: "a.jpg",
      mime: "image/gif",
      ukuranByte: 10,
      kontenBase64: "AA",
    } as unknown as (typeof MASUKAN)["berkas"][number];

    const gagal = tulisPendaftaran(client, gelombang, {
      ...MASUKAN,
      berkas: [berkasCacat],
    });

    await expect(gagal).rejects.toThrow();

    // Inti tes ini: batch("write") adalah SATU transaksi. Tanpa itu, pendaftar
    // tersimpan tanpa berkas dan sudah terlanjur memegang nomor pendaftaran,
    // sementara panitia melihat berkasnya tidak lengkap — dan pendaftarnya
    // tidak punya cara mengunggah ulang.
    const pendaftar = await client.execute(
      "SELECT COUNT(*) AS total FROM pmb_pendaftar;",
    );
    expect(Number(pendaftar.rows[0]?.total)).toBe(0);
  });

  test("kuota yang sudah terpenuhi menolak pendaftaran baru", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client, { kuota: 1 });
    const gelombang = await gelombangTerbuka(client);

    await tulisPendaftaran(client, gelombang, MASUKAN);

    await expect(
      tulisPendaftaran(client, gelombang, MASUKAN),
    ).rejects.toBeInstanceOf(KuotaPenuhError);
  });

  test("pendaftar yang ditolak tidak ikut menghabiskan kuota", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client, { kuota: 1 });
    const gelombang = await gelombangTerbuka(client);

    await tulisPendaftaran(client, gelombang, MASUKAN);
    await client.execute(
      "UPDATE pmb_pendaftar SET status = 'Ditolak' WHERE 1 = 1;",
    );

    // Kuota mengukur tempat yang terpakai, bukan formulir yang pernah masuk.
    const kedua = await tulisPendaftaran(client, gelombang, MASUKAN);
    expect(kedua.nomorPendaftaran).toBeTruthy();
  });

  test("nomor yang bentrok dicoba ulang, bukan dilempar", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);
    const gelombang = await gelombangTerbuka(client);

    // Urutan acak yang DISKRIP, bukan konstanta.
    //
    // Versi pertama tes ini memakai `() => 0.5` untuk empat belas panggilan
    // pertama, dengan maksud membuat nomor pendaftaran kedua bentrok. Yang
    // terjadi justru `id_pendaftar`-nya ikut identik — dan karena `sekarang`
    // tidak dipatok, tes itu lulus atau gagal tergantung apakah kedua INSERT
    // kebetulan jatuh pada milidetik yang sama. Ia lulus di Fase 5.2 dan gagal
    // di Fase 5.3 tanpa satu baris kode produksi pun berubah.
    //
    // Setiap percobaan menghabiskan 8 angka: 2 untuk `id_pendaftar`, 6 untuk
    // keenam karakter nomor pendaftaran. Urutan di bawah membuat pendaftaran
    // kedua memakai id BERBEDA tetapi nomor SAMA, yang persis kondisi yang
    // ingin diuji — bentrok nomor, bukan bentrok primary key.
    const urutan = [
      // Pendaftaran pertama: id A, nomor "AAAAAA".
      0.9, 0.1, 0, 0, 0, 0, 0, 0,
      // Pendaftaran kedua, percobaan 1: id B, nomor "AAAAAA" → bentrok.
      0.2, 0.7, 0, 0, 0, 0, 0, 0,
      // Percobaan 2: id C, nomor lain → berhasil.
      0.4, 0.3, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ];
    let langkah = 0;
    const acak = () => urutan[langkah++] ?? 0.123;

    // `sekarang` dipatok supaya id sepenuhnya ditentukan `urutan` di atas;
    // tanpa itu bagian waktunya ikut membedakan id dan tesnya berhenti menguji
    // apa pun.
    const opsi = { acak, sekarang: 1_700_000_000_000 };
    await tulisPendaftaran(client, gelombang, MASUKAN, opsi);
    const kedua = await tulisPendaftaran(client, gelombang, MASUKAN, opsi);

    expect(kedua.nomorPendaftaran).toBeTruthy();
    const jumlah = await client.execute(
      "SELECT COUNT(*) AS total FROM pmb_pendaftar;",
    );
    expect(Number(jumlah.rows[0]?.total)).toBe(2);
  });
});

describe("readStatusPendaftaran", () => {
  test("nomor dan tanggal lahir yang cocok mengembalikan statusnya", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);
    const gelombang = await gelombangTerbuka(client);
    const { nomorPendaftaran } = await tulisPendaftaran(
      client,
      gelombang,
      MASUKAN,
    );

    const status = await readStatusPendaftaran(client, {
      nomorPendaftaran,
      tanggalLahir: MASUKAN.tanggalLahir,
    });

    expect(status?.namaLengkap).toBe("Bagas Pratama");
    expect(status?.status).toBe("Baru");
    expect(status?.namaGelombang).toBe("Gelombang 1");
    expect(status?.jumlahBerkas).toBe(0);
  });

  test("tanggal lahir yang salah menghasilkan null, sama seperti nomor yang tidak ada", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);
    const gelombang = await gelombangTerbuka(client);
    const { nomorPendaftaran } = await tulisPendaftaran(
      client,
      gelombang,
      MASUKAN,
    );

    const salahTanggal = await readStatusPendaftaran(client, {
      nomorPendaftaran,
      tanggalLahir: "2011-01-01",
    });
    const nomorAsing = await readStatusPendaftaran(client, {
      nomorPendaftaran: "PMB-2026-ZZZZZZ",
      tanggalLahir: MASUKAN.tanggalLahir,
    });

    // Kedua kegagalan WAJIB tidak bisa dibedakan. Balasan yang berbeda cukup
    // untuk memetakan nomor mana yang terdaftar di sekolah ini.
    expect(salahTanggal).toBeNull();
    expect(nomorAsing).toBeNull();
  });

  test("nomor dicocokkan tanpa peduli huruf besar/kecil", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);
    const gelombang = await gelombangTerbuka(client);
    const { nomorPendaftaran } = await tulisPendaftaran(
      client,
      gelombang,
      MASUKAN,
    );

    const status = await readStatusPendaftaran(client, {
      nomorPendaftaran: nomorPendaftaran.toLowerCase(),
      tanggalLahir: MASUKAN.tanggalLahir,
    });

    expect(status?.nomorPendaftaran).toBe(nomorPendaftaran);
  });

  test("status tidak pernah membawa isi berkas", async () => {
    const client = await siapkanDatabase();
    await tambahGelombang(client);
    const gelombang = await gelombangTerbuka(client);
    const { nomorPendaftaran } = await tulisPendaftaran(client, gelombang, {
      ...MASUKAN,
      berkas: [
        {
          jenis: "ijazah",
          namaFile: "ijazah.pdf",
          mime: "application/pdf",
          ukuranByte: 400_000,
          kontenBase64: "X".repeat(1000),
        },
      ],
    });

    const status = await readStatusPendaftaran(client, {
      nomorPendaftaran,
      tanggalLahir: MASUKAN.tanggalLahir,
    });

    expect(status?.jumlahBerkas).toBe(1);
    expect(JSON.stringify(status)).not.toContain("XXXX");
  });
});

describe("GelombangTidakTerbukaError", () => {
  test("membawa status HTTP-nya sendiri", () => {
    expect(new GelombangTidakTerbukaError().status).toBe(409);
  });
});
