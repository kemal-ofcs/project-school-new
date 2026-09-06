# 07 — Immersive 3D, Motion Engine & Upgrade UI/UX (Desktop + Mobile)

Referensi ini adalah kontrak wajib untuk seluruh pekerjaan peningkatan visual (3D, glassmorphism, glow, spotlight, animasi mikro) pada workspace `web-desktop/` dan `mobile/`. Dibaca **sebelum** menambahkan dependensi visual apapun.

**Status repo saat aturan ini ditulis:** belum ada satupun paket 3D/animasi terpasang di kedua `package.json`. Tidak ada `tailwind.config.ts` (Tailwind v4 CSS-first), tidak ada helper `cn()`, dan direktori `mobile/public/` belum ada. Seluruh aturan di bawah berlaku sejak instalasi paket pertama.

---

## 1. Stack Visual Resmi (Whitelist Terkunci)

Hanya 8 kategori berikut yang disetujui. Paket di luar tabel ini (Lottie, GSAP, Babylon.js, PixiJS, react-spring, Anime.js, AOS, Redux/Jotai untuk keperluan visual) **DILARANG** tanpa persetujuan eksplisit USER.

| Kategori | Tools Pilihan | Beban GPU/RAM | Peran Utama |
| :--- | :--- | :--- | :--- |
| **3D Rendering** | `three` + `@react-three/fiber` + `@react-three/drei` + `@types/three` | Menengah (dapat diturunkan ke Rendah) | Objek 3D penuh, interaksi model, dan visualisasi data |
| **No-Code 3D** | `@splinetool/react-spline` | Menengah | Desain 3D interaktif siap pakai untuk kartu hero & maskot |
| **Pseudo-3D & Animasi UI** | `motion` (Framer Motion) | Sangat Rendah | Efek kartu 3D tilt, parallax hover, dan transisi layout |
| **Animasi Mikro / Status** | `@rive-app/react-canvas` | Sangat Rendah (berkas `.riv` < 50 KB) | Ikon interaktif & indikator status sinkronisasi Turso |
| **Komponen Visual Modern** | Aceternity UI & Magic UI (vendored, bukan npm) | Rendah | Efek spotlight, bento grid, glowing border, dan glassmorphism |
| **Deteksi Hardware** | `detect-gpu` | Nol (hanya kalkulasi awal) | Menentukan kualitas grafis otomatis sesuai spek laptop/HP |
| **Kompresi Aset 3D** | Draco Compression / `@gltf-transform/*` | Menghemat RAM & CPU | Memperkecil ukuran model 3D hingga 80% lebih ringan |
| **State Bridge** | `zustand` | Sangat Rendah | Menghubungkan data SQLite ke canvas 3D tanpa re-render berlebih |

### 1.1 Klasifikasi Dependensi
- **Runtime (dipasang di `dependencies` kedua workspace):** `three`, `@react-three/fiber`, `@react-three/drei`, `@splinetool/react-spline`, `motion`, `@rive-app/react-canvas`, `detect-gpu`, `zustand`, `clsx`, `tailwind-merge`.
- **Build-time saja (`devDependencies`, DILARANG diimpor dari `src/`):** `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/cli`. Tooling ini hanya dipakai oleh skrip pipeline aset; mengimpornya dari kode aplikasi menambah beban bundle tanpa manfaat.
- **`@types/three`** masuk `devDependencies`.
- R3F **v9+ wajib** — v8 tidak mendukung React 19 yang dipakai repo ini.
- Aceternity UI & Magic UI **bukan** paket npm: kodenya di-vendor (copy-paste) ke repo, lihat Bagian 8.3.

