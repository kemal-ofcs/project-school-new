ini untuk desain versi mobile supaya responsif dan dinamis

<!DOCTYPE html>

<html class="light" lang="id"><head><meta charset="utf-8"/><meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" name="viewport"/><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&amp;display=swap" rel="stylesheet"/><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/><style>@layer base{html,body{width:100%;margin:0;padding:0;}body{overscroll-behavior-y:none;font-family:'Inter',sans-serif;}.pb-safe{padding-bottom:env(safe-area-inset-bottom,0px);}.pt-safe{padding-top:env(safe-area-inset-top,0px);}main>:first-child{margin-top:0!important;}main>:last-child{margin-bottom:0!important;}}::-webkit-scrollbar{display:none;}</style><script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script><script id="tailwind-config">tailwind.config = { darkMode: "class", theme: { extend: { colors: { "on-tertiary": "#ffffff", "surface-container-high": "#dce9ff", "surface-container-highest": "#d3e4fe", "on-primary": "#ffffff", "surface-dim": "#cbdbf5", "surface-bright": "#f8f9ff", "surface-container": "#e5eeff", "on-surface-variant": "#444651", "on-primary-fixed": "#00164e", "on-primary-container": "#90a8ff", "inverse-on-surface": "#eaf1ff", "on-surface": "#0b1c30", "surface-container-lowest": "#ffffff", "on-secondary-fixed": "#2a1700", "secondary": "#855300", "surface-container-low": "#eff4ff", "tertiary-container": "#004b22", "surface-tint": "#4059aa", "primary": "#00236f", "tertiary": "#003214", "error": "#ba1a1a", "outline": "#757682", "on-secondary-container": "#684000", "on-error": "#ffffff", "on-tertiary-fixed-variant": "#005226", "inverse-surface": "#213145", "primary-container": "#1e3a8a", "surface": "#f8f9ff", "primary-fixed": "#dce1ff", "secondary-fixed": "#ffddb8", "tertiary-fixed-dim": "#8bd79b", "on-secondary-fixed-variant": "#653e00", "secondary-fixed-dim": "#ffb95f", "background": "#f8f9ff", "on-tertiary-container": "#71bc82", "on-secondary": "#ffffff", "on-background": "#0b1c30", "inverse-primary": "#b6c4ff", "outline-variant": "#c5c5d3", "on-primary-fixed-variant": "#264191", "surface-variant": "#d3e4fe", "on-tertiary-fixed": "#00210b", "tertiary-fixed": "#a6f4b5", "primary-fixed-dim": "#b6c4ff", "error-container": "#ffdad6", "secondary-container": "#fea619", "on-error-container": "#93000a" }, borderRadius: { "DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "full": "9999px" }, spacing: { "margin": "1.5rem", "space-xs": "0.25rem", "space-lg": "1.5rem", "space-sm": "0.5rem", "space-xl": "2.5rem", "gutter": "1.5rem", "space-md": "1rem" }, fontFamily: { "label-lg": ["Inter"], "title-md": ["Inter"], "body-lg": ["Inter"], "headline-lg": ["Inter"], "label-md": ["Inter"], "title-lg": ["Inter"], "label-sm": ["Inter"], "body-md": ["Inter"], "display-mobile": ["Inter"], "headline-sm": ["Inter"], "headline-lg-mobile": ["Inter"], "headline-md": ["Inter"], "display": ["Inter"], "body-sm": ["Inter"] }, fontSize: { "label-lg": ["14px", { "lineHeight": "20px", "letterSpacing": "0.01em", "fontWeight": "600" }], "title-md": ["16px", { "lineHeight": "24px", "fontWeight": "600" }], "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }], "headline-lg": ["40px", { "lineHeight": "48px", "letterSpacing": "-0.015em", "fontWeight": "700" }], "label-md": ["12px", { "lineHeight": "16px", "letterSpacing": "0.02em", "fontWeight": "600" }], "title-lg": ["18px", { "lineHeight": "26px", "fontWeight": "600" }], "label-sm": ["11px", { "lineHeight": "14px", "letterSpacing": "0.04em", "fontWeight": "700" }], "body-md": ["15px", { "lineHeight": "24px", "fontWeight": "400" }], "display-mobile": ["36px", { "lineHeight": "44px", "letterSpacing": "-0.02em", "fontWeight": "800" }], "headline-sm": ["20px", { "lineHeight": "28px", "fontWeight": "600" }], "headline-lg-mobile": ["28px", { "lineHeight": "36px", "letterSpacing": "-0.015em", "fontWeight": "700" }], "headline-md": ["28px", { "lineHeight": "36px", "letterSpacing": "-0.01em", "fontWeight": "600" }], "display": ["56px", { "lineHeight": "64px", "letterSpacing": "-0.02em", "fontWeight": "800" }], "body-sm": ["13px", { "lineHeight": "20px", "fontWeight": "400" }] } } } }</script><script>
    // Theme Initializer (prevent flash)
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  </script><style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style></head><body class="bg-surface dark:bg-[#080e1d] text-on-surface dark:text-slate-100 font-body-md text-body-md antialiased min-h-screen flex flex-col transition-colors duration-300"><header class="fixed top-0 w-full z-50 bg-surface/90 dark:bg-[#080e1d]/90 backdrop-blur-xl border-b border-transparent dark:border-white/10 shadow-[0_1px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_12px_rgba(0,0,0,0.4)] pt-safe transition-colors duration-300"><div class="h-16 px-gutter flex items-center justify-between"><div class="flex items-center gap-space-sm min-w-0"><img alt="Modern academic school crest logo, clean flat emblem with open book, torch, stars, and ribbon badge, Navy Blue #1E3A8A, Golden Yellow #F59E0B, Forest Green #166534, vector badge on transparent background. Design context: - Primary color: #1e3a8a - Font: inter - Mode: light - Roundness: rounded-md . The logo should be visually consistent with these brand tokens." class="h-8 w-auto object-contain shrink-0" src="https://lh3.googleusercontent.com/aida/AEtjO1WWkuBOkUwNuAVf3vuQNkeYAhmyMbqnb5_FMAVPUSNhuVIcuw0dQzFL0mZeuzCVJyAZx3SkgF3CCHduBYvpsHtQ0VTEfTr3IzA7G4t68NKPbU1kifasOBov8NSnNhJZaZl33WXOyvVUObCNJNBQO7WR6qNX6sPOSsIT9l5jGAJ8hekmxTAyIBixYgDdVJdaNmWS_fRVYMCTxP45wt7RyfepDHz3DTI3aJs0mDTX404wvXgfNXlYoFNcoOTh"/><div class="flex flex-col min-w-0"><span class="text-primary dark:text-blue-300 font-headline-sm text-title-md leading-none truncate">SMA Global Mandiri</span><span class="text-on-surface-variant dark:text-slate-400 font-label-sm text-label-sm leading-tight truncate">Portal Akademik &amp; PMB</span></div></div><div class="flex items-center gap-1.5 shrink-0"><!-- Dark / Light Mode Switcher Mobile --><button aria-label="Ganti Mode Tampilan" class="h-9 px-2 rounded-full flex items-center gap-1.5 bg-surface-container dark:bg-slate-800 text-on-surface dark:text-slate-200 border border-transparent dark:border-slate-700 hover:bg-surface-container-high dark:hover:bg-slate-700 active:scale-95 transition-all" id="theme-toggle-btn" onclick="toggleTheme()" title="Ubah Tema"><div class="w-5 h-5 rounded-full flex items-center justify-center transition-transform duration-300" id="theme-icon-container"><span class="material-symbols-outlined text-[18px] text-amber-500 block dark:hidden">light_mode</span><span class="material-symbols-outlined text-[18px] text-blue-300 hidden dark:block">dark_mode</span></div><span class="font-label-sm text-[11px] font-bold pr-1 select-none" id="theme-mode-text">Mode</span></button><button aria-label="Menu Utama" class="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface dark:text-slate-200 hover:bg-surface-container dark:hover:bg-slate-800 transition-colors"><span class="material-symbols-outlined text-[22px]">menu</span></button><div class="w-8 h-8 rounded-full bg-primary dark:bg-blue-600 flex items-center justify-center"><span class="material-symbols-outlined text-on-primary text-[18px]">person</span></div></div></div></header><main class="flex-1 flex flex-col relative w-full pt-16 pb-28 bg-surface dark:bg-[#080e1d] transition-colors duration-300"><div class="flex flex-col w-full">
<!-- 1. BANNER URGENSI PMB -->
<div class="w-full bg-secondary-container text-on-secondary-fixed px-gutter py-space-xs flex items-center justify-between shadow-sm">
<div class="flex items-center gap-space-xs min-w-0">
<span class="material-symbols-outlined text-[18px] text-primary shrink-0 animate-pulse">timer</span>
<div class="flex flex-col min-w-0">
<span class="font-label-sm text-label-sm truncate">PMB 2025/2026 Gelombang 1 Early Bird</span>
<span class="font-label-md text-label-md font-bold text-primary truncate">Hemat DPP 25% • Sisa 18 Hari</span>
</div>
</div>
<span class="bg-primary text-on-primary font-label-sm text-label-sm px-space-sm py-0.5 rounded-full shrink-0 shadow-sm">Klaim Kuota</span>
</div>
<!-- 2. HERO SECTION MOBILE -->
<div class="relative w-full overflow-hidden bg-primary-container text-on-primary">
<div class="absolute inset-0 bg-cover bg-center" data-alt="Modern Indonesian high school campus with lush landscaped courtyard, contemporary architectural buildings with glass facades and timber louvers, bright sunny tropical daylight, SMA Global Mandiri students wearing clean white and deep maroon red uniforms walking cheerfully" style="background-image: url('https://lh3.googleusercontent.com/aida/AEtjO1WDn-vMFZ4WEoHMQwHrgw4Vuklh0LWyNMKnXNKvEjs1_2Mw2GSp-KImYCLbecTJeCS3UpM-7q5MbT1aucJtBzXR1O6kEcJnDR1WWKSmh-3xEN3GmyjDQcOtcp3LAaH0tWT3BE32_xhDwVzFfSnKDjSBNLiuWixgIC_unDZVHB-Luc6M9vKU_4YEQ3QssXvjKfcj19mZ5poLClTFZQHsp9dvrmJC10D5u5muxg01dq1TVTSvmJkcBsBjuuFd')">
</div>
<div class="absolute inset-0 bg-gradient-to-b from-primary/90 via-primary-container/85 to-primary dark:from-[#080e1d]/90 dark:via-primary-container/90 dark:to-[#080e1d]"></div>
<div class="relative z-10 px-gutter pt-space-lg pb-space-xl flex flex-col gap-space-md">
<div class="inline-flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-surface-container-highest/20 dark:bg-white/10 backdrop-blur-md self-start border border-white/10">
<span class="w-2 h-2 rounded-full bg-secondary-container animate-ping"></span>
<span class="font-label-sm text-label-sm text-secondary-fixed">Akreditasi A Unggul (BAN-S/M)</span>
</div>
<div class="flex flex-col gap-space-xs">
<h1 class="font-headline-lg-mobile text-headline-lg-mobile text-on-primary leading-tight">
          Wujudkan Generasi Pemimpin Cerdas &amp; Berdaya Saing Global
        </h1>
