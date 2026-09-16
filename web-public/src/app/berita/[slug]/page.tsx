import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { muatDetailBerita } from "@/lib/server/content-data";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hasil = await muatDetailBerita(slug);

  if (hasil.status !== "ok" || !hasil.data) {
    return {
      title: "Artikel Tidak Ditemukan",
    };
  }

  const article = hasil.data;
  return {
    title: article.judul,
    description: article.ringkasan || `Artikel berita seputar ${article.judul}`,
    openGraph: {
      title: article.judul,
      description: article.ringkasan || undefined,
    },
  };
}

export default async function HalamanDetailBerita({ params }: Props) {
  const { slug } = await params;
  const hasil = await muatDetailBerita(slug);

  if (hasil.status !== "ok" || !hasil.data) {
    notFound();
  }

  const article = hasil.data;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      {/* Tombol Navigasi Kembali */}
      <div className="mb-8">
        <Link
          href="/berita"
          className="inline-flex items-center gap-2 text-xs font-bold text-aksen hover:underline"
        >
          <span>←</span>
          <span>Kembali ke Berita & Kegiatan</span>
        </Link>
      </div>

      <article className="space-y-6">
        {/* Header Artikel */}
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-teks-lembut">
            {article.tanggal_terbit ? (
              <time dateTime={article.tanggal_terbit}>
                {new Date(article.tanggal_terbit).toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            ) : null}
            {article.penulis ? (
              <>
                <span>•</span>
                <span>Oleh: {article.penulis}</span>
              </>
            ) : null}
          </div>

          <h1 className="font-extrabold text-2xl sm:text-4xl text-teks-utama leading-tight tracking-tight">
            {article.judul}
          </h1>

          {article.ringkasan ? (
            <p className="text-base text-teks-lembut leading-relaxed font-medium pt-1 border-l-2 border-aksen pl-4 italic">
              {article.ringkasan}
            </p>
          ) : null}
        </header>

        {/* Gambar Sampul */}
        {article.gambar_sampul ? (
          <div className="overflow-hidden rounded-2xl border border-garis bg-slate-900 shadow-md">
            {/* biome-ignore lint/performance/noImgElement: Data URI dari database cloud */}
            <img
              src={article.gambar_sampul}
              alt={article.judul}
              className="w-full max-h-[450px] object-cover"
            />
          </div>
        ) : null}

        {/* Isi Konten Artikel */}
        <div className="pt-4 text-teks-utama leading-relaxed text-sm sm:text-base space-y-4 whitespace-pre-line font-sans">
          {article.isi}
        </div>

        {/* Footer Artikel */}
        <footer className="mt-12 pt-6 border-t border-garis flex items-center justify-between text-xs text-teks-lembut">
          <span>Bagikan kabar baik ini kepada rekan dan keluarga.</span>
          <Link href="/berita" className="font-bold text-aksen hover:underline">
            Lihat berita lainnya →
          </Link>
        </footer>
      </article>
    </main>
  );
}
