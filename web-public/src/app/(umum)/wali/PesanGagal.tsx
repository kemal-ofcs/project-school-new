/**
 * Kegagalan pemuatan, dibedakan dari daftar yang memang kosong.
 *
 * Pelajaran Fase 4 yang dieja CLAUDE.md: daftar kosong yang sebenarnya
 * kegagalan tidak bisa dibedakan dari "belum ada isinya". Di sini akibatnya
 * langsung terasa — orang tua yang melihat riwayat kosong akan menyimpulkan
 * anaknya tidak pernah tercatat hadir.
 */
export function PesanGagal({ konteks }: { konteks: string }) {
  return (
    <main>
      <div className="rounded-lg border border-garis bg-latar-lembut p-5">
        <p className="font-medium">{konteks} sedang tidak dapat dimuat.</p>
        <p className="mt-2 text-sm text-teks-lembut leading-relaxed">
          Sambungan ke data sekolah sedang bermasalah. Ini bukan berarti data
          anak Anda kosong — silakan coba beberapa saat lagi.
        </p>
      </div>
    </main>
  );
}
