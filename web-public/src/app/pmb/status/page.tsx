import type { Metadata } from "next";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { pilihModeCekStatus } from "@/lib/server/pmb-status-mode";
import { FormCekStatus } from "./FormCekStatus";

export const metadata: Metadata = {
  title: "Status Pendaftaran",
  // Halaman ini menampilkan data seorang anak setelah pencocokan identitas.
  // `robots.ts` sudah melarang crawl-nya; ini penegasan kedua pada level
  // halaman, karena tautan yang dibagikan orang tua lewat pesan bisa saja
  // sampai ke perayap yang tidak membaca robots.txt.
  robots: { index: false, follow: false },
};

/**
 * Tidak di-cache sama sekali.
 *
 * Seluruh isinya datang dari `POST /api/pmb/status` di sisi klien, jadi tidak
 * ada apa pun yang boleh atau perlu dibekukan. `revalidate = 0` membatalkan
 * warisan 300 detik dari layout.
 */
export const revalidate = 0;

export default async function HalamanCekStatus() {
  // Mode ditentukan SERVER. Membiarkan klien memilih membuat jalur OTP sekadar
  // hiasan: siapa pun tinggal mengirim tanggal lahir.
  let mode: "otp" | "tanggal_lahir" = "tanggal_lahir";
  try {
    mode = await pilihModeCekStatus(await getReadyPublicDatabase());
  } catch (error) {
    // Skema belum siap. Formulir tetap tampil pada jalur cadangan; endpoint-nya
    // yang akan menjawab dengan pesan yang benar.
    console.error("[web-public] gagal menentukan mode cek status:", error);
  }
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="font-semibold text-3xl">Status Pendaftaran</h1>
      <p className="mt-3 text-sm text-teks-lembut leading-relaxed">
        {mode === "otp"
          ? "Masukkan nomor pendaftaran yang Anda terima saat mengirim formulir. Kode verifikasi akan dikirim ke nomor WhatsApp wali yang Anda daftarkan."
          : "Masukkan nomor pendaftaran yang Anda terima saat mengirim formulir, beserta tanggal lahir calon siswa."}
      </p>

      <div className="mt-8">
        <FormCekStatus mode={mode} />
      </div>
    </main>
  );
}