### 1.2 Paritas Dua Workspace
- Setiap paket runtime **WAJIB dipasang di kedua workspace dengan versi pinned eksak yang sama** (gaya `"zod": "4.3.6"`, bukan `^`). Bundle Desktop dan Mobile dibangun terpisah; memasang di satu sisi saja membuat build mobile gagal me-resolve import komponen hasil sync.
- Bila sebuah paket sengaja **tidak** dipakai di mobile, paket itu DILARANG dipasang di `mobile/package.json` dan komponen yang mengimpornya DILARANG masuk daftar direktori yang disalin script sync (Bagian 9).

---

## 2. Prinsip Nol Kompromi (Non-Negotiable)

1. **3D tidak boleh pernah menghalangi alur inti.** Absensi scan, login, bootstrap superadmin, dan sinkronisasi WAJIB berfungsi penuh saat WebGL tidak tersedia, GPU lemah, atau efek visual dimatikan pengguna.
2. **Nol perubahan skema, nol route sync baru.** Preferensi visual adalah preferensi perangkat, bukan data bisnis. DILARANG menambah kolom, tabel, domain outbox, atau route kanonik untuk keperluan tema/3D.
3. **Nol permintaan jaringan baru.** Aplikasi ini offline-first. Semua aset visual, WASM, dan data benchmark di-bundle di dalam binary/APK.
4. **Nol regresi pada aturan lama.** Aturan kamera (4.7), modal mobile (4.17), layout no-overflow (4.15), GPS cache (4.18), dan disiplin quality gate (4.20) tetap berlaku penuh dan tidak boleh dilonggarkan demi efek visual.

---

## 3. Disiplin Aset Offline-First (Zero CDN) & Prasyarat CSP

### 3.1 Semua aset di-bundle lokal
- Berkas `.glb`, `.gltf`, `.splinecode`, `.riv`, `.wasm`, decoder Draco, HDR/EXR, tekstur, dan data benchmark `detect-gpu` **WAJIB** berada di `public/` masing-masing workspace (`web-desktop/public/3d/`, `mobile/public/3d/`; buat `mobile/public/` bila belum ada) dan dirujuk dengan path relatif.
- **DILARANG KERAS** memuat aset dari CDN manapun (`prod.spline.design`, `unpkg.com`, `jsdelivr`, Google Fonts, dsb.). Alasannya berlapis: aplikasi harus jalan tanpa internet, kuota data customer tidak boleh terpakai untuk dekorasi, dan CSP Desktop memang sudah memblokirnya.

Tiga jebakan default paket yang **WAJIB** ditutup secara eksplisit:

- **Rive** memuat runtime WASM dari unpkg secara default. Arahkan ke berkas lokal sebelum komponen pertama dirender:
  ```ts
  import { RuntimeLoader } from "@rive-app/react-canvas";
  RuntimeLoader.setWasmUrl("/3d/rive/rive.wasm");
  ```
- **detect-gpu** mengunduh berkas benchmark dari CDN secara default. Salin direktori `benchmarks` milik paket ke `public/3d/benchmarks/` dan panggil dengan `benchmarksURL` lokal:
  ```ts
  const tier = await getGPUTier({ benchmarksURL: "/3d/benchmarks" });
  ```
- **Draco / KTX2 / Meshopt decoder** (dipakai `useGLTF`) wajib disalin ke `public/3d/decoders/` dan path-nya di-set eksplisit (`useGLTF.setDecoderPath("/3d/decoders/draco/")`), bukan memakai default `www.gstatic.com`.
- **Spline** wajib memakai scene hasil ekspor yang disimpan di repo: `scene="/3d/hero.splinecode"`. URL `https://prod.spline.design/...` DILARANG.

### 3.2 Prasyarat CSP Tauri (wajib dikonfirmasi USER sebelum diubah)
CSP saat ini memblokir dua hal yang dibutuhkan stack ini. Perubahan berikut adalah **prasyarat implementasi**, dan karena menyentuh konfigurasi keamanan **WAJIB minta persetujuan eksplisit USER** (Pilar 2.2) sebelum diterapkan:

