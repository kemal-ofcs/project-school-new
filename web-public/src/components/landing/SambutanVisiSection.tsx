import { ChevronDown, GraduationCap, Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SchoolProfile } from "@/lib/services/school-profile";
import { pecahButir } from "@/lib/teks";

interface SambutanVisiSectionProps {
  profil: SchoolProfile;
  /** Kunci `landing.sambutan_*`. */
  konten?: Record<string, string>;
  /** Kunci `profil.visi` dan `profil.misi`, sama dengan halaman Profil. */
  kontenProfil?: Record<string, string>;
}

/**
 * Sambutan pimpinan di atas, visi dan misi di bawahnya. Seluruh teksnya dari
 * CMS; bagian yang belum diisi tidak dirender, dan tanpa satu pun section ini
 * hilang.
 *
 * Kartu Visi memakai navy tetap, bukan token `primary`: di mode gelap
 * `primary` menjadi biru muda dan label amber di atasnya tidak terbaca.
 */
export function SambutanVisiSection({
  profil,
  konten = {},
  kontenProfil = {},
}: SambutanVisiSectionProps) {
  // Nama dan jabatan jatuh ke profil sekolah (data yang diisi sekolah sendiri
  // di Pengaturan), tidak pernah ke nama yang ditulis di kode.
  const namaPimpinan = konten["landing.sambutan_nama"] || profil.namaPimpinan;
  const jabatanPimpinan =
    konten["landing.sambutan_jabatan"] || profil.jabatanPimpinan;
  const badgePimpinan = konten["landing.sambutan_badge"];
  const kutipan = konten["landing.sambutan_quote"];
  const isi = konten["landing.sambutan_body"];
  const visi = kontenProfil["profil.visi"];
  const misi = kontenProfil["profil.misi"];
  const butirMisi = misi ? pecahButir(misi) : [];

  const adaSambutan = Boolean(kutipan || isi);
  if (!adaSambutan && !visi && butirMisi.length === 0) return null;

  return (
    <section className="muncul bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {adaSambutan ? (
          <article className="grid items-center gap-8 rounded-3xl border border-border bg-card p-6 shadow-[0_10px_30px_-10px_rgba(0,35,111,0.08)] sm:p-8 md:grid-cols-12 md:p-12">
            <h2 className="sr-only">Sambutan pimpinan</h2>
            <div className="flex flex-col items-center text-center md:col-span-4">
              <div className="mb-4 flex h-28 w-28 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-2 ring-secondary/60 ring-offset-4 ring-offset-card">
                <GraduationCap aria-hidden="true" className="h-14 w-14" />
              </div>
              {namaPimpinan ? (
                <p className="font-serif text-lg font-bold text-foreground">
                  {namaPimpinan}
                </p>
              ) : null}
              {jabatanPimpinan ? (
                <p className="mt-0.5 text-sm font-semibold text-secondary">
                  {jabatanPimpinan}
                </p>
              ) : null}
              {badgePimpinan ? (
                <Badge variant="success" className="mt-3 text-[11px]">
                  {badgePimpinan}
                </Badge>
              ) : null}
            </div>

            <div className="space-y-5 md:col-span-8">
              <Quote aria-hidden="true" className="h-8 w-8 text-secondary/60" />
              {kutipan ? (
                <blockquote className="font-serif text-xl leading-relaxed text-foreground md:text-2xl">
                  {kutipan}
                </blockquote>
              ) : null}
              {isi ? (
                kutipan ? (
                  // Isi panjang dilipat supaya kutipan tetap menjadi pusat
                  // perhatian; elemen bawaan, jadi tetap jalan tanpa skrip.
                  <details className="group">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">
                        Baca sambutan lengkap
                      </span>
                      <span className="hidden group-open:inline">
                        Tutup sambutan
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="h-4 w-4 transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {isi}
                    </p>
                  </details>
                ) : (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {isi}
                  </p>
                )
              ) : null}
            </div>
          </article>
        ) : null}

        {visi || butirMisi.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-12">
            {visi ? (
              <div
                className={`rounded-3xl bg-[#00236f] p-8 text-white md:p-10 ${
                  butirMisi.length > 0 ? "lg:col-span-5" : "lg:col-span-12"
                }`}
              >
                <h2 className="text-sm font-bold uppercase tracking-wider text-secondary-container">
                  Visi
                </h2>
                <p className="mt-4 font-serif text-2xl leading-snug md:text-3xl">
                  {visi}
                </p>
              </div>
            ) : null}
            {butirMisi.length > 0 ? (
              <div className={visi ? "lg:col-span-7" : "lg:col-span-12"}>
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-secondary">
                  Misi
                </h2>
                <ol className="grid gap-4 sm:grid-cols-2">
                  {butirMisi.map((butir, i) => (
                    <li
                      key={butir}
                      className="flex gap-4 rounded-2xl border border-border bg-card p-5"
                    >
                      <span
                        aria-hidden="true"
                        className="font-serif text-2xl font-bold leading-none tabular-nums text-secondary"
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm leading-relaxed text-foreground">
                        {butir}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
