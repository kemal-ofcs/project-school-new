import {
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  MessageCircle,
  Upload,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KataMuncul } from "@/components/visual/KataMuncul";
import { koleksiTahapanPmb } from "@/lib/services/landing-collections";
import type { GelombangAktif } from "@/lib/services/pmb";
import { tautanWhatsApp } from "@/lib/teks";
import { PESAN_WA_PMB } from "./StickyActionMobile";

interface PmbOverviewSectionProps {
  gelombangAktif: GelombangAktif | null;
  konten?: Record<string, string>;
  nomorTelepon?: string | null;
}

/**
 * Ikon tahapan diputar berdasarkan posisi. Ia komponen React sehingga tidak
 * bisa disimpan di database, dan tahapan ke-N tetap butuh satu.
 */
const IKON_TAHAPAN = [FileText, Upload, UserCheck, CheckCircle];

/**
 * Ringkasan PMB di landing page.
 *
 * Kotak gelombang SELALU tampil karena datanya dari tabel PMB, bukan dari CMS.
 * Judul-judul dan tahapan pendaftarannya dari CMS (`landing.pmb_*`); versi
 * sebelumnya menulis empat tahapan di kode beserta judul "4 Langkah Mudah…",
 * yang langsung berbohong begitu sekolah punya tiga atau lima langkah.
 */
export function PmbOverviewSection({
  gelombangAktif,
  konten = {},
  nomorTelepon,
}: PmbOverviewSectionProps) {
  const waUrl = tautanWhatsApp(nomorTelepon, PESAN_WA_PMB);
  const eyebrow = konten["landing.pmb_eyebrow"];
  const title = konten["landing.pmb_title"];
  const subtitle = konten["landing.pmb_subtitle"];
  const judulTahapan = konten["landing.pmb_tahapan_title"];
  const tahapan = koleksiTahapanPmb(konten).map((item, i) => ({
    ...item,
    // Nomor langkah dihitung dari urutan, bukan disimpan: menggeser atau
    // menghapus satu tahapan di CMS tidak boleh meninggalkan nomor yang loncat.
    step: String(i + 1),
    icon: IKON_TAHAPAN[i % IKON_TAHAPAN.length],
  }));
  const adaHeader = Boolean(eyebrow || title || subtitle);

  return (
    <section className="muncul py-20 sm:py-28 bg-muted/40 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
        {adaHeader ? (
          <div className="text-center max-w-2xl mx-auto space-y-3">
            {eyebrow ? (
              <p className="text-sm font-semibold text-secondary">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className="font-serif text-3xl font-bold tracking-tight text-primary text-balance md:text-5xl">
                <KataMuncul teks={title} />
              </h2>
            ) : null}
            {subtitle ? (
              <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Banner Gelombang Aktif */}
        {gelombangAktif ? (
          <div className="rounded-3xl border-2 border-accent bg-card p-6 shadow-xl sm:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="text-xs uppercase">
                    Gelombang aktif
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Tahun Ajaran {gelombangAktif.tahunAjaran}
                  </span>
                </div>
                <h3 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">
                  {gelombangAktif.nama}
                </h3>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-secondary" />
                  <span>
                    Jadwal: {gelombangAktif.tanggalBuka} s/d{" "}
                    {gelombangAktif.tanggalTutup}
                  </span>
                </p>
                {gelombangAktif.biayaPendaftaran > 0 ? (
                  <p className="text-xs font-semibold text-foreground">
                    Biaya Pendaftaran: Rp{" "}
                    {gelombangAktif.biayaPendaftaran.toLocaleString("id-ID")}{" "}
                    <span className="text-muted-foreground font-normal">
                      (dibayarkan di loket/transfer)
                    </span>
                  </p>
                ) : (
                  <p className="text-xs font-bold text-accent">
                    Bebas Biaya Pendaftaran Formulir
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                <Button
                  asChild
                  variant="secondary"
                  size="lg"
                  className="h-12 w-full sm:w-auto shadow-md font-bold justify-center"
                >
                  <Link href="/pmb/daftar">
                    <span>Isi Formulir Online</span>
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-12 w-full sm:w-auto justify-center"
                >
                  <Link href="/pmb/status">
                    <span>Cek Status Berkas</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center space-y-3">
            <h3 className="font-bold text-lg text-foreground">
              Gelombang Pendaftaran Belum Dibuka
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Panitia sedang mempersiapkan jadwal gelombang PMB berikutnya.
              Silakan hubungi nomor kontak sekolah untuk informasi konsultasi
              awal.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/kontak">Hubungi Sekretariat PMB</Link>
            </Button>
          </div>
        )}

        {tahapan.length > 0 ? (
          <div className="space-y-6">
            {judulTahapan ? (
              <h3 className="font-bold text-xl text-foreground text-center">
                {judulTahapan}
              </h3>
            ) : null}

            {/* Garis penghubung: tegak di HP (langkah bertumpuk), mendatar di
                desktop (langkah sebaris). Jumlah langkah mengikuti CMS. */}
            <ol className="grid gap-8 lg:auto-cols-fr lg:grid-flow-col lg:gap-6">
              {tahapan.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.step}
                    className="relative flex gap-4 lg:flex-col lg:gap-5"
                  >
                    {idx < tahapan.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-[19px] top-12 -bottom-8 w-0.5 bg-primary/20 lg:left-14 lg:-right-6 lg:top-5 lg:bottom-auto lg:h-0.5 lg:w-auto"
                      />
                    ) : null}
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-4 ring-muted">
                      {item.step}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5 rounded-2xl border border-border bg-card p-5">
                      <div className="flex items-center gap-2 text-primary">
                        <Icon aria-hidden="true" className="h-4 w-4" />
                        <h4 className="font-bold text-base text-foreground">
                          {item.title}
                        </h4>
                      </div>
                      {item.desc ? (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {item.desc}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {/* Penutup: navy tetap (bukan token `primary` yang menjadi terang
            di mode gelap), supaya tombolnya selalu kontras. */}
        <div className="rounded-3xl bg-[#00236f] p-8 text-white sm:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl space-y-2">
              <h3 className="font-serif text-2xl font-bold sm:text-3xl">
                Masih ada yang ingin ditanyakan?
              </h3>
              <p className="text-sm leading-relaxed text-white/85 sm:text-base">
                Panitia menjawab pertanyaan seputar jadwal, berkas, dan biaya
                pendaftaran.
              </p>
              <Link
                href="/pmb/status"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-secondary-container underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-container rounded"
              >
                Sudah mendaftar? Cek status pendaftaran
              </Link>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#00236f] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-container"
                >
                  <MessageCircle aria-hidden="true" className="h-4 w-4" />
                  Tanya Panitia di WhatsApp
                </a>
              ) : null}
              <Link
                href={gelombangAktif ? "/pmb/daftar" : "/kontak"}
                className="inline-flex h-12 items-center justify-center rounded-full bg-secondary-container px-6 text-sm font-bold text-secondary-container-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {gelombangAktif
                  ? "Isi Formulir Online"
                  : "Lihat Kontak Sekolah"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
