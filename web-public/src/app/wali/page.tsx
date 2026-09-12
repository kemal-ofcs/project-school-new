import { redirect } from "next/navigation";
import { ambilSesiWali } from "@/lib/server/wali-session";
import { FormMasuk } from "./FormMasuk";

export default async function HalamanMasukWali() {
  const sesi = await ambilSesiWali();
  if (sesi) redirect("/wali/kehadiran");

  return (
    <main className="mx-auto max-w-md">
      <h1 className="font-semibold text-2xl">Portal Wali Murid</h1>
      <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
        Lihat kehadiran anak Anda di sekolah. Masuk menggunakan nomor induk anak
        dan kode yang dikirim ke nomor WhatsApp wali yang terdaftar.
      </p>
      <div className="mt-8">
        <FormMasuk />
      </div>
    </main>
  );
}
