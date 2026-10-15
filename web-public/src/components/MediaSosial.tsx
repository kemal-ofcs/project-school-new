import { tautanLuar } from "@/lib/services/gambar-konten";

// Path logo dari Simple Icons (CC0), viewBox 24×24; Instagram digambar dari
// bentuk dasar. `lucide-react` tidak membawa logo merek, dan TikTok tidak
// pernah ada di sana.
const MEDIA = [
  {
    kunci: "kontak.instagram",
    nama: "Instagram",
    path: null,
  },
  {
    kunci: "kontak.facebook",
    nama: "Facebook",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
  {
    kunci: "kontak.youtube",
    nama: "YouTube",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    kunci: "kontak.tiktok",
    nama: "TikTok",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
] as const;

/**
 * Tautan media sosial sekolah dari tab Kontak di panel konten. Hanya yang
 * diisi dengan alamat http(s) yang tampil; tidak ada satu pun = tidak dirender.
 *
 * `ikon`: lingkaran 44px (footer, menu HP). `label`: ikon + nama layanan
 * (halaman Kontak).
 */
export function MediaSosial({
  konten,
  nama,
  varian = "ikon",
  className = "",
}: {
  konten: Record<string, string | undefined>;
  /** Nama sekolah untuk label aksesibilitas, mis. "Instagram SMP IT Al-Falah". */
  nama?: string;
  varian?: "ikon" | "label";
  className?: string;
}) {
  const daftar = MEDIA.flatMap((media) => {
    const href = tautanLuar(konten[media.kunci]);
    return href ? [{ ...media, href }] : [];
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
            aria-label={
              varian === "ikon"
                ? `${item.nama}${nama ? ` ${nama}` : ""}`
                : undefined
            }
            className={`inline-flex min-h-11 items-center justify-center border border-border bg-card text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              varian === "ikon"
                ? "size-11 rounded-full"
                : "gap-2 rounded-lg px-4 font-semibold text-sm"
            }`}
            href={item.href}
            rel="noreferrer"
            target="_blank"
            title={varian === "ikon" ? item.nama : undefined}
          >
            <svg
              aria-hidden="true"
              className="size-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              {item.path ? (
                <path d={item.path} />
              ) : (
                <>
                  <rect
                    fill="none"
                    height="18"
                    rx="5"
                    stroke="currentColor"
                    strokeWidth="2"
                    width="18"
                    x="3"
                    y="3"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    fill="none"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <circle cx="17.5" cy="6.5" r="1.25" />
                </>
              )}
            </svg>
            {varian === "label" ? item.nama : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
