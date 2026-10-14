import { tautanLuar } from "@/lib/services/gambar-konten";

const MEDIA = [
  ["kontak.instagram", "Instagram"],
  ["kontak.facebook", "Facebook"],
  ["kontak.youtube", "YouTube"],
  ["kontak.tiktok", "TikTok"],
] as const;

/**
 * Tautan media sosial sekolah dari tab Kontak di panel konten. Hanya yang
 * diisi dengan alamat http(s) yang tampil; tidak ada satu pun = tidak dirender.
 * Teks, bukan logo: pustaka ikon yang dipakai situs ini tidak membawa logo
 * merek, dan nama layanannya sudah cukup jelas.
 */
export function MediaSosial({
  konten,
  className = "",
}: {
  konten: Record<string, string | undefined>;
  className?: string;
}) {
  const daftar = MEDIA.flatMap(([kunci, nama]) => {
    const href = tautanLuar(konten[kunci]);
    return href ? [{ href, nama }] : [];
  });
  if (daftar.length === 0) return null;
  return (
    <ul
      aria-label="Media sosial sekolah"
      className={`flex flex-wrap gap-2 ${className}`}
    >
      {daftar.map((item) => (
        <li key={item.nama}>
          <a
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.nama}
          </a>
        </li>
      ))}
    </ul>
  );
}
