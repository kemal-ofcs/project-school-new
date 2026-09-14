"use client";

import { HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    id: "faq-1",
    q: "Apa saja syarat berkas yang diperlukan untuk mendaftar PMB online?",
    a: "Calon siswa wajib melampirkan file digital (format JPEG/PNG/PDF max 500KB per berkas): Pasfoto terbaru ukuran 3x4, scan Kartu Keluarga, scan Akta Kelahiran, dan salinan rapor SMP/sederajat semester 1 s/d 5. Dokumen fisik asli dapat ditunjukkan saat verifikasi wawancara di kampus.",
  },
  {
    id: "faq-2",
    q: "Apakah tersedia program beasiswa prestasi akademik atau tahfidz?",
    a: "Ya, sekolah menyediakan Jalur Beasiswa Prestasi berupa potongan Uang Gedung (DPP) hingga 100% dan bebas SPP untuk juara olimpiade sains (OSN) minimal tingkat provinsi, atlet berprestasi tingkat nasional, serta hafidz/hafidzah Al-Qur'an minimal 5 Juz.",
  },
  {
    id: "faq-3",
    q: "Bagaimana proses seleksi dan penentuan peminatan jurusan?",
    a: "Seleksi meliputi tes diagnostik akademik dasar (Matematika, Bahasa Inggris, Literasi Sains) serta wawancara psikologi minat bakat bersama orang tua. Hasil asesmen digunakan sebagai acuan rekomendasi penempatan program keahlian yang paling optimal bagi siswa.",
  },
  {
    id: "faq-4",
    q: "Apakah sekolah memiliki program pengayaan kurikulum internasional?",
    a: "Ya. Selain menjalankan Kurikulum Merdeka nasional secara penuh, sekolah kami mengintegrasikan pembelajaran bilingual harian (Bahasa Indonesia & Bahasa Inggris) serta opsi sertifikasi internasional Cambridge IGCSE untuk mata pelajaran sains dan matematika.",
  },
  {
    id: "faq-5",
    q: "Bagaimana sistem pemantauan kehadiran dan nilai siswa oleh orang tua?",
    a: "Orang tua memiliki akses khusus ke Portal Wali Murid di situs ini. Anda dapat memantau jam presensi gerbang anak saat tiba dan pulang sekolah secara real-time, grafik kehadiran bulanan, hingga rekapan laporan hasil belajar menggunakan login kode WhatsApp OTP.",
  },
] as const;

export function FaqSection() {
  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Pusat Bantuan Informasi</span>
          </div>
          <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
            Pertanyaan yang Sering Diajukan (FAQ)
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Temukan jawaban atas pertanyaan umum seputar pendaftaran murid baru,
            beasiswa, dan lingkungan belajar di sekolah kami.
          </p>
        </div>

        {/* Accordion Component */}
        <Accordion type="single" defaultValue="faq-1" className="w-full">
          {FAQS.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger>{faq.q}</AccordionTrigger>
              <AccordionContent>{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
