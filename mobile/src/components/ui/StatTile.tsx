/**
 * Petak angka ringkas untuk baris metrik di layar ponsel.
 *
 * Dipakai Dasbor Kehadiran dan Audit Kehadiran. Sebelumnya komponen yang sama
 * ditulis dua kali, sehingga penyesuaian jarak atau ukuran huruf di satu
 * halaman membuat kedua baris metrik itu tidak lagi sejajar.
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
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-black ${tone}`}>{value}</div>
    </div>
  );
}