<p class="font-body-md text-body-md text-inverse-on-surface/90 dark:text-slate-200">
          Pendidikan holistik berstandar internasional dengan pembinaan karakter religius, riset saintifik, dan ekosistem digital terpadu.
        </p>
</div>
<div class="flex flex-col gap-space-xs pt-space-xs">
<a class="w-full h-12 bg-secondary-container text-on-secondary-fixed rounded-lg font-label-lg text-label-lg flex items-center justify-center gap-space-xs shadow-md active:scale-95 transition-transform" href="#daftar-pmb">
<span class="material-symbols-outlined text-[20px]">how_to_reg</span>
<span>Daftar PMB Sekarang</span>
</a>
<a class="w-full h-11 bg-surface-container-lowest/15 backdrop-blur-md text-on-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-space-xs active:bg-surface-container-lowest/25 transition-colors border border-white/20" href="#unduh-brosur">
<span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>
<span>Unduh Brosur Lengkap (PDF)</span>
</a>
</div>
<!-- 4 Quick Stats Mobile Grid -->
<div class="grid grid-cols-2 gap-space-xs pt-space-sm">
<div class="bg-surface-container-lowest/10 dark:bg-white/5 backdrop-blur-md p-space-sm rounded-lg flex flex-col border border-white/10">
<span class="font-label-sm text-label-sm text-secondary-fixed-dim uppercase tracking-wider">Akreditasi</span>
<span class="font-headline-sm text-headline-sm font-bold text-on-primary">A (98/100)</span>
<span class="font-label-sm text-label-sm text-inverse-on-surface/80 dark:text-slate-300">Predikat Sangat Unggul</span>
</div>
<div class="bg-surface-container-lowest/10 dark:bg-white/5 backdrop-blur-md p-space-sm rounded-lg flex flex-col border border-white/10">
<span class="font-label-sm text-label-sm text-secondary-fixed-dim uppercase tracking-wider">Lulusan PTN/LN</span>
<span class="font-headline-sm text-headline-sm font-bold text-on-primary">98.4%</span>
<span class="font-label-sm text-label-sm text-inverse-on-surface/80 dark:text-slate-300">UI, ITB &amp; Kampus Top</span>
</div>
<div class="bg-surface-container-lowest/10 dark:bg-white/5 backdrop-blur-md p-space-sm rounded-lg flex flex-col border border-white/10">
<span class="font-label-sm text-label-sm text-secondary-fixed-dim uppercase tracking-wider">Prestasi 2024</span>
<span class="font-headline-sm text-headline-sm font-bold text-on-primary">150+</span>
<span class="font-label-sm text-label-sm text-inverse-on-surface/80 dark:text-slate-300">Tingkat Nasional &amp; Dunia</span>
</div>
<div class="bg-surface-container-lowest/10 dark:bg-white/5 backdrop-blur-md p-space-sm rounded-lg flex flex-col border border-white/10">
<span class="font-label-sm text-label-sm text-secondary-fixed-dim uppercase tracking-wider">Komunitas Aktif</span>
<span class="font-headline-sm text-headline-sm font-bold text-on-primary">1.250+</span>
<span class="font-label-sm text-label-sm text-inverse-on-surface/80 dark:text-slate-300">Siswa &amp; Jaringan Alumni</span>
</div>
</div>
</div>
</div>
<!-- 3. PROFIL & 4 PILAR KEUNGGULAN -->
<section class="px-gutter py-space-lg flex flex-col gap-space-md">
<div class="flex flex-col gap-1">
<span class="font-label-sm text-label-sm text-secondary dark:text-amber-400 uppercase tracking-widest font-bold">Mengapa Memilih Kami</span>
<h2 class="font-headline-md text-headline-md text-primary dark:text-blue-300 leading-tight">4 Pilar Keunggulan Pendidikan</h2>
<p class="font-body-md text-body-md text-on-surface-variant dark:text-slate-400">Kurikulum visioner yang memadukan keunggulan sains akademis dan budi pekerti luhur generasi emas.</p>
</div>
<!-- 4 Pilar Cards Stack -->
<div class="flex flex-col gap-space-sm">
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-md rounded-xl shadow-sm flex items-start gap-space-sm transition-colors">
<div class="w-10 h-10 rounded-lg bg-primary-fixed dark:bg-blue-900/60 flex items-center justify-center shrink-0">
<span class="material-symbols-outlined text-primary dark:text-blue-300 text-[22px]">menu_book</span>
</div>
<div class="flex flex-col">
<h3 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Kurikulum Cambridge &amp; Merdeka</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Sinergi kurikulum nasional berbasis proyek diperkaya sertifikasi IGCSE Cambridge International.</p>
</div>
</div>
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-md rounded-xl shadow-sm flex items-start gap-space-sm transition-colors">
<div class="w-10 h-10 rounded-lg bg-surface-container-high dark:bg-slate-800 flex items-center justify-center shrink-0">
<span class="material-symbols-outlined text-primary dark:text-blue-300 text-[22px]">badge</span>
</div>
<div class="flex flex-col">
<h3 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Pendidik Bergelar Magister</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">85% guru tersertifikasi S2 alumni universitas ternama dalam dan luar negeri dengan pendampingan intensif.</p>
</div>
</div>
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-md rounded-xl shadow-sm flex items-start gap-space-sm transition-colors">
<div class="w-10 h-10 rounded-lg bg-tertiary-fixed dark:bg-emerald-950 flex items-center justify-center shrink-0">
<span class="material-symbols-outlined text-tertiary-container dark:text-emerald-300 text-[22px]">psychology</span>
</div>
<div class="flex flex-col">
<h3 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Bina Karakter &amp; Kepemimpinan</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Program pembinaan adab, kedisiplinan, kepanduan, dan leadership camp tahunan yang inklusif.</p>
</div>
</div>
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-md rounded-xl shadow-sm flex items-start gap-space-sm transition-colors">
<div class="w-10 h-10 rounded-lg bg-secondary-fixed dark:bg-amber-950/70 flex items-center justify-center shrink-0">
<span class="material-symbols-outlined text-on-secondary-fixed dark:text-amber-300 text-[22px]">smart_toy</span>
</div>
<div class="flex flex-col">
<h3 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Smart Digital Lab &amp; AI Center</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Pusat komputasi modern, coding data science, robotika, dan pembelajaran interaktif berbasis AI.</p>
</div>
</div>
</div>
<!-- Sambutan Kepala Sekolah Mini Card -->
<div class="bg-surface-container-low dark:bg-[#111726] dark:border dark:border-white/10 p-space-md rounded-xl flex items-center gap-space-sm transition-colors">
<img class="w-14 h-14 rounded-full object-cover shrink-0 shadow-sm ring-2 ring-primary/20 dark:ring-white/10" data-alt="Professional Indonesian male high school principal wearing formal batik suit with warm welcoming smile against library bookshelf background, modern portrait photography" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDUXhxfdztD3w2h8hR78ECqUZzxWuC1wMC40hGju80cGMIV0Mz3jrdgkrUcgsO_1VM7i-xIouSlugHJFYBxASHuepbWL2qzG_Pe_JbXr0bHpA3o8AnaaX_H2hbKLJ2tFQYlhgJ2w-SksTgCPDqvRijq41mQjUbQD9AKn15_4sp-1KU4TNjCXGv6UExHtm-Y3bMKR8zepCChVNX-ViiGtKP0Dw7cj6Aez68dbX5si4pJLN1-l-oF89uiHw"/>
<div class="flex flex-col">
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-300 italic leading-snug">"Kami mendampingi setiap siswa mengenali potensi terdalam mereka menjadi pribadi unggul dan santun."</p>
<span class="font-label-sm text-label-sm text-primary dark:text-blue-300 font-bold mt-1">Drs. H. Bambang Sudirman, M.Ed.</span>
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">Kepala SMA Global Mandiri</span>
</div>
</div>
</section>
<!-- 4. PROGRAM PEMINATAN & EKSTRAKURIKULER -->
<section class="bg-surface-container-low dark:bg-[#0d1424] py-space-lg px-gutter flex flex-col gap-space-md transition-colors">
<div class="flex flex-col gap-1">
<span class="font-label-sm text-label-sm text-secondary dark:text-amber-400 uppercase tracking-widest font-bold">Kanal Bakat &amp; Minat</span>
<h2 class="font-headline-md text-headline-md text-primary dark:text-blue-300 leading-tight">Jalur Peminatan Unggulan</h2>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Fasilitasi minat spesifik siswa menuju karier dan perguruan tinggi impian sejak kelas 10.</p>
</div>
<!-- Mobile Segmented Tabs -->
<div class="flex bg-surface-container-high dark:bg-[#151b2b] p-1 rounded-lg dark:border dark:border-white/10">
<button class="flex-1 py-2 rounded-md font-label-md text-label-md text-primary dark:text-white bg-surface-container-lowest dark:bg-slate-800 shadow-sm transition-all text-center" id="tab-peminatan">Peminatan Akademik</button>
<button class="flex-1 py-2 rounded-md font-label-md text-label-md text-on-surface-variant dark:text-slate-400 hover:text-primary dark:hover:text-white transition-all text-center" id="tab-ekskul">Ekstrakurikuler</button>
</div>
<!-- Panel 1: Peminatan -->
<div class="flex flex-col gap-space-sm" id="panel-peminatan">
<!-- MIPA Card -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors">
<div class="h-32 w-full bg-cover bg-center relative" data-alt="Indonesian high school students conducting scientific chemistry lab experiment with glassware and microscopes under bright laboratory lighting, enthusiastic learning environment" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuBAGDZX_M0g7l1jqr7EYGYp2o5EPtPRyOm0vVj8lP2mGCcz6tHgSl8PsX1dnveX8YzirfimFBSOZyHHEcJlqoObzGDfgY2nvciYvKb61jKTincm8zjdZhH9EJ1t3i87ym0guky4DSnyIgUHVBtoONgTctkfope1eVu0apEfaeevCh2daptke9SZD3CJO0HpMNHAcywoxxf7G0uSYnd2ieT5mDeHd-T2h1UuFUCac8RWZPKFan0b7GcNAA')">
<span class="absolute top-2 left-2 bg-primary text-on-primary font-label-sm text-label-sm px-space-xs py-0.5 rounded shadow-sm">MIPA &amp; Riset Saintifik</span>
</div>
<div class="p-space-md flex flex-col gap-space-xs">
<h3 class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold">Sains Terapan &amp; Teknologi Biomedis</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Fokus penguasaan matematika tingkat lanjut, olimpiade sains, bioinformatika, dan riset ilmiah remaja.</p>
<div class="flex flex-wrap gap-1.5 pt-1">
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">Lab Riset Mandiri</span>
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">Mentor ITB/UI</span>
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">KIR Berprestasi</span>
</div>
</div>
</div>
<!-- IPS Card -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors">
<div class="h-32 w-full bg-cover bg-center relative" data-alt="High school students presenting stock investment project on interactive smart board in modern business simulation classroom, collaborating enthusiastically" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuDEPwobGol-aDL2dTS-TwJ-A4ozWs7hqCXY4NnUBJut3XM4BxRO0eF8DEXMJ1QqivEEnFtLEVxQAcKjbIx8m2O_ejW_rMeUzsI8tHO-cLAQrLW9yzxSpz6EUGwwOhjKGkOtCHpv_wiZTiV2-f2KqDFbNJnKbiSF-_Np1wUPUwA8fvffsDpwlL1CXFtpi8jO6P8q2bMB13-iN4HKWzoFaQKnaNqn9TY0GQAIVmfGm2H1pUbwIIbG-o3VLA')">
<span class="absolute top-2 left-2 bg-secondary text-on-secondary font-label-sm text-label-sm px-space-xs py-0.5 rounded shadow-sm">IPS &amp; Pre-Business</span>
</div>
<div class="p-space-md flex flex-col gap-space-xs">
<h3 class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold">Ekonomi Bisnis &amp; Hubungan Internasional</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Pengembangan kepemimpinan diplomasi (Model UN), literasi finansial pasar modal, dan inkubasi wirausaha rintisan muda.</p>
<div class="flex flex-wrap gap-1.5 pt-1">
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">Galeri Investasi BEI</span>
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">Debat Bahasa Inggris</span>
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">Sociopreneur</span>
</div>
</div>
</div>
<!-- Cambridge Card -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors">
<div class="h-32 w-full bg-cover bg-center relative" data-alt="Diverse smart Indonesian students in Cambridge uniform preparing international exam materials in a sunlit modern study lounge with laptops and textbooks" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuA15hDOoaaXEE6CRY1I5nnVcRvYlp9ZXSceaTGv56rGSP99G_F3jmrHzzcD5gyVTI7Wt4RyHM-EVOXWKn8mlnKhYqeY6XOo2b-6oJzjZBBVrGvIPiO4wWnhAP6qM9q3vt_YwyybMoPe8e3HY_pq3RjMVTEJDbEStXyIWY9vyntMqsR8olqKCFaIAG0NmM1DIQATq06RRDdW68ptIna4TaOCTDo8u7y7C29fB0lLlcH9eJH5ulPMa6PNPg')">
<span class="absolute top-2 left-2 bg-tertiary-container text-on-tertiary font-label-sm text-label-sm px-space-xs py-0.5 rounded shadow-sm">Cambridge International</span>
</div>
<div class="p-space-md flex flex-col gap-space-xs">
<h3 class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold">Cambridge AS &amp; A Level Pathway</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Kurikulum kualifikasi global berbahasa pengantar Inggris untuk persiapan langsung kuliah ke luar negeri.</p>
<div class="flex flex-wrap gap-1.5 pt-1">
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">Sertifikasi Resmi</span>
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">SAT &amp; IELTS Prep</span>
<span class="bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-slate-300 font-label-sm text-label-sm px-2 py-0.5 rounded">Overseas Advisory</span>
</div>
</div>
</div>
</div>
<!-- Panel 2: Ekskul (Hidden by default, toggled via JS) -->
<div class="hidden flex flex-col gap-space-sm" id="panel-ekskul">
<div class="grid grid-cols-2 gap-space-xs">
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-sm rounded-lg flex flex-col items-center text-center gap-1 shadow-sm">
<span class="material-symbols-outlined text-secondary dark:text-amber-400 text-[28px]">sports_basketball</span>
<span class="font-label-md text-label-md font-bold text-on-surface dark:text-white">Basket &amp; Futsal</span>
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">Juara DBL Series</span>
</div>
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-sm rounded-lg flex flex-col items-center text-center gap-1 shadow-sm">
<span class="material-symbols-outlined text-primary dark:text-blue-300 text-[28px]">precision_manufacturing</span>
<span class="font-label-md text-label-md font-bold text-on-surface dark:text-white">Robotics Club</span>
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">Medali Emas WRO</span>
</div>
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-sm rounded-lg flex flex-col items-center text-center gap-1 shadow-sm">
<span class="material-symbols-outlined text-tertiary-container dark:text-emerald-400 text-[28px]">music_note</span>
<span class="font-label-md text-label-md font-bold text-on-surface dark:text-white">Paduan Suara &amp; Orkestra</span>
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">Grand Prix Eropa</span>
</div>
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-sm rounded-lg flex flex-col items-center text-center gap-1 shadow-sm">
<span class="material-symbols-outlined text-error dark:text-rose-400 text-[28px]">palette</span>
<span class="font-label-md text-label-md font-bold text-on-surface dark:text-white">Desain Grafis &amp; Sinema</span>
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">FLLSN Nasional</span>
</div>
</div>
</div>
</section>
<!-- 5. FASILITAS KAMPUS UNGGULAN -->
<section class="px-gutter py-space-lg flex flex-col gap-space-md">
<div class="flex items-center justify-between">
<div class="flex flex-col">
<span class="font-label-sm text-label-sm text-secondary dark:text-amber-400 uppercase tracking-widest font-bold">Fasilitas Standar Dunia</span>
<h2 class="font-headline-md text-headline-md text-primary dark:text-blue-300 leading-tight">Kampus Hijau &amp; Nyaman</h2>
</div>
<span class="material-symbols-outlined text-on-surface-variant dark:text-slate-400">swipe_left</span>
</div>
<!-- Horizontal Swipeable Cards -->
<div class="flex gap-space-sm overflow-x-auto pb-space-xs no-scrollbar -mx-gutter px-gutter">
<!-- Fasilitas 1 -->
<div class="w-64 shrink-0 bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors">
<div class="h-36 w-full bg-cover bg-center" data-alt="High tech STEM science laboratory with glass cabinets, modern chemical hoods, robotic arm kits, and digital microscopes in clean bright school campus" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuCXw5rpRDyaRztWn-sG5C7D0MHGyHI4lmfb-vDqe_ngI5JGupoi1Wn6owhBNKejWQ30mQ-bALvnYyMx7S9txT-UFJKZSOlEPLSEEFQxFvLnkhH3mK7jIdy_NRFauT9zWAzLkRYuHDsez-9MCv8xDxXfOQVEnMkdnOyMHgoGdu9egFksElx8ddzdADVnCEg6-Awm4xrPAhdunHfYx3zxTEEO6ArEcNtHi-HxGn70XEjYQLbsJPY-1L0sRA')"></div>
<div class="p-space-sm flex flex-col">
<h4 class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold">Lab Sains Terintegrasi &amp; STEM</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Dilengkapi peralatan riset mutakhir standar olimpiade internasional.</p>
</div>
</div>
<!-- Fasilitas 2 -->
<div class="w-64 shrink-0 bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors">
<div class="h-36 w-full bg-cover bg-center" data-alt="Spacious contemporary school library with tall wooden bookshelves, ergonomic lounge chairs, private discussion pods, and warm reading lamps" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuCK9UzIvd0mS8YJZkN6ACNJxYITtzTgW3qrDCO_sPe9kbaM1mbPD5YtLe610ZUitWW8jwz_OCQMphzR-py2Y9FXgS0hK2wM7lDlT_RqLLojAsOdZtFl1EBzdiTXEEJT8LbB9ZojlNs7ZhWgqRvSZv_vXXndVojktumkKOPyCBDEIQYjKC9qqSOpHXDo1UTvQ_481ZT7NwZxFuYpKJdC1tB39-c-FHs4bQRXg8F4eSPrBkLP-CaA03gwbw')"></div>
<div class="p-space-sm flex flex-col">
<h4 class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold">Perpustakaan &amp; Digital Hub</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Ribuan koleksi referensi cetak dan e-journal internasional.</p>
</div>
</div>
<!-- Fasilitas 3 -->
<div class="w-64 shrink-0 bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors">
<div class="h-36 w-full bg-cover bg-center" data-alt="Grand indoor sports hall gymnasium with polished hardwood court, basketball hoops, retractable spectator stands, and bright LED arena lighting" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuDrg17hVtQ7-5rFP4XpIXrzK5fB6oWN-ArLEpyCKCmaMc9eUAUiax-uZO9hTQE3NAEEGKf4-10clzueWZ4I9etm7Lfy1yFFixN4TSYCeIPLlKCQL0cJVEyDEwoNqQWOniCyTz2zXr_kifP6pLW46Re-doDMoOccbc6uF8wck2C4kOqKONV7Er9MyySBNWlQ9K4M35wa-M2cInAlm9jfQsuwxpsJR3dnZZ5NzhXeV4qZ-kPKncXIs-68Iw')"></div>
<div class="p-space-sm flex flex-col">
<h4 class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold">Indoor Sports Hall</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Lapangan basket dan bulutangkis tertutup berstandar FIBA.</p>
</div>
</div>
<!-- Fasilitas 4 -->
<div class="w-64 shrink-0 bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors">
<div class="h-36 w-full bg-cover bg-center" data-alt="Serene eco-friendly modern school mosque with open airy architecture, geometric Islamic patterns, surrounding water reflection pool, and lush gardens" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuDVZSrakUO2bvxh7S33l5p3pL1yaTb4Gp5DgafKOMtCL6sdwdDzrYcfLi05ctnQsRSkUXLMO7CAam8m29UGMIZ5ajG1cGTLwaQ9NpA5kIsb3itflM-DzGP05EdLJ0v4AQIkm1SEw7ZADPLrJBgaQLILqhopnnUM1lpCBknly5-6ngS-8VmskEqmDkstB41q-I1sN5oVzmuJkszTky1in84aJtVqIxvc26-NUuCnpF5VGXVWNB2IbibTyA')"></div>
<div class="p-space-sm flex flex-col">
<h4 class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold">Masjid Ramah Lingkungan</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Pusat pembinaan spiritual dan tadarus Al-Qur'an harian.</p>
</div>
</div>
</div>
<!-- Virtual Tour Button -->
<a class="w-full h-11 bg-surface-container dark:bg-[#151b2b] dark:border dark:border-white/10 text-primary dark:text-blue-300 rounded-lg font-label-md text-label-md flex items-center justify-center gap-space-xs hover:bg-surface-container-high dark:hover:bg-slate-800 transition-colors" href="#">
<span class="material-symbols-outlined text-[20px]">view_in_ar</span>
<span>Jelajahi Virtual Tour 360° Kampus</span>
</a>
</section>
<!-- 6. ALUR PENDAFTARAN PMB MOBILE -->
<section class="bg-surface-container-low dark:bg-[#0d1424] py-space-lg px-gutter flex flex-col gap-space-md transition-colors" id="daftar-pmb">
<div class="flex flex-col gap-1">
<span class="font-label-sm text-label-sm text-secondary dark:text-amber-400 uppercase tracking-widest font-bold">Prosedur Penerimaan</span>
<h2 class="font-headline-md text-headline-md text-primary dark:text-blue-300 leading-tight">Alur PMB 2025/2026</h2>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Proses pendaftaran transparan, cepat, dan sepenuhnya dapat diakses daring lewat ponsel Anda.</p>
</div>
<!-- Gelombang Aktif Notification Card -->
<div class="bg-primary dark:bg-blue-950 dark:border dark:border-blue-700/50 text-on-primary p-space-md rounded-xl shadow-md flex items-start gap-space-sm">
<div class="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-fixed flex items-center justify-center shrink-0">
<span class="material-symbols-outlined text-[18px]">verified</span>
</div>
<div class="flex flex-col">
<span class="font-title-md text-title-md font-bold text-on-primary">Gelombang 1: Early Bird Dibuka</span>
<span class="font-body-sm text-body-sm text-inverse-on-surface dark:text-slate-200">Periode: 1 Okt 2024 - 31 Des 2024. Potongan DPP 25% + Bebas Biaya Formulir Pendaftaran.</span>
</div>
</div>
<!-- Stepper Vertikal 4 Langkah -->
<div class="flex flex-col gap-space-md pl-2">
<!-- Step 1 -->
<div class="flex gap-space-sm relative">
<div class="flex flex-col items-center">
<div class="w-8 h-8 rounded-full bg-primary dark:bg-blue-600 text-on-primary flex items-center justify-center font-label-md text-label-md shadow-sm">1</div>
<div class="w-0.5 h-full bg-primary-fixed dark:bg-blue-900 mt-1"></div>
</div>
<div class="flex flex-col pb-space-sm">
<h4 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Registrasi Akun Calon Siswa</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Isi biodata awal secara daring dan unggah scan rapor SMP semester 1-4 melalui portal PMB.</p>
</div>
</div>
<!-- Step 2 -->
<div class="flex gap-space-sm relative">
<div class="flex flex-col items-center">
<div class="w-8 h-8 rounded-full bg-primary dark:bg-blue-600 text-on-primary flex items-center justify-center font-label-md text-label-md shadow-sm">2</div>
<div class="w-0.5 h-full bg-primary-fixed dark:bg-blue-900 mt-1"></div>
</div>
<div class="flex flex-col pb-space-sm">
<h4 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Tes Pemetaan &amp; Minat Bakat</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Ujian daring penalaran skolastik, psikotes minat penjurusan, dan wawancara komite sekolah.</p>
</div>
</div>
<!-- Step 3 -->
<div class="flex gap-space-sm relative">
<div class="flex flex-col items-center">
<div class="w-8 h-8 rounded-full bg-primary dark:bg-blue-600 text-on-primary flex items-center justify-center font-label-md text-label-md shadow-sm">3</div>
<div class="w-0.5 h-full bg-primary-fixed dark:bg-blue-900 mt-1"></div>
</div>
<div class="flex flex-col pb-space-sm">
<h4 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Pengumuman &amp; Penetapan Beasiswa</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Pemberitahuan hasil seleksi resmi via portal siswa dan penyerahan SK Beasiswa Prestasi.</p>
</div>
</div>
<!-- Step 4 -->
<div class="flex gap-space-sm">
<div class="flex flex-col items-center">
<div class="w-8 h-8 rounded-full bg-tertiary-container dark:bg-emerald-700 text-on-tertiary flex items-center justify-center font-label-md text-label-md shadow-sm">
<span class="material-symbols-outlined text-[16px]">done</span>
</div>
</div>
<div class="flex flex-col">
<h4 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Daftar Ulang &amp; Pengambilan Seragam</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Konfirmasi administrasi, fitting seragam resmi, dan penyambutan Masa Pengenalan Lingkungan Sekolah (MPLS).</p>
</div>
</div>
</div>
<!-- Quick Lead Form: Unduh Brosur & Biaya -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm transition-colors" id="unduh-brosur">
<div class="flex flex-col">
<span class="font-label-sm text-label-sm text-primary dark:text-blue-300 font-bold">Kirim Rincian Biaya</span>
<h4 class="font-title-md text-title-md text-on-surface dark:text-white font-bold">Unduh Brosur &amp; Simulasi SPP</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Dapatkan booklet kurikulum dan rincian pembiayaan lengkap via pesan instan WhatsApp.</p>
</div>
<form class="flex flex-col gap-space-xs" onsubmit="event.preventDefault(); alert('Brosur dan estimasi biaya telah dikirim ke WhatsApp Anda!');">
<div>
<label class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-300 block mb-1">Nama Lengkap Orang Tua / Wali</label>
<input class="w-full h-11 px-space-sm rounded-lg bg-surface-container dark:bg-slate-800/90 text-on-surface dark:text-white font-body-sm text-body-sm border border-transparent dark:border-white/15 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-400" placeholder="Contoh: Ibu Hendrawan" required="" type="text"/>
</div>
<div>
<label class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-300 block mb-1">Nomor WhatsApp Aktif</label>
<input class="w-full h-11 px-space-sm rounded-lg bg-surface-container dark:bg-slate-800/90 text-on-surface dark:text-white font-body-sm text-body-sm border border-transparent dark:border-white/15 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-400" placeholder="0812-XXXX-XXXX" required="" type="tel"/>
</div>
<button class="w-full h-11 bg-tertiary-container dark:bg-emerald-600 text-on-tertiary rounded-lg font-label-md text-label-md flex items-center justify-center gap-space-xs mt-1 shadow-sm active:scale-95 transition-transform" type="submit">
<span class="material-symbols-outlined text-[18px]">send_to_mobile</span>
<span>Kirim Brosur ke WhatsApp Saya</span>
</button>
</form>
</div>
</section>
<!-- 7. BERITA & PRESTASI TERKINI -->
<section class="px-gutter py-space-lg flex flex-col gap-space-md">
<div class="flex items-center justify-between">
<div class="flex flex-col">
<span class="font-label-sm text-label-sm text-secondary dark:text-amber-400 uppercase tracking-widest font-bold">Kabar Sekolah</span>
<h2 class="font-headline-md text-headline-md text-primary dark:text-blue-300 leading-tight">Prestasi &amp; Agenda</h2>
</div>
<a class="font-label-sm text-label-sm text-primary dark:text-blue-400 font-bold" href="#">Lihat Semua</a>
</div>
<div class="flex flex-col gap-space-sm">
<!-- Berita 1 -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-sm rounded-xl shadow-sm flex gap-space-sm items-center transition-colors">
<img class="w-20 h-20 rounded-lg object-cover shrink-0" data-alt="Indonesian high school student smiling proudly holding golden trophy and medal after winning International Physics Olympiad competition, stage backdrop with school emblem" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCLSyLe0Gh6XkgOZVBhmO2phOO_9-7mkPgGAg6sMgQfa8qlfvvzPDxk964y7XP-KX1btY60MNo3FAHigNKvQgDbzRAw5Fc7gNRGLz5H_z5NfeGu_E6lbBULlgPdXb3qo8VHIx-_JMp8NBEf8fiQGUp-DgXUizgTMA3rGTXZVmX-MEe1JQ5EZs09obLbUl7bvqPmxTXy4-CuRScNVgwzKLRiSRnzHKiQi9JfKgm48bf1PF-jhun8jTKmkQ"/>
<div class="flex flex-col min-w-0">
<span class="font-label-sm text-label-sm text-tertiary-container dark:text-emerald-400 font-bold">Prestasi Dunia • Kemarin</span>
<h4 class="font-title-md text-title-md text-on-surface dark:text-white font-bold truncate">Medali Emas Olimpiade Fisika di Tokyo</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400 line-clamp-2">Siswa kami berhasil mengungguli 45 negara dalam ajang International Physics Challenge 2024.</p>
</div>
</div>
<!-- Berita 2 -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-sm rounded-xl shadow-sm flex gap-space-sm items-center transition-colors">
<img class="w-20 h-20 rounded-lg object-cover shrink-0" data-alt="Auditorium hall filled with high school students and parents attending university education fair with campus booths from UI, ITB, NUS and Melbourne Uni" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDrjmRXw78q7oLrCkwzeDtuXPFrSy2x0g5RxhGmBKk9EZzNKSHqGHV7ZwAbTYlDrGDf5P4J1dDp5zYJhHiESAOy5WRbs431EEAEiSmI8OQIOtHqAVMONoSduWAVH0zGDJoDmbIiVeBjrm7UTsKncmy1A3-d87eXws42gjX6giluOGcEMfpupB49rdfNH84v030COeg3FO3d_5nWDNZZGAC-6c-hFyhtkH7dnqG5h8a6QNxqK484Btmj8A"/>
<div class="flex flex-col min-w-0">
<span class="font-label-sm text-label-sm text-primary dark:text-blue-400 font-bold">Agenda • 25 Nov 2024</span>
<h4 class="font-title-md text-title-md text-on-surface dark:text-white font-bold truncate">Global Mandiri Education &amp; Career Expo</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400 line-clamp-2">Pameran 50+ perguruan tinggi top dalam dan luar negeri terbuka gratis bagi calon pendaftar.</p>
</div>
</div>
</div>
</section>
<!-- 8. TESTIMONI ALUMNI & ORANG TUA -->
<section class="bg-surface-container-low dark:bg-[#0d1424] py-space-lg px-gutter flex flex-col gap-space-md transition-colors">
<div class="flex flex-col gap-1">
<span class="font-label-sm text-label-sm text-secondary dark:text-amber-400 uppercase tracking-widest font-bold">Kisah Sukses</span>
<h2 class="font-headline-md text-headline-md text-primary dark:text-blue-300 leading-tight">Kata Alumni &amp; Orang Tua</h2>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Bukti nyata lingkungan bertumbuh yang inspiratif dan berkesinambungan.</p>
</div>
<!-- Swipeable Testimonial Cards -->
<div class="flex gap-space-sm overflow-x-auto pb-space-xs no-scrollbar -mx-gutter px-gutter">
<!-- Testi 1 -->
<div class="w-72 shrink-0 bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-md rounded-xl shadow-sm flex flex-col justify-between transition-colors">
<div class="flex flex-col gap-space-xs">
<div class="flex text-secondary-container">
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-300 italic">"SMA Global Mandiri memberi fondasi riset kuat yang memudahkan saya beradaptasi cepat di perkuliahan kedokteran."</p>
</div>
<div class="flex items-center gap-space-xs pt-space-sm">
<img class="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20 dark:ring-white/10" data-alt="Portrait of successful Indonesian young female medical student in doctor lab coat with stethoscope smiling warmly" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAi3mprqkD-JvKITrrRleRbG8m3UkKWMvOCyVM5r2xzWSFEzYfuXtnAUEH2Ft6ZomR5SZsWo_Gd2k4OgORMlsqVNoyj56XiZUMJacMNew6G2U0QICHLHEnYuLgZszH1kv6o8L7ArGuqMgO88mFS8KwzVRntO3NWnxBWCLe6iM3qFOgtgidBkvn7NLcnOEDgMglCBYNR1JU_v9z3IxUg6ylxVIekaxRf62jJdM59ffnb-fQuTpGQyFL1Kg"/>
<div class="flex flex-col">
<span class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold leading-tight">dr. Amanda Putri</span>
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">Alumni 2019 • FK Universitas Indonesia</span>
</div>
</div>
</div>
<!-- Testi 2 -->
<div class="w-72 shrink-0 bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-md rounded-xl shadow-sm flex flex-col justify-between transition-colors">
<div class="flex flex-col gap-space-xs">
<div class="flex text-secondary-container">
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-300 italic">"Guru-gurunya sangat suportif dan komunikatif. Anak kami bertumbuh menjadi anak yang mandiri, kritis, dan beretika."</p>
</div>
<div class="flex items-center gap-space-xs pt-space-sm">
<img class="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20 dark:ring-white/10" data-alt="Indonesian mature mother in modest elegant attire smiling pleasantly outdoors during school event" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAkqEk2ri_k7KlU2g_1AsBsLt_jhzge5hWc_8qyisiv6_iFrFF6IJKnpiM0zRw0JSASYq_j0cfjn7HkcgiTZOo3VWNC1uHPh9HIrLijSWTzjDl2GHUM9LzL6XEex54Bw1XqBqrQ_-oOyGwqlZ6DoHkOViLdI4Bpd9Nq7sEmao0_Dl1jd43b0TmnvDYg2QRmjkmmNJy_sCaAlHw3CE8RJ2ABgbiGLXbDrnX197zhoandfHGG_xFIec4Uaw"/>
<div class="flex flex-col">
<span class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold leading-tight">Ibu Rina Anggraini</span>
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">Orang Tua Siswa Angkatan 2023</span>
</div>
</div>
</div>
<!-- Testi 3 -->
<div class="w-72 shrink-0 bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 p-space-md rounded-xl shadow-sm flex flex-col justify-between transition-colors">
<div class="flex flex-col gap-space-xs">
<div class="flex text-secondary-container">
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-300 italic">"Persiapan sertifikasi Cambridge di sini sangat terstruktur sehingga saya tembus beasiswa penuh di Singapura."</p>
</div>
<div class="flex items-center gap-space-xs pt-space-sm">
<img class="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20 dark:ring-white/10" data-alt="Confident Indonesian young male engineering student with backpack in front of modern campus buildings, bright optimistic expression" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDzuKoRZZcWce5m7ms2EVZZwbllnAR9-AdN9IvZNHQLER7KvHd7930edVt-3XkMcsCc4cVIp_WhNBAtaOiizzkCpI1sfxgN0hC9jCs-WJzpJAgYF8FSEVWVA4Hp9OafbuUCvNdjRftNqTaJZEb9C4s35MtbE3Wdk_hybqtW2-yQFQxcpaBVdA6k-7c33T105A1MfgMHpMNryJHRJ3CBRuIl9ierBPNjl32MosxcRdhdGspoeOhtPJYe7Q"/>
<div class="flex flex-col">
<span class="font-title-md text-title-md text-primary dark:text-blue-300 font-bold leading-tight">Farhan Maulana, B.Eng</span>
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">Alumni 2021 • NTU Singapore</span>
</div>
</div>
</div>
</div>
</section>
<!-- 9. FAQ ACCORDION MOBILE -->
<section class="px-gutter py-space-lg flex flex-col gap-space-md">
<div class="flex flex-col gap-1">
<span class="font-label-sm text-label-sm text-secondary dark:text-amber-400 uppercase tracking-widest font-bold">Tanya Jawab</span>
<h2 class="font-headline-md text-headline-md text-primary dark:text-blue-300 leading-tight">Pertanyaan Populer (FAQ)</h2>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Jawaban cepat untuk pertanyaan yang sering diajukan orang tua siswa.</p>
</div>
<div class="flex flex-col gap-space-xs">
<!-- FAQ 1 -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm transition-colors">
<button class="w-full p-space-md flex items-center justify-between text-left gap-space-xs" onclick="toggleFaq(this)">
<span class="font-title-md text-title-md text-primary dark:text-white font-bold">Apakah tersedia beasiswa prestasi akademik &amp; non-akademik?</span>
<span class="material-symbols-outlined text-primary dark:text-blue-400 transition-transform duration-200">expand_more</span>
</button>
<div class="hidden px-space-md pb-space-md text-on-surface-variant dark:text-slate-300 font-body-sm text-body-sm">
          Ya, kami menyediakan Beasiswa Prestasi Jalur Emas (diskon DPP hingga 100%) untuk peraih medali OSN/O2SN/FLS2N minimal tingkat provinsi serta beasiswa hafiz Al-Qur'an.
        </div>
