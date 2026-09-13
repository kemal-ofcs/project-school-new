ini desain untuk landing page Meksa khusu di folder web-public

<!DOCTYPE html>

<html class="scroll-smooth" lang="id"><head><meta charset="utf-8"/><meta content="width=device-width, initial-scale=1.0" name="viewport"/><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&amp;display=swap" rel="stylesheet"/><style>@layer base{html,body{margin:0;padding:0;}body{overscroll-behavior:none;}main>:first-child{margin-top:0!important;}main>:last-child{margin-bottom:0!important;}}::-webkit-scrollbar{display:none;}
/* Transisi halus saat pergantian tema */
html.dark {
  color-scheme: dark;
}
html.dark body {
  background-color: #0b1320;
  color: #e2e8f0;
}
html.dark header {
  background-color: rgba(15, 23, 42, 0.92) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
html.dark nav a {
  color: #cbd5e1;
}
html.dark nav a:hover {
  color: #90a8ff;
}
html.dark .text-on-surface {
  color: #f1f5f9 !important;
}
html.dark .text-on-surface-variant {
  color: #94a3b8 !important;
}
html.dark .text-primary {
  color: #90a8ff !important;
}
html.dark .bg-surface-container-lowest {
  background-color: #162032 !important;
  border-color: rgba(255, 255, 255, 0.06);
}
html.dark .bg-surface-container-low,
html.dark .bg-surface,
html.dark .bg-background {
  background-color: #0e1726 !important;
}
html.dark .bg-surface-container {
  background-color: #1e293b !important;
}
html.dark .bg-surface-container-high {
  background-color: #26354a !important;
}
html.dark #faqAccordion > div,
html.dark article,
html.dark .group.p-space-lg {
  background-color: #162032 !important;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.35);
}
html.dark input {
  background-color: #1e293b !important;
  color: #f8fafc !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
html.dark #facilityModal > div {
  background-color: #162032 !important;
  color: #e2e8f0;
}
</style><script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script><script id="tailwind-config">tailwind.config={darkMode:"class",theme:{extend:{"colors":{"background":"#f8f9ff","on-background":"#0b1c30","surface-container-high":"#dce9ff","surface-container-low":"#eff4ff","on-primary":"#ffffff","surface-container-lowest":"#ffffff","inverse-surface":"#213145","surface-tint":"#4059aa","tertiary-fixed":"#a6f4b5","primary":"#00236f","secondary-fixed-dim":"#ffb95f","primary-fixed":"#dce1ff","on-tertiary-container":"#71bc82","surface-container-highest":"#d3e4fe","secondary":"#855300","error-container":"#ffdad6","on-tertiary-fixed-variant":"#005226","inverse-on-surface":"#eaf1ff","on-secondary":"#ffffff","on-surface":"#0b1c30","error":"#ba1a1a","on-primary-fixed-variant":"#264191","tertiary-container":"#004b22","on-error":"#ffffff","primary-fixed-dim":"#b6c4ff","secondary-container":"#fea619","on-primary-fixed":"#00164e","surface-container":"#e5eeff","surface-dim":"#cbdbf5","tertiary-fixed-dim":"#8bd79b","on-tertiary":"#ffffff","on-secondary-fixed":"#2a1700","inverse-primary":"#b6c4ff","surface":"#f8f9ff","on-secondary-fixed-variant":"#653e00","tertiary":"#003214","surface-variant":"#d3e4fe","outline-variant":"#c5c5d3","on-primary-container":"#90a8ff","secondary-fixed":"#ffddb8","on-surface-variant":"#444651","on-error-container":"#93000a","primary-container":"#1e3a8a","surface-bright":"#f8f9ff","on-tertiary-fixed":"#00210b","on-secondary-container":"#684000","outline":"#757682"},"borderRadius":{"DEFAULT":"0.25rem","lg":"0.5rem","xl":"0.75rem","full":"9999px"},"spacing":{"gutter":"1.5rem","space-lg":"1.5rem","space-sm":"0.5rem","space-xs":"0.25rem","space-md":"1rem","margin":"1.5rem","space-xl":"2.5rem"},"fontFamily":{"headline-lg":["Inter"],"headline-lg-mobile":["Inter"],"title-lg":["Inter"],"title-md":["Inter"],"label-lg":["Inter"],"body-md":["Inter"],"label-sm":["Inter"],"display":["Inter"],"label-md":["Inter"],"body-lg":["Inter"],"headline-sm":["Inter"],"display-mobile":["Inter"],"body-sm":["Inter"],"headline-md":["Inter"]},"fontSize":{"headline-lg":["40px",{"lineHeight":"48px","letterSpacing":"-0.015em","fontWeight":"700"}],"headline-lg-mobile":["28px",{"lineHeight":"36px","letterSpacing":"-0.015em","fontWeight":"700"}],"title-lg":["18px",{"lineHeight":"26px","fontWeight":"600"}],"title-md":["16px",{"lineHeight":"24px","fontWeight":"600"}],"label-lg":["14px",{"lineHeight":"20px","letterSpacing":"0.01em","fontWeight":"600"}],"body-md":["15px",{"lineHeight":"24px","fontWeight":"400"}],"label-sm":["11px",{"lineHeight":"14px","letterSpacing":"0.04em","fontWeight":"700"}],"display":["56px",{"lineHeight":"64px","letterSpacing":"-0.02em","fontWeight":"800"}],"label-md":["12px",{"lineHeight":"16px","letterSpacing":"0.02em","fontWeight":"600"}],"body-lg":["18px",{"lineHeight":"28px","fontWeight":"400"}],"headline-sm":["20px",{"lineHeight":"28px","fontWeight":"600"}],"display-mobile":["36px",{"lineHeight":"44px","letterSpacing":"-0.02em","fontWeight":"800"}],"body-sm":["13px",{"lineHeight":"20px","fontWeight":"400"}],"headline-md":["28px",{"lineHeight":"36px","letterSpacing":"-0.01em","fontWeight":"600"}]}}}};</script></head><body class="bg-background font-body-md text-body-md text-on-surface antialiased transition-colors duration-300"><header class="fixed top-0 left-0 right-0 w-full z-50 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(15,23,42,0.06)] transition-colors duration-300"><div class="h-20 max-w-7xl mx-auto px-gutter flex items-center justify-between gap-space-md"><div class="flex items-center gap-space-sm"><div class="p-space-xs rounded-lg bg-surface-container-low flex items-center justify-center"><img alt="Logo SMA Global Mandiri" class="w-11 h-11 object-contain rounded-lg" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCzrUzNLfa2fIc0_poRk5gCCHwJm0gLDIji6qIvfgMTx8eBLTsCHiypISZNHcJe5XnhSMmqwmx5IdEbRpv8Qhij3JjV73RZOQmmyU_nD3c42MtBuDFWK9Ajfyszm6Q2dw_obUpj5qN7BN9ScDpVm6srZbgkQkA3w2OY5LJ-dRPo3NGI-A2RScycOAvXSICbPb_PDObd7CMCIf_k8N4CpjPyMkq4GUydflpyDPtXwVj9nnQaFfcWTZCdPg"/></div><div class="flex flex-col"><div class="flex items-center gap-space-xs"><span class="font-title-md text-title-md text-primary tracking-tight font-bold">SMA GLOBAL MANDIRI</span><span class="hidden sm:inline-block px-space-xs py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm">NPSN: 20108392</span></div><p class="hidden md:block font-body-sm text-body-sm text-on-surface-variant line-clamp-1">Unggul, Berkarakter &amp; Berdaya Saing Global</p></div></div><nav class="hidden xl:flex items-center gap-space-lg" data-active-classes="text-primary font-bold"><a class="text-on-surface-variant font-label-lg text-label-lg hover:text-primary transition-colors" data-path="profil" href="#">Profil</a><a class="text-on-surface-variant font-label-lg text-label-lg hover:text-primary transition-colors" data-path="program-dan-jurusan" href="#">Program &amp; Jurusan</a><a class="text-on-surface-variant font-label-lg text-label-lg hover:text-primary transition-colors" data-path="fasilitas" href="#">Fasilitas</a><a class="text-on-surface-variant font-label-lg text-label-lg hover:text-primary transition-colors" data-path="ekskul" href="#">Ekskul</a><a class="text-on-surface-variant font-label-lg text-label-lg hover:text-primary transition-colors" data-path="berita" href="#">Berita</a><a class="text-on-surface-variant font-label-lg text-label-lg hover:text-primary transition-colors" data-path="biaya-dan-alur-pmb" href="#">Biaya &amp; Alur PMB</a><a class="text-on-surface-variant font-label-lg text-label-lg hover:text-primary transition-colors" data-path="faq" href="#">FAQ</a></nav><div class="flex items-center gap-space-sm"><div class="hidden lg:flex items-center gap-space-xs px-space-md py-space-xs rounded-full bg-surface-container-low text-on-surface-variant font-label-md text-label-md"><span class="material-symbols-outlined text-secondary">call</span><span>(021) 7890-1234</span></div>
<!-- Switch Toggle Dark / Light Mode -->
<div class="relative flex items-center">
<button aria-label="Ganti Tema Tampilan" class="group relative flex items-center gap-1.5 p-1 rounded-full bg-surface-container border border-outline-variant/60 hover:border-primary transition-all duration-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40" id="themeToggleBtn" onclick="toggleTheme()" title="Ganti Mode Tampilan (Terang / Gelap)">
<!-- Sun indicator button -->
<span class="flex items-center justify-center w-7 h-7 rounded-full bg-white text-secondary-container shadow-sm transition-all duration-300" id="lightIconWrapper">
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">light_mode</span>
</span>
<!-- Text status label (desktop) -->
<span class="hidden sm:inline-block px-1.5 font-label-sm text-label-sm font-bold text-on-surface-variant group-hover:text-primary transition-colors" id="themeTextLabel">Terang</span>
<!-- Moon indicator button -->
<span class="flex items-center justify-center w-7 h-7 rounded-full text-outline transition-all duration-300" id="darkIconWrapper">
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">dark_mode</span>
</span>
</button>
</div>
<a class="inline-flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm hover:bg-secondary-container hover:text-on-secondary-container transition-all" data-path="daftar-pmb-online" href="#"><span class="material-symbols-outlined">how_to_reg</span><span>Daftar PMB Online</span></a><img alt="Profile" class="w-8 h-8 rounded-full object-cover border border-outline-variant" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCzrUzNLfa2fIc0_poRk5gCCHwJm0gLDIji6qIvfgMTx8eBLTsCHiypISZNHcJe5XnhSMmqwmx5IdEbRpv8Qhij3JjV73RZOQmmyU_nD3c42MtBuDFWK9Ajfyszm6Q2dw_obUpj5qN7BN9ScDpVm6srZbgkQkA3w2OY5LJ-dRPo3NGI-A2RScycOAvXSICbPb_PDObd7CMCIf_k8N4CpjPyMkq4GUydflpyDPtXwVj9nnQaFfcWTZCdPg"/></div></div></header><main class="w-full pt-20 bg-background transition-colors duration-300"><div class="flex flex-col w-full">
<!-- 1. HERO SECTION -->
<section class="relative w-full overflow-hidden bg-primary text-on-primary">
<!-- Ambient Scrim / Photo Background -->
<div class="absolute inset-0 z-0 bg-cover bg-center opacity-30 transform scale-105 transition-transform duration-1000" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuD9J-qy16ANwG1wGJfcJg2JOXN69oPJqSxSHdm8nN2qgLz8huUKBERB1NqiUoBEf8mlnlEE_pS8dad8b49aVf9z6TeL8WWZxcAvQbsXATA0RQ0EhXLOl5PYEnHencg8SH9FzeBOUavMmklNAxILhyQKmNgUAYNB4T6ZXc1mWQUkbzISd73BQbLIruNb1PcO-X1R2JuEFYFH-HR--H5GjXxi846fDok3Eb41Bj58Gv7IWmV_I7EyN4qMiQ');"></div>
<div class="absolute inset-0 z-0 bg-gradient-to-r from-primary via-primary/95 to-primary-container/85"></div>
<div class="absolute -top-32 -right-32 w-96 h-96 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none"></div>
<div class="relative z-10 max-w-7xl mx-auto px-gutter pt-space-xl pb-28 flex flex-col items-start gap-space-lg">
<!-- Announcement / Countdown Banner -->
<div class="inline-flex flex-wrap items-center gap-space-xs px-space-md py-space-xs rounded-full bg-surface-container-lowest/15 backdrop-blur-md shadow-sm">
<span class="flex h-2.5 w-2.5 rounded-full bg-secondary-container animate-pulse"></span>
<span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary-fixed">PMB 2025/2026 Dibuka</span>
<span class="text-on-primary/40 text-xs">•</span>
<span class="font-label-md text-label-md text-surface-container-highest">Gelombang 1 Early Bird — Diskon DPP 25%</span>
<span class="px-2 py-0.5 rounded bg-error text-on-error font-label-sm text-label-sm font-bold">Sisa 18 Hari</span>
</div>
<!-- Main Headline & Subtitle -->
<div class="max-w-4xl space-y-space-md">
<h1 class="font-display text-display font-extrabold tracking-tight text-white leading-tight">
          Wujudkan Generasi Pemimpin Cerdas, Berkarakter &amp; Berdaya Saing Global
        </h1>
<p class="font-body-lg text-body-lg text-surface-container-high leading-relaxed max-w-2xl">
          Sekolah Unggulan berbasis Kurikulum Merdeka Terintegrasi International Cambridge, mempersiapkan siswa meraih kampus impian dalam dan luar negeri dengan pembinaan komprehensif.
        </p>
</div>
<!-- CTAs -->
<div class="flex flex-wrap items-center gap-space-md pt-space-xs">
<a class="inline-flex items-center gap-space-sm px-7 py-3.5 rounded-lg bg-secondary-container text-on-secondary-container font-label-lg text-label-lg font-bold shadow-lg hover:bg-secondary-fixed transition-all duration-200 hover:-translate-y-0.5" data-path="daftar-pmb-sekarang" href="#">
<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">how_to_reg</span>
<span>Daftar PMB Sekarang</span>
</a>
<a class="inline-flex items-center gap-space-sm px-6 py-3.5 rounded-lg bg-surface-container-lowest/10 backdrop-blur-md text-white hover:bg-surface-container-lowest/20 font-label-lg text-label-lg font-semibold transition-all" href="#brosur">
<span class="material-symbols-outlined">download</span>
<span>Unduh Brosur &amp; Silabus</span>
</a>
</div>
<!-- Quick Stats Strip -->
<div class="w-full pt-space-lg grid grid-cols-2 md:grid-cols-4 gap-space-md">
<div class="p-space-md rounded-xl bg-surface-container-lowest/10 backdrop-blur-md space-y-1">
<div class="flex items-center gap-space-xs text-tertiary-fixed">
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">verified</span>
<span class="font-label-sm text-label-sm font-semibold uppercase tracking-wider">Akreditasi A</span>
</div>
<p class="font-headline-md text-headline-md text-white font-extrabold">98 / 100</p>
<p class="font-body-sm text-body-sm text-surface-container-high">BAN-SM Predikat Unggul</p>
</div>
<div class="p-space-md rounded-xl bg-surface-container-lowest/10 backdrop-blur-md space-y-1">
<div class="flex items-center gap-space-xs text-secondary-fixed">
<span class="material-symbols-outlined text-lg">school</span>
<span class="font-label-sm text-label-sm font-semibold uppercase tracking-wider">Kelulusan PTN/LN</span>
</div>
<p class="font-headline-md text-headline-md text-white font-extrabold">98.4%</p>
<p class="font-body-sm text-body-sm text-surface-container-high">UI, ITB, NUS, Monash</p>
</div>
<div class="p-space-md rounded-xl bg-surface-container-lowest/10 backdrop-blur-md space-y-1">
<div class="flex items-center gap-space-xs text-secondary-fixed-dim">
<span class="material-symbols-outlined text-lg">emoji_events</span>
<span class="font-label-sm text-label-sm font-semibold uppercase tracking-wider">Prestasi 2024</span>
</div>
<p class="font-headline-md text-headline-md text-white font-extrabold">150+</p>
<p class="font-body-sm text-body-sm text-surface-container-high">Tingkat Nasional &amp; Dunia</p>
</div>
<div class="p-space-md rounded-xl bg-surface-container-lowest/10 backdrop-blur-md space-y-1">
<div class="flex items-center gap-space-xs text-primary-fixed">
<span class="material-symbols-outlined text-lg">groups</span>
<span class="font-label-sm text-label-sm font-semibold uppercase tracking-wider">Komunitas Siswa</span>
</div>
<p class="font-headline-md text-headline-md text-white font-extrabold">1.250+</p>
<p class="font-body-sm text-body-sm text-surface-container-high">Siswa Aktif &amp; Berprestasi</p>
</div>
</div>
</div>
</section>
<!-- 2. PROFIL & 4 PILAR KEUNGGULAN + SAMBUTAN -->
<section class="w-full py-space-xl bg-background transition-colors duration-300">
<div class="max-w-7xl mx-auto px-gutter space-y-space-xl">
<!-- Section Header -->
<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
<div class="max-w-2xl space-y-space-xs">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Keunggulan Institusi</span>
<h2 class="font-headline-lg text-headline-lg text-primary font-bold">Mengapa Memilih SMA Global Mandiri?</h2>
<p class="font-body-md text-body-md text-on-surface-variant">Kami memadukan ketangguhan karakter spiritual, kurikulum internasional teruji, serta ekosistem pembelajaran modern yang menumbuhkan inovasi siswa.</p>
</div>
<div class="hidden lg:flex items-center gap-space-xs text-tertiary font-label-md text-label-md px-space-md py-space-xs rounded-full bg-surface-container">
<span class="material-symbols-outlined text-base">eco</span>
<span>Green &amp; Digital Eco-Campus Bersertifikasi</span>
</div>
</div>
<!-- 4 Pillars Grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
<!-- Pilar 1 -->
<div class="group p-space-lg rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between border border-transparent">
<div class="space-y-space-md">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span class="material-symbols-outlined text-2xl">public</span>
</div>
<div class="space-y-space-xs">
<h3 class="font-title-lg text-title-lg text-on-surface font-semibold">Kurikulum Adaptif &amp; Global</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Penyelarasan Kurikulum Merdeka dengan standar Cambridge IGCSE / A-Level, bilingual harian, serta muatan STEM dan Coding terapan.
              </p>
</div>
</div>
<div class="pt-space-md flex items-center text-primary font-label-sm text-label-sm font-semibold gap-1">
<span>Bilingual Cambridge Pathway</span>
<span class="material-symbols-outlined text-xs">arrow_forward</span>
</div>
</div>
<!-- Pilar 2 -->
<div class="group p-space-lg rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between border border-transparent">
<div class="space-y-space-md">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span class="material-symbols-outlined text-2xl">verified_user</span>
</div>
<div class="space-y-space-xs">
<h3 class="font-title-lg text-title-lg text-on-surface font-semibold">Pendidik Berintegritas &amp; Magister</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Lebih dari 90% staf pengajar berkualifikasi Magister &amp; Doktor lulusan kampus top, bersertifikasi Guru Penggerak Nasional.
              </p>
</div>
</div>
<div class="pt-space-md flex items-center text-primary font-label-sm text-label-sm font-semibold gap-1">
<span>Rasio Guru &amp; Siswa 1:12</span>
<span class="material-symbols-outlined text-xs">arrow_forward</span>
</div>
</div>
<!-- Pilar 3 -->
<div class="group p-space-lg rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between border border-transparent">
<div class="space-y-space-md">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span class="material-symbols-outlined text-2xl">self_improvement</span>
</div>
<div class="space-y-space-xs">
<h3 class="font-title-lg text-title-lg text-on-surface font-semibold">Bina Karakter &amp; Kepemimpinan</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Pembiasaan ibadah harian, program mentoring akhlak, wawasan kebangsaan, dan inkubasi kepemimpinan organisasi siswa (OSIS &amp; MPK).
              </p>
</div>
</div>
<div class="pt-space-md flex items-center text-primary font-label-sm text-label-sm font-semibold gap-1">
<span>Character Mentoring 1-on-1</span>
<span class="material-symbols-outlined text-xs">arrow_forward</span>
</div>
</div>
<!-- Pilar 4 -->
<div class="group p-space-lg rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between border border-transparent">
<div class="space-y-space-md">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span class="material-symbols-outlined text-2xl">precision_manufacturing</span>
</div>
<div class="space-y-space-xs">
<h3 class="font-title-lg text-title-lg text-on-surface font-semibold">Fasilitas Digital &amp; Lab AI</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Smart Classroom interaktif, Laboratorium Robotika &amp; Kecerdasan Buatan, e-Library terkoneksi 10.000 jurnal, serta Sport Hall berstandar.
              </p>
</div>
</div>
<div class="pt-space-md flex items-center text-primary font-label-sm text-label-sm font-semibold gap-1">
<span>High-Tech Learning Hub</span>
<span class="material-symbols-outlined text-xs">arrow_forward</span>
</div>
</div>
</div>
<!-- Sambutan Kepala Sekolah -->
<div class="rounded-2xl bg-surface-container-low p-space-lg md:p-space-xl flex flex-col md:flex-row items-center gap-space-lg transition-colors duration-300">
<div class="w-32 h-32 md:w-44 md:h-44 shrink-0 rounded-2xl overflow-hidden shadow-md">
<img class="w-full h-full object-cover" data-alt="Potret resmi Kepala Sekolah SMA Global Mandiri Dr H Bambang Sudarmono MPd berjas rapi berdasi senyum ramah dengan latar belakang perpustakaan modern pencahayaan hangat berwibawa akademis" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAiG6HDzyXPsY5NAixoFHGsDVh8zUtKX0NjX40qzQOcy8pdZd4jsYS7ATHNht9Jy-Z0b0IpFrUpfDO8IBtv1ceDh0ENqdr4p_M6CQamyHXfQHZSDZGd_DF4HgOA6g-cWfWTCl4NG-MgiWUDQhKxDOX6b0F6KXEJ3IibDRn7Exlgl3RBffhlpUqiDBSGyl3l6YJbbvi9luMahqVvB6GoCyCGoM71wY2nVh5MhD5rwFCV8F90qGJMbsO4Jw"/>
</div>
<div class="space-y-space-sm flex-1">
<div class="inline-flex items-center gap-space-xs px-space-sm py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
<span class="material-symbols-outlined text-xs">record_voice_over</span>
<span>Sambutan Kepala Sekolah</span>
</div>
<p class="font-title-lg text-title-lg text-on-surface font-medium italic leading-relaxed">
            “Di SMA Global Mandiri, kami tidak hanya mendidik akal agar cemerlang menghadapi kompetisi global, melainkan memeluk hati setiap anak agar bertumbuh dengan integritas spiritual yang kokoh, berani bermimpi besar, dan bermanfaat bagi peradaban.”
          </p>
<div class="pt-space-xs">
<p class="font-title-md text-title-md font-bold text-primary">Dr. H. Bambang Sudarmono, M.Pd.</p>
<p class="font-body-sm text-body-sm text-on-surface-variant">Kepala Sekolah SMA Global Mandiri • Dewan Pembina Pendidikan Penggerak</p>
</div>
</div>
</div>
</div>
</section>
<!-- 3. PROGRAM SEKOLAH: JURUSAN & EKSTRAKURIKULER (Interactive Tabs) -->
<section class="w-full py-space-xl bg-surface transition-colors duration-300">
<div class="max-w-7xl mx-auto px-gutter space-y-space-lg">
<div class="flex flex-col items-center text-center space-y-space-xs max-w-2xl mx-auto">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Katalog Pembelajaran</span>
<h2 class="font-headline-lg text-headline-lg text-primary font-bold">Peminatan Akademik &amp; Ekstrakurikuler</h2>
<p class="font-body-md text-body-md text-on-surface-variant">Eksplorasi kurikulum berbasis minat bakat siswa dan wadah pengembangan minat potensi unggul non-akademis.</p>
</div>
<!-- Segmented Tab Controls -->
<div class="flex justify-center">
<div class="inline-flex p-1.5 rounded-xl bg-surface-container">
<button class="px-space-lg py-space-xs rounded-lg font-label-lg text-label-lg font-bold transition-all bg-surface-container-lowest text-primary shadow-sm" id="btnTabJurusan" onclick="switchSchoolTab('jurusan')">
            Program Peminatan / Jurusan
          </button>
<button class="px-space-lg py-space-xs rounded-lg font-label-lg text-label-lg font-semibold text-on-surface-variant hover:text-primary transition-all" id="btnTabEkskul" onclick="switchSchoolTab('ekskul')">
            Ekstrakurikuler &amp; Prestasi Bakat
          </button>
</div>
</div>
<!-- Content Tab 1: Jurusan -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-space-md transition-all" id="contentJurusan">
<!-- MIPA -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col justify-between space-y-space-md border border-transparent">
<div class="space-y-space-md">
<div class="w-full h-44 rounded-xl overflow-hidden">
<img class="w-full h-full object-cover" data-alt="Siswa-siswi SMA praktikum di laboratorium sains modern mengenakan jas lab putih memegang mikroskop dan tabung reaksi dengan senyum semangat penelitian bioteknologi" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAXfa-rpN98RnRplD4ARxh3RQQHenJoqb7scA6-by3IRBBtRDebchl1dXb45SfLRaAdYW0uiyT9SoUD8qcU0D1eL1nW_xTIWFt3W-vgfH77wikMMffwW8psNbd7mosZDkfuQbem0lBHFBaYjzveGdOZB5ygqnk9X-AHXdGje6c7_A1Z-L-vhFsY8-J9rvci0xdWsao-X_vYgVU0oyXoAKAhEada0H-xMvu9HAIF8JX0lZgR1YniIKI-Sg"/>
</div>
<div class="space-y-space-xs">
<span class="px-2.5 py-1 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-bold">Sains &amp; Rekayasa Terpadu</span>
<h3 class="font-title-lg text-title-lg text-on-surface font-bold">MIPA Unggulan &amp; Riset</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Ditujukan bagi calon dokter, insinyur, dan ilmuwan. Dibekali kurikulum kalkulus lanjutan, bio-informatika, dan riset karya ilmiah remaja (KIR).
              </p>
</div>
</div>
<div class="pt-space-sm space-y-2">
<div class="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
<span class="material-symbols-outlined text-base text-tertiary-container">check_circle</span>
<span>Klinik Olimpiade Sains Nasional (OSN)</span>
</div>
<div class="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
<span class="material-symbols-outlined text-base text-tertiary-container">check_circle</span>
<span>Laboratorium Kimia, Fisika, &amp; Biologi Terpisah</span>
</div>
</div>
</div>
<!-- IPS -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col justify-between space-y-space-md border border-transparent">
<div class="space-y-space-md">
<div class="w-full h-44 rounded-xl overflow-hidden">
<img class="w-full h-full object-cover" data-alt="Suasana ruang diskusi siswa SMA kelas sosial bisnis sedang berdiskusi presentasi ekonomi global di papan interaktif dengan seragam batik modern" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBoR7bTtYMUKk_P5R6AkDbU23gBqzRNvyW8urtZmjwNgx5zCxsxS3HnrAFU6oi1ZR2pAiyTLagQauj3mRT5CFP3dgR0lcNT6wvM58nP99WwWiWQVTcgL4yM_0aRnLT6U2px3kwosKTpxd8CCUT3DJ_HvxDNuwkEg7sWFJH2aslhDvryTTjA7u_fcYsd1ho9QgsevCPcek55y2LIkIIphHj4HcCyG4AjyU8c6D3BVW9-iNB_L-VrufXXVQ"/>
</div>
<div class="space-y-space-xs">
<span class="px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold">Bisnis &amp; Humaniora Global</span>
<h3 class="font-title-lg text-title-lg text-on-surface font-bold">IPS Pre-Business &amp; Diplomasi</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Mempersiapkan calon diplomat, entrepreneur, dan pakar hukum. Meliputi simulasi pasar modal, diplomasi Model United Nations (MUN), dan sosiologi terapan.
              </p>
</div>
</div>
<div class="pt-space-sm space-y-2">
<div class="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
<span class="material-symbols-outlined text-base text-tertiary-container">check_circle</span>
<span>Inkubasi Startup Mini Siswa</span>
</div>
<div class="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
<span class="material-symbols-outlined text-base text-tertiary-container">check_circle</span>
<span>Program Magang Kemitraan BUMN/Swasta</span>
</div>
</div>
</div>
<!-- Cambridge -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col justify-between space-y-space-md border border-transparent">
<div class="space-y-space-md">
<div class="w-full h-44 rounded-xl overflow-hidden">
<img class="w-full h-full object-cover" data-alt="Siswa kelas internasional berdiskusi santai di perpustakaan bersama penutur asli native speaker guru Cambridge dengan laptop MacBook dan buku teks referensi luar negeri" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCEn_7Ex-b10Stca7j7EhXRefK5fOGkUnVTX4WgHyVFJ9k52PdluWJ2fETHSS2sWJqEw9icGD6FEqA5yBTpryoBVTQxob-fs2XOzH_EkDy7qJ-13x6Vg8EF7utzZl9NELqIN7Z2ioaosePZT01wNnXOqPh4FZPQoj-65lpBUdLmizSUhYUa4O06TCeaSCNY6DuYOL-A_6ons3ExxNp-6H_hf2cf9wB7Ny9SPDpbRYtDNm9Q8Rra66eYig"/>
</div>
<div class="space-y-space-xs">
<span class="px-2.5 py-1 rounded bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-sm text-label-sm font-bold">International Pathway</span>
<h3 class="font-title-lg text-title-lg text-on-surface font-bold">Kelas Cambridge International</h3>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Kurikulum terakreditasi Cambridge Assessment International Education (CAIE). Siswa mengikuti ujian resmi IGCSE &amp; AS/A-Level untuk langsung tembus PTLN.
              </p>
</div>
</div>
<div class="pt-space-sm space-y-2">
<div class="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
<span class="material-symbols-outlined text-base text-tertiary-container">check_circle</span>
<span>Full English Medium Instruction</span>
</div>
<div class="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
<span class="material-symbols-outlined text-base text-tertiary-container">check_circle</span>
<span>Bimbingan Portofolio &amp; Essay Kampus Ivy League</span>
</div>
</div>
</div>
</div>
<!-- Content Tab 2: Ekskul (Hidden by default) -->
<div class="hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-md transition-all" id="contentEkskul">
<div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-start gap-space-md border border-transparent">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
<span class="material-symbols-outlined">smart_toy</span>
</div>
<div class="space-y-1">
<h4 class="font-title-md text-title-md font-bold text-on-surface">Robotika &amp; AI Club</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant">Juara 1 Kontes Robot Nasional 2024 kategori Autonomous Drone.</p>
</div>
</div>
<div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-start gap-space-md border border-transparent">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
<span class="material-symbols-outlined">forum</span>
</div>
<div class="space-y-1">
<h4 class="font-title-md text-title-md font-bold text-on-surface">English Debate &amp; MUN</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant">Mengasah retorika, public speaking kritis, dan diplomasi internasional.</p>
</div>
</div>
<div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-start gap-space-md border border-transparent">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
<span class="material-symbols-outlined">sports_basketball</span>
</div>
<div class="space-y-1">
<h4 class="font-title-md text-title-md font-bold text-on-surface">Basket &amp; Futsal Prestasi</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant">Juara DBL DKI Jakarta dengan pelatih profesional lisensi nasional B.</p>
</div>
</div>
<div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-start gap-space-md border border-transparent">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
<span class="material-symbols-outlined">biotech</span>
</div>
<div class="space-y-1">
<h4 class="font-title-md text-title-md font-bold text-on-surface">Karya Ilmiah Remaja (KIR)</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant">Inkubasi riset sains, penerbitan jurnal, dan pameran inovasi tahunan.</p>
</div>
</div>
<div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-start gap-space-md border border-transparent">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
<span class="material-symbols-outlined">music_note</span>
</div>
<div class="space-y-1">
<h4 class="font-title-md text-title-md font-bold text-on-surface">Paduan Suara &amp; Orkestra</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant">Harmoni musik modern dan instrumen tradisional Nusantara.</p>
</div>
</div>
<div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-start gap-space-md border border-transparent">
<div class="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
<span class="material-symbols-outlined">flag</span>
</div>
<div class="space-y-1">
<h4 class="font-title-md text-title-md font-bold text-on-surface">Paskibra &amp; Kedisiplinan</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant">Membentuk ketangguhan mental, kepemimpinan baris-berbaris, dan loyalitas.</p>
</div>
</div>
</div>
</div>
</section>
<!-- 4. FASILITAS KAMPUS MODERN (Masonry Grid & Interactive Preview) -->
<section class="w-full py-space-xl bg-background transition-colors duration-300">
<div class="max-w-7xl mx-auto px-gutter space-y-space-lg">
<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
<div class="max-w-2xl space-y-space-xs">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Infrastruktur Unggulan</span>
<h2 class="font-headline-lg text-headline-lg text-primary font-bold">Fasilitas Kampus Berstandar Internasional</h2>
<p class="font-body-md text-body-md text-on-surface-variant">Dirancang khusus untuk mendukung kenyamanan eksplorasi akademik, kebugaran fisik, dan spiritualitas siswa.</p>
</div>
<a class="inline-flex items-center gap-space-xs font-label-lg text-label-lg text-primary font-bold hover:text-secondary transition-colors" data-path="virtual-tour" href="#">
<span>Jelajahi Virtual Tour 360°</span>
<span class="material-symbols-outlined text-lg">view_in_ar</span>
</a>
</div>
<!-- Facility Grid -->
<div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-space-md">
<!-- Item 1: Large Span -->
<div class="md:col-span-2 relative group rounded-2xl overflow-hidden shadow-sm h-72 cursor-pointer" onclick="openFacilityModal('Laboratorium Sains &amp; STEM Tercanggih', 'Laboratorium biologi, kimia terpadu dengan perlengkapan standar Cambridge, mikroskop digital resolusi 4K, dan sistem proteksi keamanan berstandar internasional.')">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" data-alt="Interior laboratorium sains SMA modern yang luas dengan meja granit hitam wastafel wastafel lab alat distilasi kimia canggih dan layar sentuh interaktif rapi dan bersih" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDoEc2G0iFhzcBk3KdL-L7DG_uhObCEjZ7MrvUu-yik9pWP0c-iywPurokiD_KvILdc0SaxJWGHmBgn_TfBBIveqUyy0NDb_hvbaTdJ8L5y_1A1zbyzX_1J8FL06LWY4Cs4dAnCiolMBBBBrG8jXtsPDI0zFPUxoJ8CgM3jp9eAosQcX7xl2r8ZyoCOyw2WNr3m4to8KEYPPj_65ukyITUNa_LkObsimDu2bTo2n2oxotmQGhh48fNTMg"/>
<div class="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-transparent flex flex-col justify-end p-space-md text-white">
<span class="px-2 py-0.5 rounded bg-surface-container-lowest/20 backdrop-blur-md text-xs font-semibold w-fit mb-1">Riset &amp; Eksperimen</span>
<h4 class="font-title-lg text-title-lg font-bold">Laboratorium Sains &amp; STEM Digital</h4>
<p class="font-body-sm text-body-sm text-surface-container-high line-clamp-1">Kapasitas 40 siswa dengan koneksi data sensor instan.</p>
</div>
</div>
<!-- Item 2 -->
<div class="relative group rounded-2xl overflow-hidden shadow-sm h-72 cursor-pointer" onclick="openFacilityModal('Perpustakaan Kolaboratif Modern', 'Perpustakaan 2 lantai berpendingin udara dengan zonasi quiet area, collaborative hub, pods audio visual, dan akses ribuan e-book internasional.')">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" data-alt="Perpustakaan sekolah kontemporer berkonsep terbuka dengan rak kayu tinggi sofa melingkar nyaman siswa sedang membaca dengan laptop pencahayaan alami terang" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDNehw0Wc1nxvHfAOBKAHgI3aurJFXoE2-KnGJDBt0MZMzwj0XhgL9hl4Yuy7ubpel_k3PjbSBost0Yw8fpvNl6eFeNa17-EGOc5ambWil9dbzpXvWg_J07V7v15lB7E_xmzOzjKrcg0PnyQrMS0xz7pdfsOiNMeQD0q4Bl1uQuSth0AMZQGnKyGLsSH49ckx3lglyMUkQ76zPxaBnI63J9Ke254WSirUZFiMIPLjYlLm26-UcYO7t1Yw"/>
<div class="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-transparent flex flex-col justify-end p-space-md text-white">
<span class="px-2 py-0.5 rounded bg-surface-container-lowest/20 backdrop-blur-md text-xs font-semibold w-fit mb-1">Literasi Digital</span>
<h4 class="font-title-md text-title-md font-bold">Library &amp; Hub Diskusi</h4>
<p class="font-body-sm text-body-sm text-surface-container-high line-clamp-1">Koleksi 15.000+ literatur fisik &amp; e-book.</p>
</div>
</div>
<!-- Item 3 -->
<div class="relative group rounded-2xl overflow-hidden shadow-sm h-72 cursor-pointer" onclick="openFacilityModal('Sport Hall &amp; Gelanggang Olahraga', 'Gedung olahraga multifungsi berlantai kayu maple standar FIBA untuk basket, bulu tangkis, dan voli dengan tribun penonton berkapasitas 800 orang.')">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" data-alt="Gelanggang olahraga tertutup indoor sport hall sekolah megah dengan lantai kayu basket mengilap garis lapangan bersih dan penerangan lampu LED stadion" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD141EnqOEIywVyHmBLZrfytXbVS1prwoJQ4tqBqJTtO5OPt8YfhVW814hn6jJVBCVyRoQtMpC0KYt5_BRhDcHFRjD3zQIMSNIlUIWGXe41B6FR16RhsfJhe5JGGDQh6yZLWnIwdeGeiraEAMOqFDoLgd9gYMXiVfoGvxb4BR6En47muBYxvM6sf_Z-dj8cUHJXrdYBLudcMxOzvJhFzI4VtBn68jV27T9IusLIQlbN4QCTGNBpOXoZRA"/>
<div class="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-transparent flex flex-col justify-end p-space-md text-white">
<span class="px-2 py-0.5 rounded bg-surface-container-lowest/20 backdrop-blur-md text-xs font-semibold w-fit mb-1">Kebugaran &amp; Atletik</span>
<h4 class="font-title-md text-title-md font-bold">Indoor Sport Hall FIBA</h4>
<p class="font-body-sm text-body-sm text-surface-container-high line-clamp-1">Tribun penonton &amp; lapangan multifungsi.</p>
</div>
</div>
<!-- Item 4 -->
<div class="relative group rounded-2xl overflow-hidden shadow-sm h-72 cursor-pointer" onclick="openFacilityModal('Auditorium Seni Teater &amp; Konferensi', 'Auditorium pertunjukan 600 kursi dengan tata akustik auditorium kelas dunia, panggung hidrolik mini, lighting panggung pro, dan sound system Dolby Surround.')">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" data-alt="Auditorium teater sekolah modern dengan kursi penonton berundak warna merah marun panggung megah berlayar LED raksasa siap untuk pementasan seni dan wisuda" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAB6-eejeyzAuwxzsctOloWK8yftPjQy9HoVx4AbV8_kNnI7XAnRmQD6bV1Rgz0M8RXKc1VMWG4HxzZlLY28lzTweJ3JQDxNKIfiifIVeifHk8TLL1JYPv6ZtMvsAsKVJovEoJF20z1nJq1x5i00EZVkDPLxuwqUC7UZTuWPAIddG-LGz5uCOX7QdnzcT-7dPNKo6_A2paTX20L8zUei6QiQZ8K0b1kQSpwNi2_CXt7VZT6L927Qx1knw"/>
<div class="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-transparent flex flex-col justify-end p-space-md text-white">
<span class="px-2 py-0.5 rounded bg-surface-container-lowest/20 backdrop-blur-md text-xs font-semibold w-fit mb-1">Panggung Ekspresi</span>
<h4 class="font-title-md text-title-md font-bold">Auditorium &amp; Teater Seni</h4>
<p class="font-body-sm text-body-sm text-surface-container-high line-clamp-1">Kapasitas 600 kursi teater akustik.</p>
</div>
</div>
<!-- Item 5: Large Span -->
<div class="md:col-span-3 relative group rounded-2xl overflow-hidden shadow-sm h-72 cursor-pointer" onclick="openFacilityModal('Masjid Ash-Shiddiq Sekolah', 'Pusat pembinaan spiritual berarsitektur modern tropis dengan kapasitas 1.000 jamaah, fasilitas wudhu ramah difabel, dan ruang tahsin khusus siswa.')">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" data-alt="Masjid sekolah megah bernuansa modern minimalis dengan kubah artistik ornamen kayu dan kaca patri indah taman rumput hijau asri di halaman depannya" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBzFl7JZKvdLz8CiCMv4K4-deo4ywcS4aCFLameHxlxuqnrPuEKVK5hxDafqrkpG52xysAjLqyIVubhFphwVqTl5llRyNMLRXk0C52-thr1cl5S4H-ju86xmq-6y_L_a3N1nD6xAgm4jP4QWh4lcQ5FcoLvPOgKF1fbm__8SbgaXyENq7YetoWVz-KwuLe_b_DrfteqJi9JRBn-J8w4clw44oNPuSBNvVOz6d8NyoZ3s01bSuwMvEMoTA"/>
<div class="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-transparent flex flex-col justify-end p-space-md text-white">
<span class="px-2 py-0.5 rounded bg-surface-container-lowest/20 backdrop-blur-md text-xs font-semibold w-fit mb-1">Spiritual &amp; Karakter</span>
<h4 class="font-title-lg text-title-lg font-bold">Masjid Ash-Shiddiq Eco-Friendly</h4>
<p class="font-body-sm text-body-sm text-surface-container-high line-clamp-1">Pusat pembiasaan ibadah harian, tahfidz Al-Qur'an, dan kajian keputrian.</p>
</div>
</div>
</div>
</div>
</section>
<!-- 5. PORTAL PMB 2025/2026: STEPPER, JALUR & TIMELINE -->
<section class="w-full py-space-xl bg-surface-container-low transition-colors duration-300" id="alur-pmb">
<div class="max-w-7xl mx-auto px-gutter space-y-space-xl">
<!-- Section Header -->
<div class="flex flex-col items-center text-center space-y-space-xs max-w-2xl mx-auto">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Alur Pendaftaran Murid Baru</span>
<h2 class="font-headline-lg text-headline-lg text-primary font-bold">4 Langkah Mudah Menjadi Siswa Global Mandiri</h2>
<p class="font-body-md text-body-md text-on-surface-variant">Sistem pendaftaran fully-online, cepat, transparan, dan terpandu ramah bagi calon wali murid.</p>
</div>
<!-- 4-Step Visual Stepper -->
<div class="grid grid-cols-1 md:grid-cols-4 gap-space-md">
<!-- Step 1 -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm relative overflow-hidden border border-transparent">
<div class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-title-md text-title-md font-bold mb-space-md">
            1
          </div>
<h4 class="font-title-md text-title-md font-bold text-on-surface mb-1">Registrasi Akun PMB</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Buat akun via portal pmb.globalmandiri.sch.id dan unggah scan rapor SMP semester 1-5 serta kartu identitas.
          </p>
</div>
<!-- Step 2 -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm relative overflow-hidden border border-transparent">
<div class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-title-md text-title-md font-bold mb-space-md">
            2
          </div>
<h4 class="font-title-md text-title-md font-bold text-on-surface mb-1">Tes Pemetaan &amp; Minat</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Pelaksanaan tes potensi skolastik, psikotes minat bakat, serta wawancara motivasi daring/luring bersama psikolog sekolah.
          </p>
</div>
<!-- Step 3 -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm relative overflow-hidden border border-transparent">
<div class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-title-md text-title-md font-bold mb-space-md">
            3
          </div>
<h4 class="font-title-md text-title-md font-bold text-on-surface mb-1">Pengumuman &amp; Beasiswa</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Hasil evaluasi diterbitkan maksimal 3 hari kerja. Informasi perolehan beasiswa prestasi diterbitkan secara transparan.
          </p>
</div>
<!-- Step 4 -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm relative overflow-hidden border border-transparent">
<div class="w-10 h-10 rounded-full bg-tertiary-container text-on-tertiary flex items-center justify-center font-title-md text-title-md font-bold mb-space-md">
<span class="material-symbols-outlined text-xl">check</span>
</div>
<h4 class="font-title-md text-title-md font-bold text-on-surface mb-1">Daftar Ulang &amp; MPLS</h4>
<p class="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Konfirmasi kursi, pengukuran seragam, orientasi siswa baru (MPLS Kebangsaan), dan pengenalan mentor kelas.
          </p>
</div>
</div>
<!-- Timeline Gelombang PMB & CTA Unduh Brosur -->
<div class="grid grid-cols-1 lg:grid-cols-3 gap-space-lg items-start">
<!-- Timeline Table (2 cols span) -->
<div class="lg:col-span-2 rounded-2xl bg-surface-container-lowest shadow-sm p-space-lg space-y-space-md border border-transparent">
<div class="flex items-center justify-between">
<h3 class="font-title-lg text-title-lg font-bold text-primary">Jadwal Gelombang Pendaftaran T.A. 2025/2026</h3>
<span class="px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold">Tahun Akademik Baru</span>
</div>
<div class="space-y-space-sm">
<!-- Gelombang 1 -->
<div class="p-space-md rounded-xl bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
<div class="space-y-1">
<div class="flex items-center gap-space-xs">
<span class="font-title-md text-title-md font-bold text-primary">Gelombang 1 (Early Bird)</span>
<span class="px-2 py-0.5 rounded bg-tertiary-container text-on-tertiary font-label-sm text-label-sm font-bold">Sedang Dibuka</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant">Periode: 1 Oktober — 31 Desember 2024</p>
<p class="font-label-sm text-label-sm text-secondary font-semibold">Keuntungan: Potongan Uang Gedung (DPP) Sebesar 25% + Free Seragam</p>
</div>
<a class="shrink-0 px-space-md py-space-xs rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold hover:bg-primary-container transition-colors text-center" data-path="daftar-gelombang-1" href="#">
                Daftar Sekarang
              </a>
</div>
<!-- Gelombang 2 -->
<div class="p-space-md rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
<div class="space-y-1">
<div class="flex items-center gap-space-xs">
<span class="font-title-md text-title-md font-bold text-on-surface">Gelombang 2 (Reguler)</span>
<span class="px-2 py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-bold">Segera Dibuka</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant">Periode: 2 Januari — 31 Maret 2025</p>
<p class="font-label-sm text-label-sm text-on-surface-variant">Keuntungan: Potongan Uang Gedung (DPP) Sebesar 15%</p>
</div>
<span class="shrink-0 px-space-md py-space-xs rounded-lg bg-surface-container text-outline font-label-md text-label-md font-semibold text-center">
                Waiting List
              </span>
</div>
<!-- Gelombang 3 -->
<div class="p-space-md rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
<div class="space-y-1">
<div class="flex items-center gap-space-xs">
<span class="font-title-md text-title-md font-bold text-on-surface">Gelombang 3 (Terakhir)</span>
<span class="px-2 py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-bold">Mendatang</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant">Periode: 1 April — 30 Juni 2025 (Bila Kuota Masih Ada)</p>
<p class="font-label-sm text-label-sm text-on-surface-variant">Biaya standar reguler penuh tanpa potongan.</p>
</div>
<span class="shrink-0 px-space-md py-space-xs rounded-lg bg-surface-container text-outline font-label-md text-label-md font-semibold text-center">
                Mendatang
              </span>
</div>
</div>
</div>
<!-- Download Brosur Card & Quick Inquiry -->
<div class="rounded-2xl bg-gradient-to-br from-primary to-primary-container text-on-primary p-space-lg shadow-sm space-y-space-md" id="brosur">
<div class="space-y-space-xs">
<span class="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold">Buku Panduan Lengkap</span>
<h3 class="font-title-lg text-title-lg font-bold text-white">Unduh Brosur PMB 2025 (PDF)</h3>
<p class="font-body-sm text-body-sm text-surface-container-high leading-relaxed">
              Dapatkan rincian tabel biaya pendidikan, kurikulum Cambridge, kurikulum nasional, profil tenaga pendidik, dan fasilitas lengkap dalam format e-book 16 halaman.
            </p>
</div>
<form class="space-y-space-sm" onsubmit="event.preventDefault(); alert('Terima kasih! Tautan unduh brosur telah dikirimkan ke email dan nomor WhatsApp Anda.');">
<div>
<label class="font-label-sm text-label-sm text-surface-container-highest block mb-1">Nama Lengkap Orang Tua / Siswa</label>
<input class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none" placeholder="Contoh: Bpk. Gunawan" required="" type="text"/>
</div>
<div>
<label class="font-label-sm text-label-sm text-surface-container-highest block mb-1">Nomor WhatsApp Aktif</label>
<input class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none" placeholder="0812-XXXX-XXXX" required="" type="tel"/>
</div>
<button class="w-full h-11 rounded-lg bg-secondary-container text-on-secondary-container font-label-lg text-label-lg font-bold shadow-md hover:bg-secondary-fixed transition-colors flex items-center justify-center gap-space-xs" type="submit">
<span class="material-symbols-outlined text-lg">download</span>
<span>Unduh Sekarang (Gratis)</span>
</button>
</form>
<p class="font-label-sm text-label-sm text-surface-container text-center">Data Anda aman dan tidak akan disebarluaskan.</p>
</div>
</div>
</div>
</section>
<!-- 6. BERITA & AGENDA SEKOLAH TERKINI -->
<section class="w-full py-space-xl bg-background transition-colors duration-300">
<div class="max-w-7xl mx-auto px-gutter space-y-space-lg">
<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
<div class="max-w-2xl space-y-space-xs">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Kabar Global Mandiri</span>
<h2 class="font-headline-lg text-headline-lg text-primary font-bold">Berita Prestasi &amp; Agenda Terkini</h2>
<p class="font-body-md text-body-md text-on-surface-variant">Ikuti rekam jejak prestasi siswa dan acara pembekalan akademik yang terus bergulir di kampus.</p>
</div>
<a class="inline-flex items-center gap-space-xs font-label-lg text-label-lg text-primary font-bold hover:text-secondary transition-colors" data-path="semua-berita" href="#">
<span>Lihat Seluruh Arsip Berita</span>
<span class="material-symbols-outlined text-lg">arrow_forward</span>
</a>
</div>
<!-- 3-Card Grid -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
<!-- Berita 1 -->
<article class="group rounded-2xl overflow-hidden bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-transparent">
<div>
<div class="relative h-48 overflow-hidden">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" data-alt="Tiga siswa SMA Global Mandiri tersenyum bangga di atas podium sambil memegang medali emas olimpiade sains internasional dan bendera merah putih" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCHSzBcQqTMxWnPLsmt-YiB59CGIjj1pNjgG8F9YAEhF5ivsV7IbhkRdgikLbNvInWS9zb3L72CvYGWt4IuM6_96XmGQxwr3rbZGHBjFIwJnWWEVgq9Rn3zbTtU1PUu_ZRiqW30cEikSBRMxiCusZuF4GZ9N0NRIiNRlRGNMlpmeNA4IYNUwqwgClbVaLqOZhq8XGRv7tvCwnu4ndVDsGP7yinEl1SXSce2FdgSLt43S8zrYI-edekg4g"/>
<span class="absolute top-3 left-3 px-2.5 py-1 rounded bg-error text-on-error font-label-sm text-label-sm font-bold shadow">Prestasi Dunia</span>
</div>
<div class="p-space-lg space-y-space-xs">
<span class="font-label-sm text-label-sm text-on-surface-variant">14 November 2024</span>
<h3 class="font-title-lg text-title-lg font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-2">
                Siswa SMA Global Mandiri Raih Medali Emas di International Science Olympiad 2024
              </h3>
<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-3 leading-relaxed">
                Tim peneliti muda SMA Global Mandiri berhasil mengungguli 34 negara melalui inovasi bio-plastik ramah lingkungan berbasis limbah singkong lokal.
              </p>
</div>
</div>
<div class="px-space-lg pb-space-lg">
<a class="font-label-md text-label-md font-bold text-primary flex items-center gap-1 hover:gap-2 transition-all" data-path="baca-berita-1" href="#">
<span>Baca Selengkapnya</span>
<span class="material-symbols-outlined text-sm">arrow_forward</span>
</a>
</div>
</article>
<!-- Berita 2 -->
<article class="group rounded-2xl overflow-hidden bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-transparent">
<div>
<div class="relative h-48 overflow-hidden">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" data-alt="Kegiatan open house sekolah dengan orang tua dan calon murid mendengarkan penjelasan kepala sekolah di auditorium modern interaktif" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB7ygzQ2MG51VCFokth5Xcj1KcHndYO9UfUZDVGUutyCrYfFFVQSjdtOMxAvxZBLhN4H__PF1J4n63a-Ee-DIqnw7vF1QxDjU2fWOHzk3yJK6dsxcSAhbee4Fi5oOB5RWxhE6qhJz_z95hTJKV74gSkYvzoTJD-zbY6dVU7_4yIsU8jCe3I1DpquHzWWC6B8kGzO0w5sWY9AxAfgix-LjOmC8TrE9JgSwi2rC4O-NhK8CMin9ycAUbENg"/>
<span class="absolute top-3 left-3 px-2.5 py-1 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold shadow">Agenda Sekolah</span>
</div>
<div class="p-space-lg space-y-space-xs">
<span class="font-label-sm text-label-sm text-on-surface-variant">28 November 2024</span>
<h3 class="font-title-lg text-title-lg font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-2">
                Open House &amp; School Tour PMB 2025: Rasakan Pengalaman Belajar Masa Depan
              </h3>
<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-3 leading-relaxed">
                Saksikan langsung demonstrasi laboratorium sains, konsultasi kurikulum dengan guru Cambridge, serta free trial class bagi siswa kelas 9 SMP.
              </p>
</div>
</div>
<div class="px-space-lg pb-space-lg">
<a class="font-label-md text-label-md font-bold text-primary flex items-center gap-1 hover:gap-2 transition-all" data-path="baca-berita-2" href="#">
<span>Daftar Open House</span>
<span class="material-symbols-outlined text-sm">arrow_forward</span>
</a>
</div>
</article>
<!-- Berita 3 -->
<article class="group rounded-2xl overflow-hidden bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-transparent">
<div>
<div class="relative h-48 overflow-hidden">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" data-alt="Siswa siswi Indonesia bersalaman hangat dengan siswa Australia di depan gedung sekolah bertaraf internasional dengan banner student exchange" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB028KOeikFjr-Q_PrYWkK_ch8mzEhhXZ5b0oVuCWaBHhHT06ghYVJfYODkvXEeRhdvD4aWVhbtggrmuKwowo7XUcRsFsRD86qPvGEMVt1oh3Ce2ZJssNig_GjRodwYVZrejLh05aWkp-HyEB_0KDMaX4YIkHcH08tA9FgAIvglqCFZJ9kvDS9xAS2fYWHrEWlHb78Iy3n0dFg6dBuRkbs1OEcU5DdLsAhrpyHN2xaq6njKs3-1P6jnaA"/>
<span class="absolute top-3 left-3 px-2.5 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm font-bold shadow">Kemitraan Global</span>
</div>
<div class="p-space-lg space-y-space-xs">
<span class="font-label-sm text-label-sm text-on-surface-variant">5 Desember 2024</span>
<h3 class="font-title-lg text-title-lg font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-2">
                MoU Pertukaran Pelajar dengan Melbourne High School Australia Resmi Dimulai
              </h3>
<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-3 leading-relaxed">
                Sebanyak 15 siswa terpilih akan mengikuti immersion program selama dua pekan di Australia untuk memperluas perspektif global dan riset bersama.
              </p>
</div>
</div>
<div class="px-space-lg pb-space-lg">
<a class="font-label-md text-label-md font-bold text-primary flex items-center gap-1 hover:gap-2 transition-all" data-path="baca-berita-3" href="#">
<span>Baca Selengkapnya</span>
<span class="material-symbols-outlined text-sm">arrow_forward</span>
</a>
</div>
</article>
</div>
</div>
</section>
<!-- 7. TESTIMONI ALUMNI & ORANG TUA SISWA -->
<section class="w-full py-space-xl bg-surface-container-low transition-colors duration-300">
<div class="max-w-7xl mx-auto px-gutter space-y-space-lg">
<div class="flex flex-col items-center text-center space-y-space-xs max-w-2xl mx-auto">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Kisah Sukses Komunitas</span>
<h2 class="font-headline-lg text-headline-lg text-primary font-bold">Apa Kata Alumni &amp; Wali Murid?</h2>
<p class="font-body-md text-body-md text-on-surface-variant">Kepercayaan nyata dari mereka yang telah bertumbuh bersama nilai-nilai unggul SMA Global Mandiri.</p>
</div>
<div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
<!-- Testi 1 -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm space-y-space-md flex flex-col justify-between border border-transparent">
<div class="space-y-space-sm">
<div class="flex items-center text-secondary-container">
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
</div>
<p class="font-body-md text-body-md text-on-surface-variant italic leading-relaxed">
              “Bimbingan intensif persiapan UTBK dan Cambridge A-Level di Global Mandiri sangat aplikatif. Guru-guru mendampingi saya dari nol hingga berhasil lolos FK UI lewat jalur SNBP.”
            </p>
</div>
<div class="flex items-center gap-space-sm pt-space-xs">
<div class="w-12 h-12 rounded-full overflow-hidden shrink-0">
<img class="w-full h-full object-cover" data-alt="Foto close up mahasiswi kedokteran berhijab rapi tersenyum ceria di lingkungan kampus kedokteran" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAgei4cTIglBVReislxYw6WWZtNECe19QFg3cFI-TlOy7uKqYHLnw4Yz3WdsciDDE8W4Zp4KDdG_sqGM87nbfrnSUY4hI8e5pmrNTNZlqEKT7R6ObZKn5payvYkfLaBvnM0BSF0I6gmTXANPu1mcTp2WMREd9qqgZFeFIwgbegM5E0xjzWgY4YHNEkSMObOUfu5udqsQqNIWV0b6mCSlCfJ2BLojtTo6yshJuv2qIYmbFqqFF6VlcR3IQ"/>
</div>
<div>
<p class="font-title-md text-title-md font-bold text-primary">Najwa Amanda</p>
<p class="font-body-sm text-body-sm text-on-surface-variant">Alumni 2023 • Fakultas Kedokteran UI</p>
</div>
</div>
</div>
<!-- Testi 2 -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm space-y-space-md flex flex-col justify-between border border-transparent">
<div class="space-y-space-sm">
<div class="flex items-center text-secondary-container">
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
</div>
<p class="font-body-md text-body-md text-on-surface-variant italic leading-relaxed">
              “Ekskul robotika dan kurikulum coding memberikan landasan logika yang sangat kuat. Saat apply ke NTU Singapura, portofolio riset SMA saya menjadi diferensiasi utama.”
            </p>
</div>
<div class="flex items-center gap-space-sm pt-space-xs">
<div class="w-12 h-12 rounded-full overflow-hidden shrink-0">
<img class="w-full h-full object-cover" data-alt="Foto mahasiswa muda berjaket almamater memegang ransel di depan gedung universitas Singapura cerah percaya diri" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAakfjlmtIQdgQofWRIZZW-bKej3vW3pDtJJQrYJkigWhhHqLcir7Cdrw_peMibUESJBQx04dou9IKndkPPfwrDLenNXprqBW0LBJVmw1Yy4vBcxltuxRNLeLf9jR976ddi_fhYTgyAvzpKpYmuHRl8j0Ae7v1PypVcNXoMOFgvZkwiVpo3Amq5JvNZBZNSxCpIdxtEzSMGJmdCA7B1fXI41ULxSITLtXzhUJ-LTS1vnIeZ7PLKWZXbQg"/>
</div>
<div>
<p class="font-title-md text-title-md font-bold text-primary">Arya Pratama</p>
<p class="font-body-sm text-body-sm text-on-surface-variant">Alumni 2022 • Computer Science NTU</p>
</div>
</div>
</div>
<!-- Testi 3 -->
<div class="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm space-y-space-md flex flex-col justify-between border border-transparent">
<div class="space-y-space-sm">
<div class="flex items-center text-secondary-container">
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
<span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">star</span>
</div>
<p class="font-body-md text-body-md text-on-surface-variant italic leading-relaxed">
              “Sebagai orang tua, saya sangat mengapresiasi keseimbangan antara prestasi akademik dengan adab moral anak. Komunikasi wali kelas sangat proaktif dan transparan.”
            </p>
</div>
<div class="flex items-center gap-space-sm pt-space-xs">
<div class="w-12 h-12 rounded-full overflow-hidden shrink-0">
<img class="w-full h-full object-cover" data-alt="Foto pria paruh baya mengenakan kemeja formal profesional tersenyum hangat ramah orang tua murid" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCkN6-LOgQAwpObhW4FuvpMgaqnuSj2CkB-Xyxjk6DJ_f2QWHuLPo0YIueBLUgj1lH3EpwXNaH69jooHgZ3b7Cu4JqZRZb8oQ8wGQXL3rETWWob_bu9mqlBY_-cSm0yZkVG1UDGyPYCLuy3UWlMkjx0136kgNXRJZctZCe5W0zI0EBzQM33N5ZbVRCvqKU0KPxgvB2QLXnFabdgAnnuX06WJaWAf_2SVvUOZPoEVtVYxjDXWlM41a43gA"/>
</div>
<div>
<p class="font-title-md text-title-md font-bold text-primary">Ir. Hendro Prasetyo</p>
<p class="font-body-sm text-body-sm text-on-surface-variant">Wali Murid Kelas XI • Direktur PT Teknologi Mandiri</p>
</div>
</div>
</div>
</div>
</div>
</section>
<!-- 8. FAQ INTERAKTIF & LOKASI SEKOLAH KAMPUS -->
<section class="w-full py-space-xl bg-background transition-colors duration-300">
<div class="max-w-7xl mx-auto px-gutter space-y-space-lg">
<div class="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
<!-- Kolom Kiri: FAQ Accordion (7 cols) -->
<div class="lg:col-span-7 space-y-space-md">
<div class="space-y-space-xs">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Pusat Informasi</span>
<h2 class="font-headline-lg text-headline-lg text-primary font-bold">Pertanyaan yang Sering Diajukan (FAQ)</h2>
<p class="font-body-md text-body-md text-on-surface-variant">Ketahui informasi penting seputar persyaratan, beasiswa, dan kehidupan asrama/sekolah.</p>
</div>
<div class="space-y-space-sm" id="faqAccordion">
<!-- FAQ 1 -->
<div class="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden border border-transparent">
<button class="w-full p-space-md text-left flex items-center justify-between gap-space-sm hover:bg-surface-container-low transition-colors" onclick="toggleFaq(1)">
<span class="font-title-md text-title-md font-semibold text-primary">Kapan batas akhir pendaftaran Gelombang 1 PMB 2025/2026?</span>
<span class="material-symbols-outlined text-primary transition-transform duration-200" id="faqIcon1">expand_more</span>
</button>
<div class="hidden px-space-md pb-space-md pt-0 font-body-sm text-body-sm text-on-surface-variant leading-relaxed" id="faqContent1">
                Gelombang 1 (Early Bird) dibuka hingga 31 Desember 2024 atau sampai kuota 120 kursi terpenuhi. Pendaftar di gelombang ini berhak atas potongan DPP 25% dan gratis perlengkapan seragam resmi.
              </div>
</div>
<!-- FAQ 2 -->
<div class="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden border border-transparent">
<button class="w-full p-space-md text-left flex items-center justify-between gap-space-sm hover:bg-surface-container-low transition-colors" onclick="toggleFaq(2)">
<span class="font-title-md text-title-md font-semibold text-primary">Apakah tersedia jalur beasiswa prestasi &amp; tahfidz?</span>
<span class="material-symbols-outlined text-primary transition-transform duration-200" id="faqIcon2">expand_more</span>
</button>
<div class="hidden px-space-md pb-space-md pt-0 font-body-sm text-body-sm text-on-surface-variant leading-relaxed" id="faqContent2">
                Ya, kami menyediakan Beasiswa Prestasi Akademik (OSN), Non-Akademik (Seni/Olahraga minimal juara tingkat Kota/Provinsi), serta Beasiswa Tahfidz Al-Qur'an minimal 5 Juz dengan potongan biaya SPP hingga 100% selama 3 tahun.
              </div>
</div>
<!-- FAQ 3 -->
<div class="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden border border-transparent">
<button class="w-full p-space-md text-left flex items-center justify-between gap-space-sm hover:bg-surface-container-low transition-colors" onclick="toggleFaq(3)">
<span class="font-title-md text-title-md font-semibold text-primary">Bagaimana sistem kurikulum peminatan siswa di SMA?</span>
<span class="material-symbols-outlined text-primary transition-transform duration-200" id="faqIcon3">expand_more</span>
</button>
<div class="hidden px-space-md pb-space-md pt-0 font-body-sm text-body-sm text-on-surface-variant leading-relaxed" id="faqContent3">
                Sesuai Kurikulum Merdeka Terintegrasi, di kelas X siswa menjalani masa eksplorasi dan pemetaan bakat. Pada kelas XI dan XII, siswa memilih mata pelajaran peminatan yang linear dengan program studi kuliah tujuan didampingi tim konselor karir.
              </div>
</div>
<!-- FAQ 4 -->
<div class="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden border border-transparent">
<button class="w-full p-space-md text-left flex items-center justify-between gap-space-sm hover:bg-surface-container-low transition-colors" onclick="toggleFaq(4)">
<span class="font-title-md text-title-md font-semibold text-primary">Apakah orang tua dapat berkunjung untuk school tour langsung?</span>
<span class="material-symbols-outlined text-primary transition-transform duration-200" id="faqIcon4">expand_more</span>
</button>
<div class="hidden px-space-md pb-space-md pt-0 font-body-sm text-body-sm text-on-surface-variant leading-relaxed" id="faqContent4">
                Sangat dipersilakan! Kampus kami membuka layanan School Tour setiap hari Senin hingga Jumat pukul 08.00 - 15.00 WIB dan Sabtu pukul 08.30 - 12.00 WIB. Disarankan melakukan reservasi slot via WhatsApp PMB agar dapat didampingi konselor.
              </div>
</div>
</div>
</div>
<!-- Kolom Kanan: Peta Lokasi & Kontak Kampus (5 cols) -->
<div class="lg:col-span-5 space-y-space-md">
<div class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm space-y-space-md border border-transparent">
<h3 class="font-title-lg text-title-lg font-bold text-primary flex items-center gap-space-xs">
<span class="material-symbols-outlined text-secondary">location_on</span>
<span>Lokasi Kampus Utama</span>
</h3>
<!-- Map Mockup Container -->
<div class="w-full h-56 rounded-xl bg-cover bg-center overflow-hidden relative shadow-inner" data-location="Jl. Pendidikan Raya No. 45, Jakarta Selatan">
<div class="absolute inset-0 bg-primary/20 backdrop-blur-[1px] flex items-center justify-center">
<div class="p-space-sm rounded-xl bg-surface-container-lowest/95 shadow-lg flex items-center gap-space-xs">
<span class="material-symbols-outlined text-error text-2xl">school</span>
<div>
<p class="font-label-md text-label-md font-bold text-primary">Kampus SMA Global Mandiri</p>
<p class="font-body-sm text-body-sm text-on-surface-variant">Dekat Stasiun MRT &amp; Tol Simatupang</p>
</div>
</div>
</div>
</div>
<div class="space-y-space-xs font-body-sm text-body-sm text-on-surface-variant">
<p class="font-semibold text-on-surface">Jl. Pendidikan Raya No. 45, Cilandak, Jakarta Selatan 12340</p>
<p>Akses: 5 Menit dari Stasiun MRT Fatmawati • 7 Menit dari Gerbang Tol TB Simatupang</p>
</div>
<div class="pt-space-xs flex flex-wrap gap-space-sm">
<a class="flex-1 min-w-[140px] px-space-md py-space-xs rounded-lg bg-surface-container-high text-primary font-label-md text-label-md font-bold flex items-center justify-center gap-1 hover:bg-surface-variant transition-colors" href="https://maps.google.com" rel="noopener noreferrer" target="_blank">
<span class="material-symbols-outlined text-base">directions</span>
<span>Buka Google Maps</span>
</a>
<a class="flex-1 min-w-[140px] px-space-md py-space-xs rounded-lg bg-tertiary-container text-on-tertiary font-label-md text-label-md font-bold flex items-center justify-center gap-1 hover:bg-tertiary transition-colors" data-path="whatsapp-hotline" href="#">
<span class="material-symbols-outlined text-base">chat</span>
<span>WhatsApp Hotline</span>
</a>
</div>
</div>
</div>
</div>
</div>
</section>
<!-- MODAL DETAIL FASILITAS -->
<div class="fixed inset-0 z-50 hidden bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-gutter" id="facilityModal">
<div class="bg-surface-container-lowest max-w-lg w-full rounded-2xl shadow-2xl p-space-lg space-y-space-md transform transition-all border border-transparent">
<div class="flex items-center justify-between">
<h3 class="font-title-lg text-title-lg font-bold text-primary" id="modalTitle">Nama Fasilitas</h3>
<button class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface" onclick="closeFacilityModal()">
<span class="material-symbols-outlined text-sm">close</span>
</button>
</div>
<p class="font-body-md text-body-md text-on-surface-variant leading-relaxed" id="modalDesc">Deskripsi lengkap fasilitas...</p>
<div class="pt-space-xs flex justify-end">
<button class="px-space-md py-space-xs rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold" onclick="closeFacilityModal()">
          Tutup
        </button>
</div>
</div>
</div>
<!-- INTERACTIVITY SCRIPT -->
<script>
    // Theme Management: Dark / Light Mode with LocalStorage
    function updateThemeUI(isDark) {
      const htmlEl = document.documentElement;
      const lightIcon = document.getElementById('lightIconWrapper');
      const darkIcon = document.getElementById('darkIconWrapper');
      const themeLabel = document.getElementById('themeTextLabel');

      if (isDark) {
        htmlEl.classList.add('dark');
        if (lightIcon && darkIcon) {
          lightIcon.className = 'flex items-center justify-center w-7 h-7 rounded-full text-outline transition-all duration-300';
          darkIcon.className = 'flex items-center justify-center w-7 h-7 rounded-full bg-primary-container text-secondary-fixed shadow-sm transition-all duration-300';
        }
        if (themeLabel) {
          themeLabel.innerText = 'Gelap';
        }
      } else {
        htmlEl.classList.remove('dark');
        if (lightIcon && darkIcon) {
          lightIcon.className = 'flex items-center justify-center w-7 h-7 rounded-full bg-white text-secondary-container shadow-sm transition-all duration-300';
          darkIcon.className = 'flex items-center justify-center w-7 h-7 rounded-full text-outline transition-all duration-300';
        }
        if (themeLabel) {
          themeLabel.innerText = 'Terang';
        }
      }
    }

    function toggleTheme() {
      const isDark = document.documentElement.classList.contains('dark');
      const newTheme = !isDark;
      updateThemeUI(newTheme);
      localStorage.setItem('theme', newTheme ? 'dark' : 'light');
    }

    // Check saved theme on load
    (function initTheme() {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        updateThemeUI(true);
      } else {
        updateThemeUI(false);
      }
    })();

    function switchSchoolTab(tabName) {
      const btnJurusan = document.getElementById('btnTabJurusan');
      const btnEkskul = document.getElementById('btnTabEkskul');
      const contentJurusan = document.getElementById('contentJurusan');
      const contentEkskul = document.getElementById('contentEkskul');

      if (tabName === 'jurusan') {
        btnJurusan.className = 'px-space-lg py-space-xs rounded-lg font-label-lg text-label-lg font-bold transition-all bg-surface-container-lowest text-primary shadow-sm';
        btnEkskul.className = 'px-space-lg py-space-xs rounded-lg font-label-lg text-label-lg font-semibold text-on-surface-variant hover:text-primary transition-all';
        contentJurusan.classList.remove('hidden');
        contentEkskul.classList.add('hidden');
      } else {
        btnEkskul.className = 'px-space-lg py-space-xs rounded-lg font-label-lg text-label-lg font-bold transition-all bg-surface-container-lowest text-primary shadow-sm';
        btnJurusan.className = 'px-space-lg py-space-lg rounded-lg font-label-lg text-label-lg font-semibold text-on-surface-variant hover:text-primary transition-all';
        contentJurusan.classList.add('hidden');
        contentEkskul.classList.remove('hidden');
      }
    }

    function toggleFaq(index) {
      const content = document.getElementById('faqContent' + index);
      const icon = document.getElementById('faqIcon' + index);
      const isHidden = content.classList.contains('hidden');

      for (let i = 1; i <= 4; i++) {
        const c = document.getElementById('faqContent' + i);
        const ic = document.getElementById('faqIcon' + i);
        if (c && ic) {
          c.classList.add('hidden');
          ic.style.transform = 'rotate(0deg)';
        }
      }

      if (isHidden) {
        content.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
      }
    }

    function openFacilityModal(title, desc) {
      document.getElementById('modalTitle').innerText = title;
      document.getElementById('modalDesc').innerText = desc;
      document.getElementById('facilityModal').classList.remove('hidden');
    }

    function closeFacilityModal() {
      document.getElementById('facilityModal').classList.add('hidden');
    }
  </script>