- `web-desktop/src-tauri/tauri.conf.json` — `connect-src` saat ini hanya `"ipc: http://ipc.localhost"`. Loader GLTF/Rive/Spline/detect-gpu memuat aset via `fetch`/XHR, sehingga fetch same-origin ke `public/` pun ditolak. Wajib ditambah `'self' asset: http://asset.localhost`.
- Kedua workspace — WebAssembly (Rive, Draco) membutuhkan `script-src` eksplisit yang memuat `'wasm-unsafe-eval'`. Saat ini `script-src` tidak dideklarasikan sehingga jatuh ke `default-src 'self'` dan instansiasi WASM akan gagal.
- Bila memakai Web Worker (decoder Draco/KTX2 paralel), tambahkan `worker-src 'self' blob:`.
- **DILARANG** menambahkan host eksternal apapun ke `connect-src`/`img-src`/`font-src`, dan DILARANG memakai `'unsafe-eval'`.

### 3.3 Pipeline Kompresi Aset (Draco / GLTF-Transform)
- Model 3D mentah dari desainer **DILARANG** langsung masuk `public/`. Wajib melewati pipeline: `gltf-transform optimize` (dedup, prune, resize tekstur, `--compress draco`) atau `--texture-compress ktx2`.
- Simpan model sumber di luar bundle (misal `assets-src/`, tidak ikut `public/`), dan hanya hasil optimasi yang di-commit ke `public/3d/`.
- Target hasil kompresi: pengurangan ukuran minimal 60%; bila di bawah itu, model terlalu berat secara geometri dan wajib disederhanakan di sisi desain, bukan dipaksakan.

### 3.4 Anggaran ukuran aset
| Target | Batas per scene | Batas total tambahan aset visual |
| :--- | :--- | :--- |
| Desktop | 2 MB | 8 MB |
| Mobile (APK) | 800 KB | 3 MB |

- Tekstur maksimum 1024x1024 pada mobile, 2048x2048 pada desktop.
- Pertumbuhan ukuran APK akibat fitur visual **WAJIB dilaporkan ke USER** bila melebihi 5 MB.

---

## 4. Client-Only Rendering & Kepatuhan Static Export

Kedua build memakai `output: "export"` (prerender saat build). Modul yang menyentuh `window`, `document`, atau WebGL saat prerender akan **menggagalkan build**, bukan sekadar warning.

- Setiap komponen 3D/canvas **WAJIB** diawali `"use client"` **dan** dimuat lewat `dynamic()` dengan `ssr: false` plus fallback non-3D:
  ```tsx
  const HeroScene = dynamic(() => import("@/components/visual/HeroScene"), {
    ssr: false,
    loading: () => <HeroFallback />,
  });
  ```
- **DILARANG** mengimpor `three`, `@react-three/*`, `@splinetool/*`, `@rive-app/*`, atau `detect-gpu` dari:
  - server component / `layout.tsx` / `page.tsx` level atas,
  - modul apapun di `src/lib/gateways/*`, `src/lib/services/*`, `src/lib/validations/*`, `src/lib/server/*`, atau `src/types/*` — direktori itu disalin apa adanya ke mobile dan wajib tetap netral platform serta bebas dependensi berat.
- Chunk 3D DILARANG masuk ke bundle awal halaman Login, Bootstrap, dan Scanner.

---

## 5. Deteksi Hardware & Tier Kualitas Otomatis (`detect-gpu`)

`detect-gpu` adalah **gerbang wajib** sebelum scene 3D apapun dimount. Aplikasi ini berjalan di laptop kantor kelas rendah dan HP Android murah; menebak kemampuan GPU adalah pelanggaran Pilar 2.1 (anti-asumsi).

