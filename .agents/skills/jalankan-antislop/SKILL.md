---
name: jalankan-antislop
description: Merapikan komentar kode dan teks antarmuka pada berkas yang baru diubah di repo Manajemen Sekolah memakai aturan antislop yang ada di repo, lalu menulis ringkasannya ke `.claude/ANTISLOP.md`. Gunakan setiap kali user menyebut antislop, "rapikan komentar", "bersihkan teks", atau "sebelum check". Jalankan SEBELUM skill `jalankan-check`.
---

# Jalankan antislop pada berkas yang berubah

Tugasmu: menyunting komentar dan teks yang dilihat pengguna pada berkas yang berubah. Jangan menyentuh logika. Jangan menjalankan `bun run check` dan jangan commit.

## Langkah

1. **Tentukan cakupan.** Jalankan dua perintah ini dari root repo dan gabungkan hasilnya:

   ```bash
   git diff --name-only
   git ls-files --others --exclude-standard
   ```

2. **Buang dari cakupan** berkas berikut dan catat alasannya di bagian "Dilewati":
   - `CLAUDE.md`, semua isi `.agents/`, `.agent/`, `.claude/`, `graphify-out/`, `node_modules/`, `out/`, `target/`, `gen/`.
   - Berkas kunci dan data: `*.lock`, `bun.lock*`, `package.json`, `*.json` data (misalnya `libur-nasional.json`, `akun-bawaan.json`), `*.db`.
   - **Salinan Mobile yang dihasilkan skrip**: `mobile/src/lib/**` dan `mobile/src-tauri/src/mobile/**` yang punya padanan di `web-desktop`. Berkas itu ditimpa saat sinkronisasi. Bila ada yang perlu diubah, ubah padanannya di `web-desktop` lalu tulis di ringkasan bahwa `mobile/scripts/sync-frontend-lib.ts` atau `sync-rust-modules.ts` harus dijalankan ulang.
   - Berkas tes (`*.test.ts`, `*.test.tsx`) dan modul tes Rust (`#[cfg(test)]`): vektor dan fixture adalah data.

3. **Muat aturan.** Baca [antislop](file:///c:/fr/project-school-new/.agents/skills/antislop/SKILL.md) (inti) lebih dulu, lalu hanya sub-skill yang sesuai jenis berkas:
   - komentar kode: [antislop-code](file:///c:/fr/project-school-new/.agents/skills/antislop-code/SKILL.md)
   - tampilan `.tsx`/CSS: [antislop-ui](file:///c:/fr/project-school-new/.agents/skills/antislop-ui/SKILL.md)
   - teks, judul, pesan galat yang dilihat pengguna: [antislop-copywriting](file:///c:/fr/project-school-new/.agents/skills/antislop-copywriting/SKILL.md)
   - tata letak ponsel: [antislop-layoutmobile](file:///c:/fr/project-school-new/.agents/skills/antislop-layoutmobile/SKILL.md)
   - kontras dan fokus: [antislop-human](file:///c:/fr/project-school-new/.agents/skills/antislop-human/SKILL.md) (hanya laporkan, jangan ubah warna)

4. **Sunting dengan batas ini.**
   - Boleh: komentar, teks antarmuka berbahasa Indonesia yang generik atau kaku.
   - **Dilarang**: logika, nama fungsi/variabel/tipe, SQL, kunci JSON, kode galat (`VALIDATION_ERROR`, `TOTP_REQUIRED`, dan sejenisnya), nilai enum atau status yang dibandingkan di tempat lain (`'Koreksi Admin'`, `'Menunggu'`, `'Aktif'`), kunci `localStorage`/setting, dan teks yang diuji (cari dengan Grep sebelum mengubah string; bila ada tes atau kode lain yang membandingkannya, jangan ubah).
   - **Jangan hapus atau ubah** komentar penanda audit dan peringatan: `shortcut:`, `-- batas:`, `-- sengaja-utuh:`, serta urutan doc comment `///` sebelum `#[tauri::command]` pada berkas Rust (jangan pindahkan).
   - Label formulir harus tetap menyebut FUNGSI kontrol ("Filter divisi"), bukan nilai terpilih.

5. **Tulis `.claude/ANTISLOP.md`** (timpa), maksimal 40 baris:

   ```markdown
   # ANTISLOP.md — hasil antislop

   - Waktu: <tanggal dan jam WIB>
   - Commit: <hash pendek> (+ <N> berkas berubah, belum commit)
   - Berkas disunting: <jumlah>

   ## Disunting
   - `<berkas>` — <jenis: komentar | teks UI> — <satu baris apa yang berubah>

   ## Dilewati
   - `<berkas>` — <alasan>

   ## Perlu tindakan
   <kosong bila tidak ada; mis. "jalankan ulang sync-frontend-lib.ts">
   ```

6. **Balas user maksimal tiga baris**: selesai atau tidak, jumlah berkas disunting, dan bahwa langkah berikutnya adalah menjalankan skill [jalankan-check](file:///c:/fr/project-school-new/.agents/skills/jalankan-check/SKILL.md) (atau workflow `/check`).

## Aturan

- Jangan menempelkan isi berkas atau diff ke percakapan.
- Bila tidak ada yang perlu diubah, tulis itu di `.claude/ANTISLOP.md` dan jangan menyunting apa pun.
- Jangan memperbaiki bug yang kamu temukan; catat di "Perlu tindakan".
