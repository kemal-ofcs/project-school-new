import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import {
  LABEL_SEKOLAH_BELUM_DIISI,
  namaTampil,
  readProgramStudi,
  readSchoolProfile,
} from "./school-profile";

/**
 * Query-nya benar-benar dijalankan SQLite, bukan di-mock.
 *
 * Itu intinya: setiap nama kolom di modul ini berasal dari DDL milik jalur
 * provisioning lain, dan salah ketik satu kolom hanyalah teks di dalam string
 * bagi lint maupun typecheck. `audit:sql` menangkapnya di tingkat repo; tes ini
 * menangkapnya lebih dekat ke kodenya, lengkap dengan perilaku hasilnya.
 */
function databaseDenganSkema() {
  const client = createClient({ url: ":memory:" });
  return client;
}

async function pasangSkema(client: ReturnType<typeof databaseDenganSkema>) {
  // Bentuk kolomnya disalin dari `db-migrations.ts` / `turso.rs`. Kalau di sana
  // berubah, tes ini tetap lulus tetapi `audit:sql` akan gagal terhadap skema
  // sungguhan — dua jaring dengan jangkauan berbeda, dan itu disengaja.
  await client.execute(`
    CREATE TABLE company_profile (
      id TEXT PRIMARY KEY DEFAULT 'default_company',
      company_name TEXT NOT NULL DEFAULT 'YOUR COMPANY',
      branch_name TEXT,
      logo_url TEXT,
      signature_url TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      leader_name TEXT,
      leader_title TEXT,
      leader_nip TEXT,
      card_terms TEXT,
      timezone TEXT DEFAULT 'Asia/Jakarta',
      updated_at TEXT NOT NULL
    );
  `);
  await client.execute(
    "CREATE TABLE setting_gex_system (key TEXT PRIMARY KEY, value TEXT);",
  );
  await client.execute(`
    CREATE TABLE akademik_jurusan (
      id_jurusan TEXT PRIMARY KEY,
      kode_jurusan TEXT NOT NULL,
      nama_jurusan TEXT NOT NULL,
      deskripsi TEXT,
      is_aktif INTEGER NOT NULL DEFAULT 1 CHECK (is_aktif IN (0, 1))
    );
  `);
}

describe("readSchoolProfile", () => {
  test("profil yang belum ada barisnya dilaporkan, bukan dibuatkan", async () => {
    const client = databaseDenganSkema();
    await pasangSkema(client);

    const profil = await readSchoolProfile(client);

    expect(profil.belumDikonfigurasi).toBe(true);
    expect(profil.namaSekolah).toBeNull();

    // `company_profile` ikut SNAPSHOT_TABLES. Satu INSERT dari situs publik
    // akan menaikkan `sync_pulse` dan ditarik ke SQLite setiap perangkat,
    // termasuk setiap terminal pemindai.
    const isi = await client.execute(
      "SELECT COUNT(*) AS total FROM company_profile;",
    );
    expect(Number(isi.rows[0]?.total)).toBe(0);
  });

  test("nilai placeholder template diperlakukan sebagai belum diisi", async () => {
    const client = databaseDenganSkema();
    await pasangSkema(client);
    await client.execute(`
      INSERT INTO company_profile (id, company_name, address, phone, email, updated_at)
      VALUES ('default_company', 'YOUR COMPANY', 'Your Company Address', '-',
              'info@yourcompany.com', datetime('now'));
    `);

    const profil = await readSchoolProfile(client);

    // Barisnya ADA, jadi ini bukan "belum dikonfigurasi" dalam arti kosong —
    // tetapi tidak satu pun nilainya boleh muncul di halaman publik.
    expect(profil.belumDikonfigurasi).toBe(false);
    expect(profil.namaSekolah).toBeNull();
    expect(profil.alamat).toBeNull();
    expect(profil.telepon).toBeNull();
    expect(profil.email).toBeNull();
    expect(namaTampil(profil)).toBe(LABEL_SEKOLAH_BELUM_DIISI);
  });

  test("profil terisi dibaca apa adanya", async () => {
    const client = databaseDenganSkema();
    await pasangSkema(client);
    await client.execute(`
      INSERT INTO company_profile
        (id, company_name, branch_name, address, phone, email, website,
         leader_name, leader_title, updated_at)
      VALUES ('default_company', 'SMK Nusantara', 'Kampus Utama',
              'Jl. Merdeka 10', '+6281200000000', 'humas@smknusantara.sch.id',
              'https://smknusantara.sch.id', 'Rina Hartati', 'Kepala Sekolah',
              datetime('now'));
    `);
    await client.execute(
      "INSERT INTO setting_gex_system (key, value) VALUES ('app_display_name', 'Manajemen Sekolah');",
    );

    const profil = await readSchoolProfile(client);

    expect(profil.namaSekolah).toBe("SMK Nusantara");
    expect(profil.namaCabang).toBe("Kampus Utama");
    expect(profil.namaPimpinan).toBe("Rina Hartati");
    expect(profil.namaAplikasi).toBe("Manajemen Sekolah");
    expect(namaTampil(profil)).toBe("SMK Nusantara");
  });

  test("kolom kosong dan spasi kosong menjadi null, bukan string kosong", async () => {
    const client = databaseDenganSkema();
    await pasangSkema(client);
    await client.execute(`
      INSERT INTO company_profile (id, company_name, branch_name, address, updated_at)
      VALUES ('default_company', 'SMP Harapan', '   ', '', datetime('now'));
    `);

    const profil = await readSchoolProfile(client);

    expect(profil.namaSekolah).toBe("SMP Harapan");
    expect(profil.namaCabang).toBeNull();
    expect(profil.alamat).toBeNull();
  });
});

describe("readProgramStudi", () => {
  test("hanya jurusan aktif, terurut nama", async () => {
    const client = databaseDenganSkema();
    await pasangSkema(client);
    await client.execute(`
      INSERT INTO akademik_jurusan (id_jurusan, kode_jurusan, nama_jurusan, deskripsi, is_aktif)
      VALUES ('j2', 'TKJ', 'Teknik Komputer dan Jaringan', 'Jaringan dan perangkat keras', 1),
             ('j1', 'AKL', 'Akuntansi dan Keuangan Lembaga', NULL, 1),
             ('j3', 'LAMA', 'Jurusan Ditutup', 'Tidak menerima siswa baru', 0);
    `);

    const program = await readProgramStudi(client);

    expect(program.map((p) => p.kode)).toEqual(["AKL", "TKJ"]);
    expect(program[0]?.deskripsi).toBeNull();
    expect(program[1]?.deskripsi).toBe("Jaringan dan perangkat keras");
  });

  test("batas dihormati", async () => {
    const client = databaseDenganSkema();
    await pasangSkema(client);
    for (let index = 0; index < 5; index++) {
      await client.execute({
        sql: "INSERT INTO akademik_jurusan (id_jurusan, kode_jurusan, nama_jurusan, is_aktif) VALUES (?, ?, ?, 1);",
        args: [`j${index}`, `K${index}`, `Jurusan ${index}`],
      });
    }

    expect((await readProgramStudi(client, 2)).length).toBe(2);
  });

  test("tabel kosong menghasilkan daftar kosong, bukan error", async () => {
    const client = databaseDenganSkema();
    await pasangSkema(client);

    expect(await readProgramStudi(client)).toEqual([]);
  });
});