### 5.1 Pemetaan tier
| Hasil `getGPUTier()` | Tier Visual SPPG | Perilaku |
| :--- | :--- | :--- |
| `tier: 3` | `high` | R3F + Spline penuh, partikel, post-processing ringan |
| `tier: 2` | `medium` | R3F sederhana tanpa shadow/post-processing; Spline hanya Desktop |
| `tier: 1` | `low` | Tanpa WebGL. Hanya Motion (tilt/parallax) + efek CSS |
| `tier: 0`, `isMobile` dengan tier rendah, atau `gpu` tidak terdeteksi | `off` | Sepenuhnya statis, fallback 2D |

- Hasil deteksi **WAJIB dijalankan sekali** saat aplikasi start, di-cache di `localStorage` (Bagian 7.2), dan tidak dihitung ulang setiap navigasi.
- Bila `detect-gpu` gagal atau melempar error, default aman adalah **`low`**, bukan `high`.
- Pengguna WAJIB dapat menimpa hasil deteksi secara manual lewat pengaturan tampilan (High / Medium / Low / Off). Override manual mengalahkan hasil otomatis.

### 5.2 Degradasi adaptif saat runtime
- Bila frame rata-rata di bawah target selama 3 detik berturut-turut, sistem WAJIB otomatis menurunkan satu tier dan menyimpan hasilnya. Jangan biarkan perangkat lemah berjuang selamanya.
- Kenaikan tier otomatis DILARANG; naik tier hanya lewat aksi manual pengguna.

---

## 6. Guard WebGL, Fallback, Memori & Kontensi Hardware

### 6.1 Deteksi & fallback wajib
- Selain tier `detect-gpu`, tetap lakukan deteksi kapabilitas WebGL nyata sebelum mount `<Canvas>`; layar kosong/putih adalah kegagalan, bukan fallback.
  ```ts
  export function isWebGLAvailable(): boolean {
    if (typeof window === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      return Boolean(
        window.WebGLRenderingContext &&
          (canvas.getContext("webgl2") ?? canvas.getContext("webgl")),
      );
    } catch {
      return false;
    }
  }
  ```
- Wajib menangani event `webglcontextlost` (umum di WebView Android setelah lama di background): cegah default, tandai state, lalu turun ke fallback statis.

### 6.2 Satu konteks WebGL & pembersihan memori
- **Maksimal satu `<Canvas>` (atau satu Spline) aktif dalam satu waktu di seluruh aplikasi.** Beberapa konteks paralel membuat WebView Android membuang konteks tertua secara diam-diam.
- Saat unmount **WAJIB** melepas resource: `dispose()` pada geometry/material/texture, `gl.dispose()`, dan `forceContextLoss()`. R3F tidak melepas tekstur yang di-cache `useLoader`/`useGLTF` secara otomatis.
- Pola cleanup mengikuti disiplin yang sama dengan kamera (aturan 4.7): cleanup unmount di `useEffect` dengan dependency array kosong, terpisah dari efek yang bergantung state.

### 6.3 Kontensi dengan kamera dan GPS
- **DILARANG KERAS** memount scene 3D/WebGL/Spline pada halaman Scanner QR selama stream kamera aktif. GPU decoding video + render 3D pada Android kelas menengah memicu panas, frame drop, dan pada sebagian perangkat mematikan stream kamera — persis regresi yang sudah pernah diperbaiki di aturan 4.7.
- Efek dekoratif pada halaman scanner dibatasi pada Motion/CSS 2D (glow border, shimmer, pulse) yang tidak membuka konteks WebGL.
- Utamakan properti yang di-composite GPU (`transform`, `opacity`); hindari menganimasikan `width`/`height`/`top`/`left`.

---

## 7. Anggaran Performa, Aksesibilitas & Preferensi Perangkat

### 7.1 Anggaran performa
| Parameter | Desktop | Mobile |
| :--- | :--- | :--- |
| Target frame rate | 60 FPS | ≥ 30 FPS |
| `dpr` maksimum | `[1, 2]` | `[1, 1.5]` |
| `antialias` | boleh `true` | wajib `false` |
| `powerPreference` | `"high-performance"` | `"default"` |
| Jumlah partikel | ≤ 5.000 | ≤ 1.200 |
| Shadow map | opsional, resolusi ≤ 1024 | dimatikan (`shadows={false}`) |

