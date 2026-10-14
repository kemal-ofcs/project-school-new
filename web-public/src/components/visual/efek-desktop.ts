/**
 * Efek desktop yang butuh JavaScript: hero yang ikut gerak mouse, kartu yang
 * miring mengikuti kursor, dan transisi antarhalaman. Sisanya (judul per kata,
 * pilar yang disematkan, kartu sebaris yang meredup) murni CSS di
 * `globals.css`, di bawah `html[data-efek="desktop"]`.
 *
 * Dimuat lewat `import()` oleh `EfekDesktop` hanya setelah syarat desktop
 * terpenuhi. Setiap pendengar tetap memeriksa atribut itu, karena jendela bisa
 * diperkecil setelah modul ini terpasang.
 */

const aktif = () => document.documentElement.dataset.efek === "desktop";
let terpasang = false;

export function pasangEfekDesktop(
  pindahHalaman: (href: string) => Promise<void>,
): void {
  if (terpasang) return;
  terpasang = true;

  // Satu pembaruan per bingkai, berapa pun cepatnya mouse bergerak.
  let antrean: (() => void) | null = null;
  const jadwalkan = (kerja: () => void) => {
    if (!antrean)
      requestAnimationFrame(() => {
        antrean?.();
        antrean = null;
      });
    antrean = kerja;
  };

  let kartuTerakhir: HTMLElement | null = null;
  const lepasKartu = () => {
    kartuTerakhir?.style.removeProperty("--rx");
    kartuTerakhir?.style.removeProperty("--ry");
    kartuTerakhir?.style.removeProperty("--gx");
    kartuTerakhir?.style.removeProperty("--gy");
    kartuTerakhir = null;
  };

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!aktif() || e.pointerType !== "mouse") return;
      const target = e.target as Element | null;
      const hero = target?.closest<HTMLElement>("[data-hero]");
      const kartu = target?.closest<HTMLElement>("[data-miring]");
      jadwalkan(() => {
        if (hero) {
          const r = hero.getBoundingClientRect();
          hero.style.setProperty(
            "--mx",
            (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3),
          );
          hero.style.setProperty(
            "--my",
            (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3),
          );
        }
        if (kartu !== kartuTerakhir) lepasKartu();
        if (kartu) {
          const r = kartu.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          // Paling miring 6 derajat: cukup terasa, tidak membuat teks sulit dibaca.
          kartu.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
          kartu.style.setProperty("--rx", `${(-y * 12).toFixed(2)}deg`);
          kartu.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
          kartu.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
          kartuTerakhir = kartu;
        }
      });
    },
    { passive: true },
  );
  document.addEventListener(
    "pointerout",
    (e) => {
      if (!e.relatedTarget) jadwalkan(lepasKartu);
    },
    { passive: true },
  );

  // Transisi antarhalaman lewat View Transitions API. Klik ditangkap di fase
  // capture sebelum `<Link>` Next.js, lalu navigasinya dijalankan di dalam
  // `startViewTransition` supaya browser memotret halaman lama dan baru.
  // Browser tanpa API ini (Firefox, Safari lama) tidak disentuh sama sekali.
  if (!("startViewTransition" in document)) return;
  document.addEventListener(
    "click",
    (e) => {
      if (!aktif() || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const tautan = (e.target as Element | null)?.closest("a");
      if (!tautan || tautan.target || tautan.hasAttribute("download")) return;
      const url = new URL(tautan.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname) return;
      if (url.pathname.startsWith("/api/")) return;
      e.preventDefault();
      e.stopPropagation();
      document.startViewTransition(() =>
        pindahHalaman(url.pathname + url.search + url.hash),
      );
    },
    { capture: true },
  );
}
