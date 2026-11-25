/**
 * Petak angka ringkas untuk baris metrik di layar ponsel.
 *
 * Dipakai Dasbor Kehadiran dan Audit Kehadiran. Sebelumnya komponen yang sama
 * ditulis dua kali, sehingga penyesuaian jarak atau ukuran huruf di satu
 * halaman membuat kedua baris metrik itu tidak lagi sejajar.
 *
 * Kartu transparan bergaris emas (`.kartu-angka`); `tone` tetap warna status.
 */
export function StatTile({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div className="kartu-angka rounded-2xl p-3">
      <div className="kartu-angka-label text-[10px] font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-black ${tone}`}>{value}</div>
    </div>
  );
}