- Scene statis (hero, kartu, ikon) **WAJIB** memakai `frameloop="demand"` + `invalidate()` manual. Render loop terus-menerus pada aplikasi absensi kiosk/tablet adalah pemborosan baterai murni.
- Render loop **WAJIB berhenti** saat `document.visibilityState === "hidden"` atau window blur, dan dilanjutkan saat kembali aktif — sejalan dengan pola `AutoSyncRunner`.

### 7.2 Reduced motion & tier disimpan device-local
- `prefers-reduced-motion: reduce` **WAJIB** dihormati: nonaktifkan parallax, tilt, auto-rotate, partikel, dan meteor; sisakan transisi opacity sederhana. Gunakan `useReducedMotion()` dari `motion/react` dan blok `@media (prefers-reduced-motion: reduce)` di `globals.css`.
- Tier visual (hasil `detect-gpu` + override manual) disimpan **hanya di `localStorage`** dengan kunci `sppg.visual.tier` bernilai `high | medium | low | off`.
- **DILARANG KERAS** menyimpannya di tabel `setting_gex_system` atau tabel tersinkron lainnya. Kemampuan GPU bersifat per-perangkat: mensinkronkannya berarti laptop kantor mendikte kualitas render HP Android, dan setiap kunci device-local baru memaksa perubahan `sync::DEVICE_LOCAL_SETTING_KEYS` beserta audit kontrak — biaya besar untuk preferensi dekoratif.

### 7.3 Ergonomi sentuh (Mobile)
- Efek tilt 3D mengikuti pointer **DILARANG** pada elemen interaktif utama mobile (tombol scan, item daftar, field form) karena merusak akurasi tap; gunakan hanya pada kartu display non-interaktif.
- Target sentuh minimum `44x44px` dan safe-area insets tetap berlaku. Glow, aurora, beam, dan meteor DILARANG menutupi bottom navigation atau area safe-area.
- Aturan modal mobile (4.17) tidak berubah: header/footer sticky dan body scrollable wajib tetap ada; animasi masuk/keluar tidak boleh mengubah struktur itu.
- Efek blur berat (`backdrop-filter` besar, banyak layer) DILARANG di balik daftar panjang yang di-scroll — biaya repaint per frame pada WebView Android sangat mahal.

---

## 8. State Bridge (Zustand), Tailwind v4 & Vendoring Komponen

### 8.1 Zustand sebagai jembatan data → canvas
- Zustand dipakai **hanya** sebagai jembatan state visual: tier kualitas, status animasi, nilai teragregasi yang divisualisasikan, dan progres sinkronisasi.
- **DILARANG** menjadikan store Zustand sumber kebenaran data bisnis. Data tetap mengalir lewat `src/lib/gateways/*` (Rust IPC / route handler); store hanya menerima hasilnya. Menulis langsung dari komponen 3D ke database, atau menyimpan salinan tabel absensi di store, adalah pelanggaran Gateway Pattern (4.5).
- **DILARANG** memanggil `set()` dari dalam `useFrame` per frame — itu memicu badai re-render React. Untuk animasi berbasis data gunakan `subscribeWithSelector` + `store.subscribe()` transien, lalu mutasi objek `three` secara langsung (`ref.current.position.set(...)`).
- Konsumsi state di komponen React wajib memakai selector sempit (dan `useShallow` untuk objek), bukan mengambil seluruh store.
- Store diletakkan di `web-desktop/src/lib/stores/` (sumber kanonik) dan direktori `lib/stores` **WAJIB didaftarkan** ke `dirsToCopy` pada `mobile/scripts/sync-frontend-lib.ts`.
- Store visual **WAJIB direset saat logout** agar tidak ada kebocoran state antar sesi operator.

