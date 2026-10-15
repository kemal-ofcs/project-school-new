---
description: Merapikan komentar kode dan teks antarmuka pada berkas yang baru diubah di repo Manajemen Sekolah memakai aturan antislop, lalu menulis ringkasannya ke `.claude/ANTISLOP.md`
---

# Workflow: antislop

Jalankan seluruh prosedur dari skill [jalankan-antislop](file:///c:/fr/project-school-new/.agents/skills/jalankan-antislop/SKILL.md):

## Langkah Eksekusi

1. **Tentukan Cakupan Berkas yang Berubah:**
   Jalankan dua perintah ini dari root repository dan gabungkan hasilnya:
   ```bash
   git diff --name-only
   git ls-files --others --exclude-standard
   ```

2. **Buang dari Cakupan (Dilewati):**
   - Berkas konfigurasi agent dan log: `CLAUDE.md`, semua isi `.agents/`, `.agent/`, `.claude/`, `graphify-out/`.
   - Direktori build dan dependensi: `node_modules/`, `out/`, `target/`, `gen/`.
   - Berkas kunci dan data: `*.lock`, `bun.lock*`, `package.json`, data JSON (`libur-nasional.json`, `akun-bawaan.json`), database `*.db`.
   - Salinan Mobile turunan: `mobile/src/lib/**` dan `mobile/src-tauri/src/mobile/**` yang dihasilkan skrip sinkronisasi. Jika ada yang perlu diubah, ubah padanannya di `web-desktop` lalu catat di ringkasan bahwa `bun run sync:mobile` harus dijalankan ulang.
   - Berkas tes (`*.test.ts`, `*.test.tsx`) dan modul tes Rust (`#[cfg(test)]`).

3. **Muat Aturan Antislop yang Relevan:**
   - Aturan inti: [antislop](file:///c:/fr/project-school-new/.agents/skills/antislop/SKILL.md)
   - Komentar kode: [antislop-code](file:///c:/fr/project-school-new/.agents/skills/antislop-code/SKILL.md)
   - Tampilan UI / CSS: [antislop-ui](file:///c:/fr/project-school-new/.agents/skills/antislop-ui/SKILL.md)
   - Teks, judul, pesan galat: [antislop-copywriting](file:///c:/fr/project-school-new/.agents/skills/antislop-copywriting/SKILL.md)
   - Tata letak ponsel: [antislop-layoutmobile](file:///c:/fr/project-school-new/.agents/skills/antislop-layoutmobile/SKILL.md)
   - Kontras dan fokus: [antislop-human](file:///c:/fr/project-school-new/.agents/skills/antislop-human/SKILL.md) (hanya laporkan, jangan ubah warna)

4. **Sunting dengan Batasan Ketat:**
   - **Boleh**: komentar bertele-tele / AI-slop, teks antarmuka berbahasa Indonesia yang generik atau kaku.
   - **Dilarang**: logika pemrograman, nama fungsi/variabel/tipe, query SQL, kunci JSON, kode galat (`VALIDATION_ERROR`, dll.), nilai enum atau status (`'Koreksi Admin'`, `'Menunggu'`, dll.), kunci storage/setting, dan teks yang diuji di test suite.
   - **Jangan hapus atau ubah**: penanda audit (`shortcut:`, `-- batas:`, `-- sengaja-utuh:`) dan urutan doc comment `///` sebelum `#[tauri::command]`.
   - **Jangan** jalankan `bun run check` dan **jangan** membuat commit git.

5. **Tulis / Timpa `.claude/ANTISLOP.md`:**
   Format sesuai template di [SKILL.md](file:///c:/fr/project-school-new/.agents/skills/jalankan-antislop/SKILL.md) (maksimal 40 baris):
   - Waktu (WIB), hash commit, jumlah berkas disunting.
   - Daftar berkas yang disunting dan ringkasan perubahannya.
   - Daftar berkas yang dilewati beserta alasannya.
   - Tindakan lanjutan / "Perlu tindakan" (jika ada).

6. **Balas ke Percakapan:**
   Maksimal 3 baris: status selesai/tidak, jumlah berkas disunting, dan instruksi bahwa langkah berikutnya adalah menjalankan skill `jalankan-check` (`/check`).
