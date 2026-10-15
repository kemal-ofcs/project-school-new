---
description: Menjalankan gerbang kualitas `bun run check` di root repo Manajemen Sekolah dan menulis ringkasannya ke `.claude/HASIL.md`
---

# Workflow: check

Jalankan seluruh prosedur dari skill [jalankan-check](file:///c:/fr/project-school-new/.agents/skills/jalankan-check/SKILL.md):

## Langkah Eksekusi

1. **Jalankan check ke berkas log:**
   Dari root repository, jalankan `bun run check` dan alihkan seluruh output ke `.claude/check.log`:
   ```bash
   bun run check > .claude/check.log 2>&1; echo "exit=$?"
   ```

2. **Kumpulkan metadata git:**
   ```bash
   git rev-parse --short HEAD
   git status --short
   ```

3. **Analisis berkas `.claude/check.log`:**
   Periksa baris ringkasan gate dan galat (cari kata kunci `error`, `FAIL`, `✗`, `panicked`, `no such column`, `warning: unused`).

4. **Tulis / Timpa `.claude/HASIL.md`:**
   Format sesuai template yang ditentukan di [SKILL.md](file:///c:/fr/project-school-new/.agents/skills/jalankan-check/SKILL.md):
   - Waktu (WIB)
   - Commit & status perubahan berkas
   - Perintah (`bun run check` atau `bun run check:quick`)
   - Exit code
   - Status (**LULUS** atau **GAGAL**)
   - Tabel gate yang gagal
   - Daftar galat (maksimal 10)
   - Catatan faktual dari log

5. **Balas ke percakapan:**
   Maksimal 3 baris: status, jumlah galat, dan konfirmasi bahwa detail telah ditulis di `.claude/HASIL.md`.

## Catatan Aturan
- Jangan menempelkan log mentah ke percakapan.
- Jangan mengubah kode atau melonggarkan audit agar lolos.
- Jika argumen `quick` diberikan (misal `/check quick`), jalankan `bun run check:quick` dan catat perintah tersebut di `HASIL.md`.
