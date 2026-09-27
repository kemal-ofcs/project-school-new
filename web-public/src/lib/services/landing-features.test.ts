import { describe, expect, test } from "bun:test";

describe("Fitur Landing Page UI/UX Baru (Delta Verification)", () => {
  describe("Validasi Format dan Ukuran Unggahan Hero Background Image", () => {
    const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
    const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB batas awal

    function validateHeroImage(file: { type: string; size: number }): {
      valid: boolean;
      error?: string;
    } {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return {
          valid: false,
          error: "Format berkas harus JPEG, PNG, atau WebP.",
        };
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
          valid: false,
          error: "Ukuran berkas melebihi batas maksimal 5 MB.",
        };
      }
      return { valid: true };
    }

    test("menerima berkas JPEG, PNG, dan WebP di bawah batas ukuran", () => {
      expect(
        validateHeroImage({ type: "image/jpeg", size: 1024 * 500 }).valid,
      ).toBe(true);
      expect(
        validateHeroImage({ type: "image/png", size: 1024 * 1024 }).valid,
      ).toBe(true);
      expect(
        validateHeroImage({ type: "image/webp", size: 1024 * 200 }).valid,
      ).toBe(true);
    });

    test("menolak format yang tidak diizinkan seperti GIF, BMP, SVG, PDF", () => {
      const gif = validateHeroImage({ type: "image/gif", size: 50000 });
      expect(gif.valid).toBe(false);
      expect(gif.error).toContain("JPEG, PNG, atau WebP");

      const bmp = validateHeroImage({ type: "image/bmp", size: 50000 });
      expect(bmp.valid).toBe(false);

      const svg = validateHeroImage({ type: "image/svg+xml", size: 50000 });
      expect(svg.valid).toBe(false);

      const pdf = validateHeroImage({ type: "application/pdf", size: 50000 });
      expect(pdf.valid).toBe(false);
    });

    test("menolak berkas yang melebihi 5 MB", () => {
      const besar = validateHeroImage({
        type: "image/jpeg",
        size: 5 * 1024 * 1024 + 1,
      });
      expect(besar.valid).toBe(false);
      expect(besar.error).toContain("5 MB");
    });
  });

  describe("Logika Pencarian dan Filter Jurusan / Ekskul", () => {
    const daftarProdi = [
      {
        kode: "RPL",
        nama: "Rekayasa Perangkat Lunak",
        deskripsi: "Pengembangan web dan aplikasi mobile",
      },
      {
        kode: "TKJ",
        nama: "Teknik Komputer dan Jaringan",
        deskripsi: "Infrastruktur cloud dan jaringan",
      },
      {
        kode: "AK",
        nama: "Akuntansi dan Keuangan",
        deskripsi: "Pengelolaan keuangan dan perpajakan",
      },
    ];

    function filterProdi(prodiList: typeof daftarProdi, query: string) {
      const q = query.trim().toLowerCase();
      if (!q) return prodiList;
      return prodiList.filter(
        (p) =>
          p.nama.toLowerCase().includes(q) ||
          p.kode?.toLowerCase().includes(q) ||
          p.deskripsi?.toLowerCase().includes(q),
      );
    }

    test("pencarian kosong mengembalikan seluruh jurusan", () => {
      expect(filterProdi(daftarProdi, "")).toHaveLength(3);
      expect(filterProdi(daftarProdi, "   ")).toHaveLength(3);
    });

    test("pencarian mencocokkan nama, kode, atau deskripsi secara case-insensitive", () => {
      expect(filterProdi(daftarProdi, "rpl")).toHaveLength(1);
      expect(filterProdi(daftarProdi, "komputer")).toHaveLength(1);
      expect(filterProdi(daftarProdi, "keuangan")).toHaveLength(1);
      expect(filterProdi(daftarProdi, "aplikasi")).toHaveLength(1);
      expect(filterProdi(daftarProdi, "xyz_tidak_ada")).toHaveLength(0);
    });

    const daftarEkskul = [
      {
        title: "Koding & Robotik",
        category: "Teknologi",
        desc: "Belajar coding",
      },
      { title: "Futsal", category: "Olahraga", desc: "Latihan fisik" },
      { title: "Basket", category: "Olahraga", desc: "Pertandingan tim" },
      { title: "Seni Musik", category: "Kesenian", desc: "Band dan akustik" },
    ];

    function filterEkskul(
      ekskulList: typeof daftarEkskul,
      query: string,
      kategori: string,
    ) {
      const q = query.trim().toLowerCase();
      return ekskulList.filter((e) => {
        const matchKat =
          kategori === "Semua" ||
          e.category?.trim().toLowerCase() === kategori.toLowerCase();
        if (!matchKat) return false;
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          e.desc?.toLowerCase().includes(q) ||
          e.category?.toLowerCase().includes(q)
        );
      });
    }

    test("filter ekskul menyaring kategori dan kata kunci secara bersamaan", () => {
      expect(filterEkskul(daftarEkskul, "", "Semua")).toHaveLength(4);
      expect(filterEkskul(daftarEkskul, "", "Olahraga")).toHaveLength(2);
      expect(filterEkskul(daftarEkskul, "futsal", "Olahraga")).toHaveLength(1);
      expect(filterEkskul(daftarEkskul, "koding", "Olahraga")).toHaveLength(0);
      expect(filterEkskul(daftarEkskul, "koding", "Semua")).toHaveLength(1);
    });
  });

  describe("Logika Pencarian Cepat FAQ", () => {
    const daftarFaq = [
      {
        q: "Kapan gelombang pendaftaran dibuka?",
        a: "Mulai bulan Januari setiap tahun ajaran baru.",
      },
      {
        q: "Berapa biaya seragam sekolah?",
        a: "Biaya seragam sudah termasuk dalam rincian daftar ulang.",
      },
      {
        q: "Apakah tersedia program beasiswa prestasi?",
        a: "Tersedia beasiswa akademik dan non-akademik.",
      },
    ];

    function filterFaq(faqs: typeof daftarFaq, query: string) {
      const q = query.trim().toLowerCase();
      if (!q) return faqs;
      return faqs.filter(
        (f) => f.q.toLowerCase().includes(q) || f.a?.toLowerCase().includes(q),
      );
    }

    test("pencarian faq mencocokkan pertanyaan maupun jawaban", () => {
      expect(filterFaq(daftarFaq, "")).toHaveLength(3);
      expect(filterFaq(daftarFaq, "gelombang")).toHaveLength(1);
      expect(filterFaq(daftarFaq, "beasiswa")).toHaveLength(1);
      expect(filterFaq(daftarFaq, "daftar ulang")).toHaveLength(1); // cocok di jawaban 'a'
      expect(filterFaq(daftarFaq, "tidak_ada_kata_ini")).toHaveLength(0);
    });
  });

  describe("Kalkulasi Waktu Mundur PMB (Countdown Math)", () => {
    function calculateTimeRemaining(
      targetDateStr: string,
      currentTimestamp: number,
    ) {
      const targetTime = new Date(`${targetDateStr}T23:59:59+07:00`).getTime();
      const diff = targetTime - currentTimestamp;

      if (Number.isNaN(targetTime) || diff <= 0) {
        return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      return {
        expired: false,
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / 1000 / 60) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      };
    }

    test("menghitung sisa hari, jam, menit secara akurat", () => {
      // 2 hari sebelum target
      const now = new Date("2026-09-25T10:00:00+07:00").getTime();
      const target = "2026-09-27";
      const res = calculateTimeRemaining(target, now);

      expect(res.expired).toBe(false);
      expect(res.days).toBe(2);
      expect(res.hours).toBe(13); // 23:59:59 - 10:00:00 = 13 jam
    });

    test("menandai expired jika target tanggal sudah lewat", () => {
      const now = new Date("2026-09-28T08:00:00+07:00").getTime();
      const target = "2026-09-27";
      const res = calculateTimeRemaining(target, now);

      expect(res.expired).toBe(true);
      expect(res.days).toBe(0);
      expect(res.hours).toBe(0);
    });
  });
});