### 8.2 Tailwind v4 CSS-first & token tema
- Repo memakai Tailwind v4 (`@import "tailwindcss"` di `globals.css`) dan **tidak memiliki `tailwind.config.ts`**. Dokumentasi Aceternity UI / Magic UI umumnya menyuruh menambahkan `keyframes`/`animation` di `tailwind.config.js` — instruksi itu **DILARANG diikuti mentah-mentah**. Definisikan via `@theme` di `globals.css`:
  ```css
  @theme {
    --animate-aurora: aurora 12s ease-in-out infinite;
  }
  @keyframes aurora { /* ... */ }
  ```
- **DILARANG** membuat berkas `tailwind.config.ts` baru hanya demi komponen vendor.
- Palet aplikasi sudah terdefinisi sebagai CSS variable (`--app-background`, `--app-surface`, `--app-primary`, `--app-gold`, `--app-text`, dst.) dengan dark sebagai default dan light via `html[data-theme="light"]`. Warna glow, material 3D, gradient, dan partikel **WAJIB** dibaca dari token tersebut; DILARANG menanam hex mentah hasil copy-paste. Setiap efek baru **WAJIB diuji pada kedua tema**.

### 8.3 Vendoring Aceternity UI / Magic UI
- Komponennya disalin ke `src/components/visual/` (bukan dipasang sebagai dependency), lalu:
  - dibersihkan dari import tak terpakai dan disesuaikan ke token tema,
  - wajib lolos `bun run lint` (Biome 2) dengan **0 error 0 warning**, termasuk aturan a11y (`onClick` pada `div` statis tanpa role/keyboard handler adalah pelanggaran yang lazim di kode copy-paste),
  - helper `cn()` dibuat **satu kali** di `src/lib/utils/cn.ts` (`clsx` + `tailwind-merge`), bukan diduplikasi di tiap berkas — sesuai Pilar 2.3 anti-duplikasi.
- React Compiler aktif (`reactCompiler: true`). Bila sebuah komponen animasi bermasalah dengan auto-memoization, gunakan directive `"use no memo"` **pada komponen itu saja**; DILARANG mematikan `reactCompiler` global.

---

## 9. Paritas Kode Visual web-desktop → mobile

- `web-desktop/` tetap **sumber kanonik**. Komponen visual bersama ditulis di `web-desktop/src/components/visual/` lebih dulu.
- Perlu diketahui: `mobile/scripts/sync-frontend-lib.ts` saat ini **hanya menyalin `lib/*` dan `types`, tidak menyalin `src/components`** (shell, bottom nav, dan scanner mobile memang sengaja berbeda). Maka `components/visual` dan `lib/stores` **WAJIB** didaftarkan eksplisit ke array `dirsToCopy` agar sinkronisasi tetap otomatis dan satu arah.
- Setelah didaftarkan, jalankan script sync dari `mobile/`. **DILARANG** mengedit langsung berkas hasil sync di `mobile/src/` — perubahan akan hilang senyap pada sync berikutnya.
- Komponen khusus Desktop (misal scene Spline berat) DILARANG diletakkan di `components/visual/`; taruh di `web-desktop/src/components/visual-desktop/` yang tidak ikut disalin.

---

## 10. Rive State Machine untuk Status Sinkronisasi

Indikator status sinkronisasi SQLite lokal ↔ LibSQL cloud adalah kandidat terbaik untuk Rive, tetapi wajib mencerminkan status **nyata**, bukan animasi dekoratif yang berjalan sendiri:

