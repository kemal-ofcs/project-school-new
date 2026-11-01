"use client";

import useEmblaCarousel from "embla-carousel-react";
import { GraduationCap, Pause, Play } from "lucide-react";
import * as React from "react";

export interface FotoSorotan {
  src: string;
  judul: string;
  keterangan: string;
}

const JUMLAH_TERLIHAT = 5;
const JEDA_GANTI_MS = 6000;

/**
 * Bagian utama halaman depan: `children` di kolom kiri, foto besar di kolom
 * kanan, dan deretan gambar kecil di bawah keduanya. Deretannya bergeser ke kiri
 * dan foto besar mengikuti gambar yang berada di posisi paling kiri.
 *
 * Gerak otomatis berhenti lewat tombol jeda, saat kursor atau fokus berada di
 * deretan, saat tab tidak terlihat, dan sejak awal bila pengguna memilih
 * "kurangi gerakan".
 */
export function SorotanFoto({
  foto,
  nama,
  logoUrl,
  children,
}: {
  foto: FotoSorotan[];
  nama: string;
  logoUrl: string | null;
  children: React.ReactNode;
}) {
  const jumlah = foto.length;
  // Embla hanya berputar bila deretannya lebih panjang dari lebar tampilan, dan
  // lima gambar berlebar 20% tepat memenuhinya. Deretan diulang sampai cukup.
  const slide = React.useMemo(() => {
    if (jumlah < 2) return [];
    const ulang = Math.ceil((JUMLAH_TERLIHAT + 2) / jumlah);
    return Array.from({ length: jumlah * ulang }, (_, i) => i % jumlah);
  }, [jumlah]);

  const [viewportRef, api] = useEmblaCarousel({ loop: true, align: "start" });
  const [aktif, setAktif] = React.useState(0);
  const [dijeda, setDijeda] = React.useState(false);
  const ditahan = React.useRef(false);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDijeda(true);
    }
  }, []);

  React.useEffect(() => {
    if (!api || jumlah < 2) return;
    const pilih = () => setAktif(api.selectedScrollSnap() % jumlah);
    pilih();
    api.on("select", pilih).on("reInit", pilih);
    return () => {
      api.off("select", pilih).off("reInit", pilih);
    };
  }, [api, jumlah]);

  // `aktif` ikut sebagai dependensi: memilih gambar menghitung waktunya dari awal.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lihat komentar di atas
  React.useEffect(() => {
    if (!api || dijeda || jumlah < 2) return;
    const pewaktu = setInterval(() => {
      if (!document.hidden && !ditahan.current) api.scrollNext();
    }, JEDA_GANTI_MS);
    return () => clearInterval(pewaktu);
  }, [api, dijeda, jumlah, aktif]);

  const fotoAktif = foto[aktif];

  return (
    <section
      aria-label={`Foto dan informasi ${nama}`}
      className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pt-5 pb-8 sm:px-6 lg:min-h-[calc(100dvh-4.75rem)] lg:px-8 lg:pb-4"
    >
      <div className="grid gap-6 lg:flex-1 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] lg:gap-10">
        <div className="order-2 flex min-w-0 flex-col justify-center lg:order-1">
          {children}
        </div>

        {/* Teks di atas foto memakai navy tetap, bukan token `primary` yang
            menjadi terang di mode gelap. */}
        <figure className="relative order-1 aspect-[4/3] min-h-0 overflow-hidden rounded-[28px] bg-[#00236f] shadow-[0_10px_30px_-10px_rgba(0,35,111,0.25)] lg:order-2 lg:aspect-auto lg:min-h-80">
          {foto.map((item, i) => (
            // biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri
            <img
              key={item.src}
              src={item.src}
              alt={
                i === aktif
                  ? item.judul || item.keterangan || `Foto ${nama}`
                  : ""
              }
              aria-hidden={i === aktif ? undefined : true}
              fetchPriority={i === 0 ? "high" : "auto"}
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none ${
                i === aktif ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}

          {jumlah === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_85%_0%,rgba(254,166,25,0.16),transparent_55%)]">
              {logoUrl ? (
                // biome-ignore lint/performance/noImgElement: logo dari database
                <img
                  src={logoUrl}
                  alt=""
                  className="h-32 w-32 object-contain"
                />
              ) : (
                <GraduationCap
                  aria-hidden="true"
                  className="h-24 w-24 text-white/70"
                />
              )}
            </div>
          ) : null}

          {fotoAktif?.judul || fotoAktif?.keterangan ? (
            <figcaption
              aria-live={dijeda ? "polite" : "off"}
              className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#00153f]/90 via-[#00153f]/60 to-transparent px-5 pt-12 pb-4 text-white sm:px-7 sm:pb-6"
            >
              {fotoAktif.judul ? (
                <p className="font-serif text-xl font-bold sm:text-2xl">
                  {fotoAktif.judul}
                </p>
              ) : null}
              {fotoAktif.keterangan ? (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-white/90">
                  {fotoAktif.keterangan}
                </p>
              ) : null}
            </figcaption>
          ) : null}
        </figure>
      </div>

      {slide.length > 0 ? (
        // Ruang kanan di layar sedang memberi tempat tombol WhatsApp melayang.
        <div className="flex items-center gap-3 md:pr-20 2xl:pr-0">
          <section
            aria-label="Deretan foto"
            ref={viewportRef}
            className="min-w-0 flex-1 overflow-hidden rounded-2xl"
            onMouseEnter={() => {
              ditahan.current = true;
            }}
            onMouseLeave={() => {
              ditahan.current = false;
            }}
            onFocusCapture={() => {
              ditahan.current = true;
            }}
            onBlurCapture={() => {
              ditahan.current = false;
            }}
          >
            <ul className="-ml-3 flex touch-pan-y">
              {slide.map((indeks, posisi) => {
                const item = foto[indeks];
                const salinan = posisi >= jumlah;
                return (
                  <li
                    aria-hidden={salinan ? true : undefined}
                    className="min-w-0 flex-[0_0_42%] pl-3 sm:flex-[0_0_28%] lg:flex-[0_0_20%]"
                    // biome-ignore lint/suspicious/noArrayIndexKey: urutan slide tetap, satu foto bisa muncul beberapa kali
                    key={posisi}
                  >
                    <button
                      aria-current={indeks === aktif ? "true" : undefined}
                      aria-label={`Tampilkan foto ${item.judul || `${indeks + 1} dari ${jumlah}`}`}
                      className="group relative block h-24 w-full cursor-pointer overflow-hidden rounded-2xl bg-muted focus-visible:outline-none sm:h-28"
                      onClick={() => api?.scrollTo(posisi)}
                      tabIndex={salinan ? -1 : undefined}
                      type="button"
                    >
                      {/* biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri */}
                      <img
                        src={item.src}
                        alt=""
                        decoding="async"
                        draggable={false}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none"
                      />
                      {item.judul ? (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-[#00153f]/90 to-transparent px-3 pt-6 pb-2 text-left text-xs font-semibold text-white">
                          {item.judul}
                        </span>
                      ) : null}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-0 rounded-2xl ring-inset group-focus-visible:ring-3 group-focus-visible:ring-ring ${
                          indeks === aktif
                            ? "ring-3 ring-secondary-container"
                            : ""
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <button
            aria-label={
              dijeda ? "Putar pergantian foto" : "Jeda pergantian foto"
            }
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDijeda((nilai) => !nilai)}
            type="button"
          >
            {dijeda ? (
              <Play aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Pause aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}
