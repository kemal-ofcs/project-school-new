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

/**
 * Bagian utama halaman depan: `children` di kolom kiri, foto besar di kolom
 * kanan, dan deretan gambar kecil di bawah keduanya, di atas latar navy yang
 * menyusup ke belakang header.
 *
 * Pewaktunya adalah animasi garis progres pada gambar aktif: selesainya animasi
 * memicu pergeseran. Jadi garis dan gerak tidak mungkin berselisih, dan CSS yang
 * menahan garis sekaligus menahan pergeseran: tombol jeda, kursor di atas
 * deretan, dan fokus keyboard. Pengguna yang memilih "kurangi gerakan" mulai
 * dalam keadaan dijeda.
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
  const [posisiAktif, setPosisiAktif] = React.useState(0);
  const [dijeda, setDijeda] = React.useState(false);
  const aktif = jumlah > 0 ? posisiAktif % jumlah : 0;

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDijeda(true);
    }
  }, []);

  React.useEffect(() => {
    if (!api) return;
    const pilih = () => setPosisiAktif(api.selectedScrollSnap());
    pilih();
    api.on("select", pilih).on("reInit", pilih);
    return () => {
      api.off("select", pilih).off("reInit", pilih);
    };
  }, [api]);

  const fotoAktif = foto[aktif];

  return (
    <section
      aria-label={`Foto dan informasi ${nama}`}
      className="relative -mt-[4.75rem] -mb-20 overflow-hidden bg-[#00153f] pt-[4.75rem] lg:min-h-dvh"
    >
      {/* Warna foto aktif merembes samar ke latar, jadi latar ikut berganti. */}
      <div aria-hidden="true" className="absolute inset-0 hidden lg:block">
        {foto.map((item, i) => (
          // biome-ignore lint/performance/noImgElement: foto dari database, dilayani rute ber-cache sendiri
          <img
            key={item.src}
            src={item.src}
            alt=""
            decoding="async"
            className={`absolute inset-0 h-full w-full scale-110 object-cover blur-3xl transition-opacity duration-1000 motion-reduce:transition-none ${
              i === aktif ? "opacity-30" : "opacity-0"
            }`}
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_0%,rgba(254,166,25,0.18),transparent_55%),linear-gradient(to_right,#00153f_30%,rgba(0,21,63,0.55))]"
      />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pt-5 pb-8 sm:px-6 lg:min-h-[calc(100dvh-4.75rem)] lg:px-8 lg:pb-4">
        <div className="grid gap-6 lg:flex-1 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] lg:gap-12">
          <div className="order-2 flex min-w-0 flex-col justify-center lg:order-1">
            {children}
          </div>

          <div className="relative order-1 min-h-0 lg:order-2 lg:min-h-80">
            <div
              aria-hidden="true"
              className="absolute -right-2 -bottom-2 hidden h-full w-full rounded-[32px] border border-secondary-container/40 lg:block"
            />
            <figure className="foto-masuk relative aspect-[4/3] overflow-hidden rounded-[28px] bg-[#00236f] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/10 lg:absolute lg:inset-0 lg:aspect-auto lg:rounded-[32px]">
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
                  className={`absolute inset-0 h-full w-full object-cover [transition:opacity_700ms,scale_8000ms_ease-out] motion-reduce:scale-100 motion-reduce:transition-none ${
                    i === aktif
                      ? "scale-[1.06] opacity-100"
                      : "scale-100 opacity-0"
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

              {jumlah > 1 ? (
                <p
                  aria-hidden="true"
                  className="absolute top-4 right-4 rounded-full bg-[#00153f]/70 px-3 py-1 text-xs font-semibold tabular-nums text-white"
                >
                  {String(aktif + 1).padStart(2, "0")}
                  <span className="text-white/60">
                    {" / "}
                    {String(jumlah).padStart(2, "0")}
                  </span>
                </p>
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
        </div>

        {slide.length > 0 ? (
          // Ruang kanan di layar sedang memberi tempat tombol WhatsApp melayang.
          <div className="group/deret flex items-center gap-3 md:pr-20 2xl:pr-0">
            <div
              ref={viewportRef}
              className="min-w-0 flex-1 overflow-hidden rounded-2xl"
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
                        className={`group relative block h-24 w-full cursor-pointer overflow-hidden rounded-2xl bg-white/10 transition-opacity focus-visible:outline-none motion-reduce:transition-none sm:h-28 ${
                          indeks === aktif
                            ? "opacity-100"
                            : "opacity-65 hover:opacity-100"
                        }`}
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
                          <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-[#00153f]/90 to-transparent px-3 pt-6 pb-2.5 text-left text-xs font-semibold text-white">
                            {item.judul}
                          </span>
                        ) : null}
                        <span
                          aria-hidden="true"
                          className={`absolute inset-0 rounded-2xl ring-inset group-focus-visible:ring-3 group-focus-visible:ring-white ${
                            indeks === aktif
                              ? "ring-2 ring-secondary-container"
                              : "ring-1 ring-white/15"
                          }`}
                        />
                        {/* Baru dirender setelah carousel siap: animasi yang
                            selesai sebelum JavaScript jalan tidak pernah
                            memicu pergeseran, dan fotonya macet selamanya. */}
                        {api && posisi === posisiAktif ? (
                          <span
                            aria-hidden="true"
                            className={`garis-progres absolute inset-x-0 bottom-0 h-1 origin-left bg-secondary-container group-hover/deret:[animation-play-state:paused] group-has-[:focus-visible]/deret:[animation-play-state:paused] ${
                              dijeda ? "[animation-play-state:paused]" : ""
                            }`}
                            onAnimationEnd={() => api?.scrollNext()}
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <button
              aria-label={
                dijeda ? "Putar pergantian foto" : "Jeda pergantian foto"
              }
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
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
      </div>
    </section>
  );
}