</div>
<!-- FAQ 2 -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm transition-colors">
<button class="w-full p-space-md flex items-center justify-between text-left gap-space-xs" onclick="toggleFaq(this)">
<span class="font-title-md text-title-md text-primary dark:text-white font-bold">Bagaimana sistem seleksi masuk calon siswa baru?</span>
<span class="material-symbols-outlined text-primary dark:text-blue-400 transition-transform duration-200">expand_more</span>
</button>
<div class="hidden px-space-md pb-space-md text-on-surface-variant dark:text-slate-300 font-body-sm text-body-sm">
          Seleksi meliputi tes potensi skolastik komputerisasi (online/onsite), psikotes penentuan peminatan bakat, dan wawancara komitmen orang tua serta siswa.
        </div>
</div>
<!-- FAQ 3 -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm transition-colors">
<button class="w-full p-space-md flex items-center justify-between text-left gap-space-xs" onclick="toggleFaq(this)">
<span class="font-title-md text-title-md text-primary dark:text-white font-bold">Apakah sekolah menyediakan asrama / boarding school?</span>
<span class="material-symbols-outlined text-primary dark:text-blue-400 transition-transform duration-200">expand_more</span>
</button>
<div class="hidden px-space-md pb-space-md text-on-surface-variant dark:text-slate-300 font-body-sm text-body-sm">
          SMA Global Mandiri menyelenggarakan model Fullday School (Senin-Jumat, 07.15 - 15.45 WIB). Kami juga bermitra dengan residensi asrama terakreditasi khusus siswa luar kota dengan pengawasan pembimbing 24 jam.
        </div>