- Input state machine dipetakan dari sumber kebenaran yang sudah ada: hasil `DesktopSyncStatus` (termasuk `push_error`), event browser `sppg:sync-completed`, dan status antrean `desktop_sync_outbox` (`pending` / `conflict`). Jembatannya adalah store Zustand (Bagian 8.1), bukan polling langsung dari komponen animasi.
- Status minimum yang wajib dapat dibedakan pengguna: `idle`, `syncing`, `success`, `offline`, `conflict/error`.
- **DILARANG** menampilkan animasi sukses saat `push_error` terisi atau saat masih ada outbox `pending` — indikator visual yang berbohong tentang keadaan data lebih berbahaya daripada tidak ada indikator sama sekali.
- Wajib ada teks/`aria-label` pendamping; animasi tidak boleh menjadi satu-satunya penyampai informasi status.
- Saat tier visual `off`/`low` atau reduced-motion aktif, indikator turun menjadi badge statis dengan makna yang sama.

---

## 11. Larangan Keras (Ringkasan)

1. Memuat aset 3D/WASM/benchmark/font dari CDN atau URL remote apapun (termasuk default bawaan Rive, detect-gpu, Draco, dan Spline).
2. Melonggarkan CSP dengan host eksternal atau `'unsafe-eval'`.
3. Mengimpor `three`/R3F/Spline/Rive/detect-gpu dari server component atau dari `src/lib/**` yang ikut disinkronkan, atau mengimpor `@gltf-transform/*` dari kode runtime.
4. Memount `<Canvas>`/Spline di halaman Scanner saat kamera aktif.
5. Menjalankan lebih dari satu konteks WebGL bersamaan, atau unmount tanpa `dispose()`.
6. Memount scene 3D tanpa gerbang `detect-gpu` + guard WebGL, atau memakai `high` sebagai default saat deteksi gagal.
7. Memanggil `set()` Zustand di dalam `useFrame`, atau menjadikan store sumber kebenaran data bisnis.
8. Menyimpan preferensi visual di tabel tersinkron, atau menambah kolom/route sync demi keperluan visual.
9. Mengabaikan `prefers-reduced-motion`.
10. Menanam warna hex mentah dari komponen pihak ketiga, atau membuat `tailwind.config.ts`.
11. Memasang paket visual hanya di satu workspace, atau dengan versi berbeda antar workspace.
12. Mengedit langsung berkas hasil sync di `mobile/src/`.
13. Mengaktifkan `isMinifyEnabled = true` (aturan 4.4 tidak berubah) atau menambah plugin Tauri baru demi efek visual.
14. Menjalankan `bun run check` berulang kali di tengah implementasi (aturan 4.20: sekali di akhir).

---

## 12. Definition of Done (Checklist PR Visual)

Pekerjaan UI/UX 3D dinyatakan selesai hanya bila seluruh butir berikut terpenuhi:

- [ ] Paket runtime terpasang di **kedua** workspace dengan versi pinned identik; `@gltf-transform/*` hanya di `devDependencies`.
- [ ] Seluruh aset ada di `public/` dan **tidak ada satupun request keluar** saat aplikasi dijalankan offline (verifikasi di DevTools Network dengan mode pesawat).
- [ ] Model 3D sudah melewati pipeline Draco/GLTF-Transform dan memenuhi anggaran ukuran.
- [ ] Komponen 3D `"use client"` + `dynamic({ ssr: false })`, dan `bun run build:desktop` serta `bun run build:mobile` sukses (static export tidak pecah).
- [ ] Gerbang `detect-gpu` + guard WebGL + fallback non-3D terbukti bekerja pada tier `off` dan `low`.
- [ ] Cleanup unmount melepas seluruh resource; tidak ada kebocoran konteks saat navigasi bolak-balik 10 kali.
- [ ] Halaman Scanner diuji: kamera tetap hidup, tidak ada regresi aturan 4.7.
- [ ] Diuji pada tema gelap dan terang, serta dengan `prefers-reduced-motion: reduce`.
- [ ] Diuji pada perangkat Android nyata (bukan hanya emulator) untuk frame rate dan panas perangkat.
- [ ] `bun run check:quick` di root lolos **0 error 0 warning**, dijalankan satu kali di akhir.
- [ ] Pertumbuhan ukuran bundle/APK dilaporkan ke USER.
