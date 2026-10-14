import { describe, expect, test } from "bun:test";
import { buatKuitansiPdf } from "@/components/keuangan/kuitansi";
import { buatRekapPdf } from "@/components/nilai/rekapPdf";
import type { DetailKuitansi } from "@/lib/gateways/billing";
import type { RekapNilaiAkhir } from "@/lib/gateways/grades";

// jsPDF menulis aliran teks tanpa kompresi, jadi isinya bisa diperiksa langsung.
const teks = (isi: ArrayBuffer) => new TextDecoder("latin1").decode(isi);

describe("PDF rekap dan kuitansi", () => {
  test("rekap nilai akhir memuat siswa, nilai, dan catatan", async () => {
    const rekap: RekapNilaiAkhir = {
      nama_mapel: "Matematika",
      rentang: { mulai: "2026-07-13", selesai: "2026-12-18" },
      bobot_kehadiran: 20,
      jenis: [
        {
          id_jenis: "jns-tugas",
          nama: "Tugas",
          bobot: 80,
          jumlah_penilaian: 2,
        },
      ],
      catatan: ["Matematika: belum ada penilaian UAS"],
      nilai_kosong: 1,
      siswa: [
        {
          id_siswa: "S1",
          nama_lengkap: "Ani",
          nis: "1001",
          komponen: [
            {
              id_jenis: "jns-tugas",
              rata: 80,
              bobot_efektif: 80,
              nilai_berbobot: 64,
            },
          ],
          kehadiran: {
            hari_efektif: 5,
            masuk: 2,
            izin_sakit: 1,
            tidak_masuk: 2,
            persen: 50,
            bobot_efektif: 20,
            nilai_berbobot: 10,
            bolos: [{ tanggal: "2026-07-14", mapel: ["IPA"] }],
          },
          nilai_akhir: 74,
          kosong: 1,
        },
      ],
      dicetak: "2026-10-14 09:00:00",
    };
    const isi = teks(
      await buatRekapPdf(rekap, {
        namaRombel: "VII A",
        namaTahun: "2026/2027",
        semester: "Ganjil",
      }),
    );
    expect(isi.startsWith("%PDF")).toBe(true);
    for (const potongan of [
      "Rekap Nilai Akhir",
      "Ani",
      "74",
      "belum ada penilaian UAS",
      "bolos IPA",
    ]) {
      expect(isi).toContain(potongan);
    }
  });

  test("kuitansi memuat nomor, rincian, dan total", async () => {
    const detail: DetailKuitansi = {
      pembayaran: {
        id_pembayaran: "kwt-1",
        id_siswa: "S1",
        nama_siswa: "Ani",
        tanggal: "2026-07-15",
        seri: "TU1",
        nomor: "KWT/2026/TU1/0001",
        metode: "Tunai",
        id_akun_kas: "akun-kas",
        nama_akun: "Kas",
        total: 350_000,
        keterangan: null,
        dibuat_oleh: "bendahara",
        created_at: "x",
        kelas: "VII A",
        nama_wali: "",
        no_wali: "",
        alasan_batal: null,
        status: "Sah",
      },
      alokasi: [
        {
          id_alokasi: "a1",
          id_tagihan: "t1",
          nama_tagihan: "SPP",
          periode: "2026-07",
          nominal: 300_000,
        },
        {
          id_alokasi: "a2",
          id_tagihan: null,
          nama_tagihan: null,
          periode: null,
          nominal: 50_000,
        },
      ],
      saldo_titipan: 50_000,
      kop: { nama: "SMP Uji", logo_url: "https://contoh.invalid/logo.png" },
    };
    const isi = teks(await buatKuitansiPdf(detail));
    expect(isi.startsWith("%PDF")).toBe(true);
    for (const potongan of [
      "KWT/2026/TU1/0001",
      "SPP 2026-07",
      "Titipan Wali",
      "Rp350.000",
      "SMP UJI",
    ]) {
      expect(isi).toContain(potongan);
    }
  });
});