</div>
<!-- FAQ 4 -->
<div class="bg-surface-container-lowest dark:bg-[#151b2b] dark:border dark:border-white/10 rounded-xl overflow-hidden shadow-sm transition-colors">
<button class="w-full p-space-md flex items-center justify-between text-left gap-space-xs" onclick="toggleFaq(this)">
<span class="font-title-md text-title-md text-primary dark:text-white font-bold">Bagaimana proses pindahan (mutasi) siswa dari sekolah lain?</span>
<span class="material-symbols-outlined text-primary dark:text-blue-400 transition-transform duration-200">expand_more</span>
</button>
<div class="hidden px-space-md pb-space-md text-on-surface-variant dark:text-slate-300 font-body-sm text-body-sm">
          Mutasi siswa kelas 10 dan 11 dibuka setiap pergantian semester sesuai ketersediaan kuota bangku, dengan syarat nilai rapor rata-rata minimal 80 dan lolos tes asesmen adaptasi.
        </div>
</div>
</div>
</section>
<!-- 10. FOOTER & LOCATION INFO -->
<footer class="bg-surface-container-high dark:bg-[#0b1120] dark:border-t dark:border-white/10 py-space-lg px-gutter flex flex-col gap-space-md transition-colors">
<div class="flex flex-col gap-1">
<div class="flex items-center gap-space-xs">
<span class="material-symbols-outlined text-primary dark:text-blue-400 text-[24px]">school</span>
<span class="font-headline-sm text-headline-sm text-primary dark:text-blue-300 font-bold">SMA Global Mandiri</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">Kampus Pendidikan Unggulan Mandiri Terpadu. Menempa pemimpin masa depan yang berkarakter kuat dan berdaya saing global.</p>
</div>
<!-- Location View -->
<div class="flex flex-col gap-space-xs">
<div class="w-full h-40 bg-cover bg-center rounded-xl shadow-inner relative flex items-end p-space-sm border border-transparent dark:border-white/10" data-location="SMA Global Mandiri Jakarta" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuCzOaYw6ocXZ4WtFtNpcr0aL5NJRFYNX2LMT4RMYBmj8Hb5LrJdfH-jFt19nVXIaVby-wgvdwOi0OtAJxlJyn3sjEoTOs5gwU_I5xrZ61ZONy7uCJfkILMGIhbFCSBX-E_uZ6ArG6p_Kzysh79Y49crkDTO3NGzm0nVA8Fe6ORVylFbC-s39i_wa32FjdxeDQ19nzdnQHWX9zCumpCpG2m61az3MbagN4fdI3e8GmRT9-QlwNfUv_OvaQ')">
<div class="bg-surface/90 dark:bg-slate-900/90 backdrop-blur-sm p-space-xs rounded-lg flex items-center gap-1.5 shadow-sm border border-white/10">
<span class="material-symbols-outlined text-error text-[18px]">location_on</span>
<span class="font-label-sm text-label-sm text-on-surface dark:text-white font-bold">Komp. Edukasi Mandiri Kav. 12-15</span>
</div>
</div>
<div class="flex items-center justify-between pt-1">
<div class="flex flex-col">
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-400">Buka Kunjungan Kampus:</span>
<span class="font-label-md text-label-md text-primary dark:text-blue-300 font-bold">Senin - Sabtu (08.00 - 16.00 WIB)</span>
</div>
<a class="px-space-sm py-2 bg-primary dark:bg-blue-600 text-on-primary font-label-sm text-label-sm rounded-lg flex items-center gap-1 shadow-sm" href="https://maps.google.com" target="_blank">
<span class="material-symbols-outlined text-[16px]">directions</span>
<span>Buka Peta</span>
</a>
</div>
</div>
<!-- Official Hotline Contacts -->
<div class="flex flex-col gap-space-xs pt-space-xs">
<div class="flex items-center gap-space-xs text-on-surface-variant dark:text-slate-400">
<span class="material-symbols-outlined text-tertiary-container dark:text-emerald-400 text-[18px]">call</span>
<span class="font-body-sm text-body-sm">Hotline PMB: (021) 8899-7722 / 0811-9988-7711</span>
</div>
<div class="flex items-center gap-space-xs text-on-surface-variant dark:text-slate-400">
<span class="material-symbols-outlined text-primary dark:text-blue-400 text-[18px]">mail</span>
<span class="font-body-sm text-body-sm">admisi@globalmandiri.sch.id</span>
</div>
</div>
<div class="pt-space-sm text-center">
<span class="font-label-sm text-label-sm text-on-surface-variant dark:text-slate-500">© 2025 SMA Global Mandiri. All rights reserved.</span>
</div>
</footer>
<!-- FLOATING QUICK ACTION BAR (Thumb-friendly mobile bottom CTA) -->
<div class="sticky bottom-0 z-40 w-full px-gutter py-2.5 bg-surface/90 dark:bg-[#080e1d]/90 backdrop-blur-xl border-t border-transparent dark:border-white/10 shadow-lg flex items-center gap-space-xs transition-colors">
<a class="flex-1 h-11 bg-tertiary-container dark:bg-emerald-700 text-on-tertiary rounded-lg font-label-md text-label-md flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-transform" href="https://wa.me/6281199887711">
<span class="material-symbols-outlined text-[18px]">chat</span>
<span>Tanya Admin WA</span>
</a>
<a class="flex-[1.3] h-11 bg-secondary-container text-on-secondary-fixed rounded-lg font-label-md text-label-md flex items-center justify-center gap-1 shadow-sm font-bold active:scale-95 transition-transform" href="#daftar-pmb">
<span class="material-symbols-outlined text-[18px]">how_to_reg</span>
<span>Daftar PMB 25%</span>
</a>
</div>
</div>
<script>
  // Dark/Light Theme Switcher Handler
  function toggleTheme() {
    const htmlEl = document.documentElement;
    const isDark = htmlEl.classList.contains('dark');
    
    if (isDark) {
      htmlEl.classList.remove('dark');
      htmlEl.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      htmlEl.classList.add('dark');
      htmlEl.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  }

  // Listen to system theme change if no explicit stored theme
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
      if (e.matches) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    }
  });

  // Tab Switcher Logic
  const tabPeminatan = document.getElementById('tab-peminatan');
  const tabEkskul = document.getElementById('tab-ekskul');
  const panelPeminatan = document.getElementById('panel-peminatan');
  const panelEkskul = document.getElementById('panel-ekskul');

  if (tabPeminatan && tabEkskul) {
    tabPeminatan.addEventListener('click', function() {
      tabPeminatan.classList.add('bg-surface-container-lowest', 'dark:bg-slate-800', 'text-primary', 'dark:text-white', 'shadow-sm');
      tabPeminatan.classList.remove('text-on-surface-variant', 'dark:text-slate-400');
      tabEkskul.classList.remove('bg-surface-container-lowest', 'dark:bg-slate-800', 'text-primary', 'dark:text-white', 'shadow-sm');
      tabEkskul.classList.add('text-on-surface-variant', 'dark:text-slate-400');
      panelPeminatan.classList.remove('hidden');
      panelEkskul.classList.add('hidden');
    });

    tabEkskul.addEventListener('click', function() {
      tabEkskul.classList.add('bg-surface-container-lowest', 'dark:bg-slate-800', 'text-primary', 'dark:text-white', 'shadow-sm');
      tabEkskul.classList.remove('text-on-surface-variant', 'dark:text-slate-400');
      tabPeminatan.classList.remove('bg-surface-container-lowest', 'dark:bg-slate-800', 'text-primary', 'dark:text-white', 'shadow-sm');
      tabPeminatan.classList.add('text-on-surface-variant', 'dark:text-slate-400');
      panelEkskul.classList.remove('hidden');
      panelPeminatan.classList.add('hidden');
    });
  }

  // FAQ Accordion Expand/Collapse Logic
  function toggleFaq(btn) {
    const answer = btn.nextElementSibling;
    const icon = btn.querySelector('.material-symbols-outlined');
    if (answer.classList.contains('hidden')) {
      answer.classList.remove('hidden');
      if (icon) icon.classList.add('rotate-180');
    } else {
      answer.classList.add('hidden');
      if (icon) icon.classList.remove('rotate-180');
    }
  }
