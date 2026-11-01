import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { muatKontenHalaman } from "@/lib/server/content-data";
import { muatProfilSekolah } from "@/lib/server/school-data";
import { profilKosong } from "@/lib/services/school-profile";

export default async function LayoutUmum({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [hasil, hasilProfilCms, hasilKontakCms] = await Promise.all([
    muatProfilSekolah(),
    muatKontenHalaman("profil"),
    muatKontenHalaman("kontak"),
  ]);
  // Header dan footer tampil di setiap halaman, jadi konten CMS-nya dimuat di
  // sini sekali. Kegagalan membacanya tidak menghentikan halaman: bagian yang
  // butuh kunci itu saja yang tidak dirender.
  const kontenSitus = {
    ...(hasilKontakCms.status === "ok" ? hasilKontakCms.data : {}),
    ...(hasilProfilCms.status === "ok" ? hasilProfilCms.data : {}),
  };
  // Kerangka halaman tetap tampil meski profil tidak terbaca, supaya pengunjung
  // masih bisa berpindah halaman. Isinya tidak dikarang: `profilKosong()`
  // membuat setiap bagian opsional sekadar tidak dirender. Badan halaman yang
  // menjelaskan apa yang sedang terjadi, bukan header.
  const profil = hasil.status === "ok" ? hasil.data : profilKosong();

  return (
    <>
      <SiteHeader profil={profil} konten={kontenSitus} />
      <div className="flex-1">{children}</div>
      <SiteFooter profil={profil} konten={kontenSitus} />
    </>
  );
}