</div></main><aside class="fixed bottom-6 right-6 z-40 flex items-center group"><div class="hidden md:flex mr-space-xs px-space-md py-space-xs rounded-lg bg-inverse-surface text-inverse-on-surface font-label-md text-label-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Konsultasi PMB (Online)</div><a aria-label="Konsultasi WhatsApp PMB" class="relative flex items-center justify-center w-14 h-14 rounded-full bg-tertiary-container text-on-tertiary shadow-xl hover:scale-105 transition-transform" data-path="konsultasi-pmb-whatsapp" href="#"><span class="absolute inline-flex h-full w-full rounded-full bg-tertiary-fixed-dim opacity-75 animate-ping"></span><span class="material-symbols-outlined relative z-10 text-2xl">chat</span></a></aside><footer class="w-full bg-inverse-surface text-inverse-on-surface pt-space-xl pb-space-lg"><div class="max-w-7xl mx-auto px-gutter"><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-xl pb-space-xl border-b border-outline/30"><div class="space-y-space-md"><div class="flex items-center gap-space-sm"><img alt="SMA Global Mandiri" class="w-12 h-12 object-contain bg-surface-container-lowest p-space-xs rounded-lg" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCzrUzNLfa2fIc0_poRk5gCCHwJm0gLDIji6qIvfgMTx8eBLTsCHiypISZNHcJe5XnhSMmqwmx5IdEbRpv8Qhij3JjV73RZOQmmyU_nD3c42MtBuDFWK9Ajfyszm6Q2dw_obUpj5qN7BN9ScDpVm6srZbgkQkA3w2OY5LJ-dRPo3NGI-A2RScycOAvXSICbPb_PDObd7CMCIf_k8N4CpjPyMkq4GUydflpyDPtXwVj9nnQaFfcWTZCdPg"/><div><h2 class="font-title-lg text-title-lg font-bold text-inverse-on-surface">SMA GLOBAL MANDIRI</h2><p class="font-label-sm text-label-sm text-secondary-fixed">NPSN: 20108392</p></div></div><p class="font-body-sm text-body-sm text-surface-container-high leading-relaxed">Lembaga pendidikan menengah atas unggulan berstandar nasional dan global, membentuk generasi pemimpin yang cerdas, berintegritas, dan inovatif.</p><div class="inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-tertiary text-tertiary-fixed font-label-sm text-label-sm"><span class="material-symbols-outlined text-sm">verified</span><span>Akreditasi A (BAN-SM)</span></div></div><div class="space-y-space-md"><h3 class="font-title-md text-title-md font-semibold text-secondary-fixed flex items-center gap-space-xs"><span class="material-symbols-outlined text-lg">explore</span>Navigasi Cepat</h3><ul class="space-y-space-xs font-body-sm text-body-sm"><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="profil-sekolah" href="#">Profil Sekolah</a></li><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="visi-dan-misi" href="#">Visi &amp; Misi</a></li><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="kalender-akademik" href="#">Kalender Akademik</a></li><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="e-learning-portal" href="#">E-Learning Siswa</a></li><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="portal-guru" href="#">Portal Guru</a></li><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="karir" href="#">Karir &amp; Rekrutmen</a></li></ul></div><div class="space-y-space-md"><h3 class="font-title-md text-title-md font-semibold text-secondary-fixed flex items-center gap-space-xs"><span class="material-symbols-outlined text-lg">school</span>Program PMB</h3><ul class="space-y-space-xs font-body-sm text-body-sm"><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="syarat-pendaftaran" href="#">Syarat Pendaftaran</a></li><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="jalur-prestasi-dan-reguler" href="#">Jalur Prestasi &amp; Reguler</a></li><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">chevron_right</span><a data-path="estimasi-biaya-dan-beasiswa" href="#">Estimasi Biaya &amp; Beasiswa</a></li><li class="flex items-center gap-space-xs text-surface-container-high hover:text-secondary-fixed transition-colors"><span class="material-symbols-outlined text-xs">download</span><a data-path="unduh-brosur-pmb-2025-2026" href="#">Unduh Brosur PMB 2025/2026</a></li></ul></div><div class="space-y-space-md"><h3 class="font-title-md text-title-md font-semibold text-secondary-fixed flex items-center gap-space-xs"><span class="material-symbols-outlined text-lg">contact_support</span>Hubungi Kami</h3><div class="space-y-space-xs font-body-sm text-body-sm text-surface-container-high"><p class="flex items-start gap-space-xs"><span class="material-symbols-outlined text-sm mt-0.5 text-secondary-fixed">location_on</span><span>Jl. Pendidikan Raya No. 45, Jakarta Selatan 12340</span></p><p class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-sm text-secondary-fixed">phone</span><span>(021) 7890-1234</span></p><p class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-sm text-secondary-fixed">chat</span><span>WhatsApp: 0812-3456-7890</span></p><p class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-sm text-secondary-fixed">mail</span><span>pmb@globalmandiri.sch.id</span></p></div><div class="p-space-xs rounded-lg bg-inverse-on-surface/10 space-y-0.5 font-label-sm text-label-sm text-surface-container-high"><div class="flex items-center gap-space-xs font-semibold text-inverse-on-surface"><span class="material-symbols-outlined text-sm text-secondary-fixed">schedule</span>Jam Layanan:</div><p>Senin - Jumat: 07.30 - 16.00 WIB</p><p>Sabtu: 08.00 - 13.00 WIB</p></div><div class="flex items-center gap-space-xs pt-space-xs"><a aria-label="Instagram" class="w-8 h-8 rounded-full bg-inverse-on-surface/10 flex items-center justify-center hover:bg-secondary-container hover:text-on-secondary-container transition-colors" data-path="media-sosial-instagram" href="#"><span class="material-symbols-outlined text-sm">photo_camera</span></a><a aria-label="YouTube" class="w-8 h-8 rounded-full bg-inverse-on-surface/10 flex items-center justify-center hover:bg-secondary-container hover:text-on-secondary-container transition-colors" data-path="media-sosial-youtube" href="#"><span class="material-symbols-outlined text-sm">smart_display</span></a><a aria-label="Facebook" class="w-8 h-8 rounded-full bg-inverse-on-surface/10 flex items-center justify-center hover:bg-secondary-container hover:text-on-secondary-container transition-colors" data-path="media-sosial-facebook" href="#"><span class="material-symbols-outlined text-sm">public</span></a><a aria-label="LinkedIn" class="w-8 h-8 rounded-full bg-inverse-on-surface/10 flex items-center justify-center hover:bg-secondary-container hover:text-on-secondary-container transition-colors" data-path="media-sosial-linkedin" href="#"><span class="material-symbols-outlined text-sm">group</span></a></div></div></div><div class="pt-space-lg flex flex-col md:flex-row items-center justify-between gap-space-sm font-label-md text-label-md text-surface-container-high text-center md:text-left"><p>© 2025 SMA Global Mandiri. Hak Cipta Dilindungi Undang-Undang.</p><p class="text-secondary-fixed font-semibold">Terakreditasi Unggul (A) BAN-SM Kemendikbudristek RI</p></div></div></footer></body></html>