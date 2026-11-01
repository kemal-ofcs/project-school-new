import { KataMuncul } from "@/components/visual/KataMuncul";
import { pecahButir } from "@/lib/teks";

/**
 * Visi, misi, sambutan, dan sejarah. Dipakai halaman Profil dan halaman unit;
 * bagian yang belum diisi di CMS tidak dirender.
 */
export function BlokProfil({
  sebutan,
  visi,
  misi,
  sambutan,
  sejarah,
  jabatanPimpinan,
  namaPimpinan,
}: {
  /** Yang disebut di judul: "Sekolah", atau nama unit. */
  sebutan: string;
  visi?: string;
  misi?: string;
  sambutan?: string;
  sejarah?: string;
  /** Jabatan di judul sambutan, misalnya "Kepala Sekolah". */
  jabatanPimpinan: string;
  namaPimpinan?: string | null;
}) {
  const butirMisi = misi ? pecahButir(misi) : [];

  return (
    <>
      {/* Visi adalah satu-satunya blok navy di sini: ia pernyataan paling
          penting, jadi ia yang menjadi titik fokus. */}
      {visi ? (
        <section className="muncul rounded-2xl bg-primary px-6 py-10 sm:px-12 sm:py-14 text-primary-foreground">
          <h2 className="text-sm font-semibold opacity-80">Visi {sebutan}</h2>
          <p className="mt-4 text-xl sm:text-2xl font-semibold leading-snug whitespace-pre-line text-balance">
            {visi}
          </p>
        </section>
      ) : null}

      {butirMisi.length > 0 ? (
        <section className="muncul">
          <h2 className="font-bold text-2xl text-foreground">
            <KataMuncul teks={`Misi ${sebutan}`} />
          </h2>
          {butirMisi.length === 1 ? (
            <p className="mt-6 leading-relaxed text-muted-foreground whitespace-pre-line">
              {butirMisi[0]}
            </p>
          ) : (
            <ol className="mt-6 divide-y divide-border border-y border-border">
              {butirMisi.map((butir, i) => (
                <li className="flex gap-5 py-5" key={`${i}-${butir}`}>
                  <span className="w-8 shrink-0 font-extrabold text-2xl leading-none tabular-nums text-secondary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="leading-relaxed text-foreground">{butir}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {/* Sambutan sengaja tanpa kotak: kutipan yang berdiri di latar halaman
          membedakannya dari blok visi dan daftar misi di atasnya. */}
      {sambutan ? (
        <section className="muncul relative sm:pl-16">
          <span
            aria-hidden="true"
            className="absolute -top-6 left-0 hidden select-none font-serif text-8xl leading-none text-primary/15 sm:block"
          >
            &ldquo;
          </span>
          <h2 className="text-sm font-semibold text-primary">
            Sambutan {jabatanPimpinan}
          </h2>
          <blockquote className="mt-4 text-lg sm:text-xl leading-relaxed text-foreground whitespace-pre-line">
            {sambutan}
          </blockquote>
          {namaPimpinan ? (
            <p className="mt-6 font-bold text-foreground">
              {namaPimpinan}
              <span className="block text-sm font-normal text-muted-foreground">
                {jabatanPimpinan}
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      {sejarah ? (
        <section className="muncul grid gap-4 md:grid-cols-[12rem_1fr] md:gap-10">
          <h2 className="font-bold text-2xl text-foreground">
            <KataMuncul teks="Sejarah Singkat" />
          </h2>
          <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
            {sejarah}
          </p>
        </section>
      ) : null}
    </>
  );
}
