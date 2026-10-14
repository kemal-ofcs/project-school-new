"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { efekDesktopBoleh, KUERI_EFEK_DESKTOP } from "./gerbang-efek";

/**
 * Menyalakan efek desktop dan menjaga `html[data-efek]` tetap benar saat
 * jendela diperkecil atau preferensi gerak berubah. Modul efeknya dimuat
 * lewat `import()` hanya setelah syarat terpenuhi, jadi tidak masuk bundel
 * awal halaman dan tidak pernah diunduh HP.
 */
export function EfekDesktop() {
  const router = useRouter();
  const pathname = usePathname();
  const selesaiPindah = useRef<(() => void) | null>(null);
  const routerRef = useRef(router);
  routerRef.current = router;

  // Transisi antarhalaman menunggu halaman baru benar-benar tergambar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu perubahan rute
  useEffect(() => {
    selesaiPindah.current?.();
    selesaiPindah.current = null;
  }, [pathname]);

  useEffect(() => {
    const html = document.documentElement;
    let dipasang = false;
    const sesuaikan = () => {
      if (efekDesktopBoleh()) {
        html.dataset.efek = "desktop";
        if (dipasang) return;
        dipasang = true;
        void import("./efek-desktop").then((m) =>
          m.pasangEfekDesktop(
            (href) =>
              new Promise<void>((selesai) => {
                selesaiPindah.current = selesai;
                routerRef.current.push(href);
                // Rute yang sama atau navigasi yang gagal tidak mengubah pathname.
                setTimeout(selesai, 2000);
              }),
          ),
        );
      } else {
        delete html.dataset.efek;
      }
    };
    sesuaikan();
    const media = matchMedia(KUERI_EFEK_DESKTOP);
    media.addEventListener("change", sesuaikan);
    return () => media.removeEventListener("change", sesuaikan);
  }, []);

  return null;
}