</script></main><nav class="fixed bottom-0 w-full z-50 pb-safe bg-surface/95 dark:bg-[#080e1d]/95 backdrop-blur-xl border-t border-transparent dark:border-white/10 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)] transition-colors duration-300" data-active-classes="text-primary font-label-md"><div class="h-20 px-space-md flex items-center justify-between max-w-lg mx-auto"><a aria-current="page" class="flex-1 flex flex-col items-center justify-center min-h-[44px] gap-0.5 transition-colors text-primary dark:text-blue-400 font-label-md" data-path="beranda" href="#"><span class="material-symbols-outlined">home</span><span class="font-label-sm text-label-sm">Beranda</span></a><a class="flex-1 flex flex-col items-center justify-center min-h-[44px] gap-0.5 text-on-surface-variant dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 transition-colors" data-path="program-akademik" href="#"><span class="material-symbols-outlined">school</span><span class="font-label-sm text-label-sm">Program</span></a><a class="flex-[1.4] flex items-center justify-center h-11 px-space-sm bg-secondary-container text-on-secondary-fixed rounded-lg font-label-md text-label-md shadow-[0_2px_6px_rgba(254,166,25,0.3)] hover:brightness-95 transition-all" data-path="alur-pendaftaran" href="#"><span class="material-symbols-outlined mr-1 text-[18px]">app_registration</span><span>Daftar PMB</span></a><a class="flex-1 flex flex-col items-center justify-center min-h-[44px] gap-0.5 text-on-surface-variant dark:text-slate-400 hover:text-tertiary-container dark:hover:text-emerald-400 transition-colors" data-path="konsultasi-whatsapp" href="#"><span class="material-symbols-outlined text-tertiary-container dark:text-emerald-400">chat</span><span class="font-label-sm text-label-sm">Konsultasi</span></a><a class="flex-1 flex flex-col items-center justify-center min-h-[44px] gap-0.5 text-on-surface-variant dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 transition-colors" data-path="portal-siswa" href="#"><span class="material-symbols-outlined">account_circle</span><span class="font-label-sm text-label-sm">Akun</span></a></div></nav></body></html>