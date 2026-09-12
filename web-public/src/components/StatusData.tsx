import type { HasilMuat } from "@/lib/server/school-data";

/**
 * Tampilan untuk dua kegagalan yang WAJIB dibedakan.
 *
 * "Belum siap" berarti database sekolah ini belum dipasang skemanya — itu
 * pekerjaan administrator, sekali saja, dan pesannya menyebut caranya.
 * "Gagal" berarti databasenya ada tetapi tidak terjangkau saat ini — itu
 * bersifat sementara dan pengunjung cukup mencoba lagi.
 *
 * Keduanya juga harus dibedakan dari daftar yang memang kosong. Menggabungkan
 * ketiganya menjadi satu layar kosong adalah cara membuat kegagalan tidak
 * terlihat sampai ada yang menelepon sekolah untuk menanyakannya.
 */
export function StatusTidakTerbaca({
  hasil,
  konteks,
}: {
  hasil: Extract<HasilMuat<unknown>, { status: "belum-siap" | "gagal" }>;
  konteks: string;
}) {
  const belumSiap = hasil.status === "belum-siap";

  return (
    // Tanpa `role="status"`: pesannya sudah ada sejak render pertama, bukan
    // pembaruan yang muncul belakangan. Live region untuk teks statis justru
    // membuat pembaca layar mengumumkannya di luar urutan baca halaman.
    <div className="rounded-lg border border-garis bg-latar-lembut p-5">
      <p className="font-medium">
        {belumSiap
          ? `${konteks} belum dapat ditampilkan.`
          : `${konteks} sedang tidak dapat dimuat.`}
      </p>
      <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
        {belumSiap
          ? "Database sekolah belum selesai disiapkan. Administrator perlu membuka panel admin atau aplikasi Desktop satu kali untuk memasangnya."
          : "Sambungan ke database sekolah sedang bermasalah. Silakan coba beberapa saat lagi."}
      </p>
    </div>
  );
}

/** Keadaan kosong yang JUJUR: datanya terbaca, isinya memang belum ada. */
export function DaftarKosong({ pesan }: { pesan: string }) {
  return (
    <div className="rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut leading-relaxed">
      {pesan}
    </div>
  );
}
