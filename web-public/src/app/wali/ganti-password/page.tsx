import { redirect } from "next/navigation";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { ambilSesiWali } from "@/lib/server/wali-session";
import { baruMasukLewatOtp } from "@/lib/services/wali-auth";
import { FormGantiPassword } from "./FormGantiPassword";

/**
 * Layar ganti password wali: wajib bagi password sementara dari sekolah,
 * sukarela dari halaman Profil, dan jalan keluar "lupa password" setelah masuk
 * lewat kode WhatsApp.
 *
 * SENGAJA memakai `ambilSesiWali` dan bukan `wajibSesiWaliSiap`: penjaga itu
 * mengalihkan ke halaman INI ketika password masih sementara, sehingga
 * memakainya di sini akan menghasilkan pengalihan yang berputar tanpa henti.
 */
export default async function HalamanGantiPasswordWali() {
  const sesi = await ambilSesiWali();
  if (!sesi) redirect("/wali");
  const lewatOtp = await baruMasukLewatOtp(
    await getReadyPublicDatabase(),
    sesi.idSiswa,
  );

  return (
    <main className="mx-auto max-w-md">
      <h1 className="font-semibold text-2xl">Buat Kata Sandi Baru</h1>
      <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
        {sesi.perluGantiPassword
          ? `Satu langkah lagi sebelum Anda dapat melihat data ${sesi.namaSiswa}.`
          : `Kata sandi baru berlaku untuk portal wali ${sesi.namaSiswa}.`}
      </p>
      <div className="mt-8">
        <FormGantiPassword
          wajib={sesi.perluGantiPassword}
          tanpaPasswordLama={lewatOtp}
        />
      </div>
    </main>
  );
}
