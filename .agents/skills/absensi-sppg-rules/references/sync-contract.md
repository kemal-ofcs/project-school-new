# Kontrak Bootstrap dan Sinkronisasi 2-Tier

## Daftar isi

1. Bootstrap dan login pertama
2. Kontrak route kanonik
3. Kontrak schema dan snapshot
4. Urutan transaksi
5. Cloud kosong dan data legacy
6. Batas keamanan 2-tier

## 1. Bootstrap dan login pertama

- Dev, desktop release, dan Android release memakai alur autentikasi yang sama.
- Tidak ada akun atau password bawaan.
- Environment Turso boleh membantu debug, tetapi harus dikompilasi menjadi `None` pada release agar token mesin build tidak ikut terdistribusi.
- Bila Turso belum dikonfigurasi, form provisioning meminta URL, token, nama, username, dan password customer.
- Bila Turso sudah dikonfigurasi tetapi belum memiliki Superadmin aktif, form hanya meminta identitas Superadmin.
- Kode operator bootstrap adalah `SPD001`; username dan password dipilih customer.
- Claim `app_bootstrap_state` dan insert operator harus atomik serta hanya berhasil sekali.

## 2. Kontrak route kanonik

Route yang boleh diproduksi outbox:

```text
attendance/create    attendance/delete    attendance/scan    attendance/update
backup/cancel        backup/create
company-profile/update
correction/create    correction/delete
employee/create      employee/status      employee/token     employee/update
holiday/create       holiday/delete       holiday/update
id-card/update       id-card-template/save
log-scan/delete
offline-import/delete offline-import/row
setting/update       setting/upsert
shift/create         shift/delete         shift/update
```

Gunakan hyphen-case untuk domain majemuk. Normalisasi alias lama seperti `company_profile`,
`id_card_template`, `offline_import`, atau `scan_log` hanya pada boundary Turso. Setelah
normalisasi, tulis bentuk kanonik ke `sync_changelog` dan `sync_operation_receipt`.

`entity_key` adalah identitas resmi update/status/delete. Payload adalah data perubahan,
bukan pengganti identitas. Event dengan route asing, payload bukan object, entity kosong,
payload terlalu besar, event ID bentrok, atau nol statement mutasi harus menjadi conflict/rejected.

## 3. Kontrak schema dan snapshot

Tabel snapshot inti:

```text
master_data         id_card              tbl_shift
tbl_hari_libur      setting_gex_system   company_profile
id_card_template    backup_karyawan      koreksi_admin
import_offline      absensi_harian       log_scan
```

Definisi payload key, domain, tabel, kolom, conflict key, dan entity key di `sync.rs`
desktop/mobile harus identik. DDL aktual wajib diverifikasi pada `storage.rs`, `turso.rs`,
`db-schema.ts`, `db-migrations.ts`, serta database SQLite nyata bila tersedia.

Snapshot parsial hanya mengubah payload key yang hadir. Penghapusan `delete_missing` hanya
berlaku untuk row yang memiliki `desktop_entity_revision`; row lokal untracked harus bertahan.

## 4. Urutan transaksi

```text
mutasi lokal + outbox dalam satu transaksi
  -> push batch maksimal 50
  -> normalisasi dan validasi route/payload
  -> BEGIN IMMEDIATE
  -> target mutations
  -> sync_changelog
  -> sync_operation_receipt
  -> COMMIT atau ROLLBACK
  -> validasi seluruh push result
  -> tandai outbox synced/conflict
  -> pull snapshot revision monotonik
  -> apply snapshot lokal dalam satu transaksi
```

Receipt sukses harus memiliki `serverRevision > 0`. Retry event yang sama dan payload sama
mengembalikan receipt lama; event ID sama dengan isi berbeda harus ditolak sebagai collision.

## 5. Cloud kosong dan data legacy

Turso client membuat tabel, kolom kompatibilitas, index, role, permission, setting, shift,
profil, dan template default secara idempoten. Mutasi baru yang mempunyai outbox akan di-push,
lalu snapshot cloud di-pull ke perangkat lain.

Row legacy yang sudah ada lokal tetapi tidak mempunyai outbox tidak otomatis menjadi cloud seed.
Jangan membuat auto-upload tersembunyi. Sediakan aksi bulk seed terpisah hanya setelah user memilih
sumber otoritatif, melihat jumlah row, dan menyetujui kebijakan konflik.

## 6. Batas keamanan 2-tier

Vault, device binding, RBAC, rate limit, dan validasi melindungi penggunaan normal dan kehilangan
file parsial. Perangkat yang sepenuhnya dikuasai penyerang tetap dapat mengekstrak token Turso dari
runtime. Otorisasi yang tidak dapat dilewati memerlukan gateway/token broker dan token singkat.
