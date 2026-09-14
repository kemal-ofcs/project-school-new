import {
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  Sparkles,
  Upload,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { GelombangAktif } from "@/lib/services/pmb";

interface PmbOverviewSectionProps {
  gelombangAktif: GelombangAktif | null;
}

const TAHAPAN = [
  {
    step: "1",
    icon: FileText,
    title: "Formulir Daring",
    desc: "Mengisi data diri calon siswa, riwayat asal sekolah, kontak wali, dan pilihan program studi secara online.",
  },
  {
    step: "2",
    icon: Upload,
    title: "Unggah Berkas",
    desc: "Mengunggah pasfoto terbaru, scan Kartu Keluarga, Akta Kelahiran, dan salinan rapor semester terakhir (max 500KB).",
  },
  {
    step: "3",
    icon: UserCheck,
    title: "Verifikasi & Wawancara",
    desc: "Pemeriksaan keabsahan dokumen oleh panitia dan sesi wawancara peminatan minat bakat bersama psikolog sekolah.",
  },
  {
    step: "4",
    icon: CheckCircle,
    title: "Pengumuman & Daftar Ulang",
    desc: "Mengecek nomor kelulusan di portal status, penyelesaian administrasi daftar ulang, dan pengambilan seragam.",
  },
] as const;

export function PmbOverviewSection({
  gelombangAktif,
}: PmbOverviewSectionProps) {
  return (
    <section className="py-20 sm:py-28 bg-muted/40 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Penerimaan Murid Baru</span>
          </div>
          <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
            Alur Pendaftaran & Transparansi Biaya
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Proses seleksi penerimaan murid baru yang transparan, mudah, dan
            terpadu dalam 4 tahapan sistematis.
          </p>
        </div>

        {/* Banner Gelombang Aktif */}
        {gelombangAktif ? (
          <div className="rounded-2xl border border-secondary-container bg-card p-6 sm:p-8 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="text-xs uppercase">
                    GELOMBANG DIBUKA
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Tahun Ajaran {gelombangAktif.tahunAjaran}
                  </span>
                </div>
                <h3 className="font-bold text-xl sm:text-2xl text-foreground">
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

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Button
                  asChild
                  variant="secondary"
                  size="lg"
                  className="shadow-md"
                >
                  <Link href="/pmb/daftar">
                    <span>Isi Formulir Online</span>
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
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

        {/* 4 Tahapan Berurutan */}
        <div className="space-y-6">
          <h3 className="font-bold text-xl text-foreground text-center">
            4 Langkah Mudah Menjadi Bagian Sekolah Kami
          </h3>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TAHAPAN.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.step}
                  className="relative flex flex-col justify-between p-6 bg-card border-border shadow-xs hover:shadow-md transition-shadow"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-sm text-primary-foreground shadow-sm">
                        {item.step}
                      </span>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="font-bold text-base text-foreground">
                        {item.title}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Informasi Bantuan & Cek Status Mandiri */}
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="font-bold text-base text-foreground">
              Sudah Pernah Mendaftar Sebelumnya?
            </h4>
            <p className="text-xs text-muted-foreground">
              Periksa perkembangan verifikasi berkas atau jadwal tes Anda secara
              mandiri menggunakan Nomor Pendaftaran.
            </p>
          </div>
          <Button asChild variant="outline" size="default">
            <Link href="/pmb/status">
              <span>Halaman Cek Status</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
