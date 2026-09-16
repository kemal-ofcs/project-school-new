import { redirect } from "next/navigation";
import { ambilSesiWali } from "@/lib/server/wali-session";
import { FormGantiPassword } from "./FormGantiPassword";

/**
 * Layar ganti password wajib.
 *
 * SENGAJA memakai `ambilSesiWali` dan bukan `wajibSesiWaliSiap`: penjaga itu
 * mengalihkan ke halaman INI ketika password masih bawaan, sehingga memakainya
 * di sini akan menghasilkan pengalihan yang berputar tanpa henti.
 */
export default async function HalamanGantiPasswordWali() {
  const sesi = await ambilSesiWali();
  if (!sesi) redirect("/wali");
  // Sudah pernah ganti — tidak ada yang perlu dikerjakan di sini.
  if (!sesi.perluGantiPassword) redirect("/wali/kehadiran");

  return (
    <main className="mx-auto max-w-md">
      <h1 className="font-semibold text-2xl">Buat Kata Sandi Baru</h1>
      <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
        Satu langkah lagi sebelum Anda dapat melihat data {sesi.namaSiswa}.
      </p>
      <div className="mt-8">
        <FormGantiPassword />
      </div>
    </main>
  );
}
