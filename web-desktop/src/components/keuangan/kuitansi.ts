import type { DetailKuitansi } from "@/lib/gateways/billing";
import { formatRupiah } from "@/lib/validations/accounting";

/**
 * Kuitansi pembayaran: dicetak setengah A4 (A5) lewat dialog cetak
 * browser/WebView2, atau dikirim sebagai teks ke WhatsApp wali. WebView
 * Android tidak punya dialog cetak, jadi pemanggil menyembunyikan tombol
 * cetaknya di Mobile, sama seperti berita acara inventaris.
 */

const ROOT_ID = "kos-print-root";

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tanggalPanjang(tanggal: string): string {
  const waktu = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(waktu.getTime())) return tanggal;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(waktu);
}

/** Nama baris alokasi: tagihan beserta periodenya, atau Titipan Wali. */
export function namaAlokasi(item: DetailKuitansi["alokasi"][number]): string {
  if (!item.id_tagihan) return "Titipan Wali";
  const periode = item.periode && item.periode !== "SEKALI" ? item.periode : "";
  return `${item.nama_tagihan ?? item.id_tagihan} ${periode}`.trim();
}

function keteranganMetode(detail: DetailKuitansi): string {
  const p = detail.pembayaran;
  if (p.metode === "Titipan") return "Dibayar dari Titipan Wali";
  return p.nama_akun ? `${p.metode} (${p.nama_akun})` : p.metode;
}

/** Teks kuitansi untuk WhatsApp. Wali yang menekan kirim; aplikasi tidak mengirim apa pun sendiri. */
export function teksKuitansiWa(detail: DetailKuitansi): string {
  const p = detail.pembayaran;
  const sekolah = detail.kop.nama ? `${detail.kop.nama}\n` : "";
  const rincian = detail.alokasi
    .map((item) => `- ${namaAlokasi(item)}: ${formatRupiah(item.nominal)}`)
    .join("\n");
  const titipan =
    detail.saldo_titipan > 0
      ? `\nSaldo titipan: ${formatRupiah(detail.saldo_titipan)}`
      : "";
  const batal =
    p.status === "Dibatalkan"
      ? `\n\nKUITANSI INI DIBATALKAN: ${p.alasan_batal ?? ""}`
      : "";
  return `${sekolah}Kuitansi ${p.nomor}
Tanggal: ${tanggalPanjang(p.tanggal)}
Siswa: ${p.nama_siswa}${p.kelas ? ` (${p.kelas})` : ""}

${rincian}
Total: ${formatRupiah(p.total)}
Cara bayar: ${keteranganMetode(detail)}${titipan}${batal}`;
}

const GAYA = `
  @media screen { #${ROOT_ID} { display: none; } }
  @media print {
    @page { size: A5 landscape; margin: 10mm; }
    body > *:not(#${ROOT_ID}) { display: none !important; }
    #${ROOT_ID} { display: block !important; }
  }
  #${ROOT_ID} { color: #000; background: #fff; font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.35; }
  #${ROOT_ID} .kop { display: flex; gap: 10px; align-items: center; border-bottom: 3px double #000; padding-bottom: 6px; margin-bottom: 10px; }
  #${ROOT_ID} .logo { width: 48px; height: 48px; object-fit: contain; }
  #${ROOT_ID} .nama { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
  #${ROOT_ID} .kecil { font-size: 9pt; }
  #${ROOT_ID} h1 { font-size: 13pt; text-align: center; margin: 0 0 2px; letter-spacing: 2px; }
  #${ROOT_ID} .nomor { text-align: center; margin-bottom: 10px; }
  #${ROOT_ID} .data td { padding: 1px 8px 1px 0; vertical-align: top; }
  #${ROOT_ID} table.rincian { width: 100%; border-collapse: collapse; margin: 8px 0; }
  #${ROOT_ID} .rincian th, #${ROOT_ID} .rincian td { border: 1px solid #000; padding: 3px 6px; text-align: left; }
  #${ROOT_ID} .angka { text-align: right !important; }
  #${ROOT_ID} .batal { border: 2px solid #000; padding: 4px 8px; text-align: center; font-weight: bold; margin-bottom: 8px; }
  #${ROOT_ID} .tanda { display: flex; justify-content: flex-end; margin-top: 12px; }
  #${ROOT_ID} .ttd { width: 45%; text-align: center; }
  #${ROOT_ID} .ruang { height: 48px; }
  #${ROOT_ID} .garis { border-top: 1px solid #000; padding-top: 2px; }
`;

export function cetakKuitansi(detail: DetailKuitansi): void {
  const p = detail.pembayaran;
  const kop = detail.kop;
  const kontak = [kop.telepon, kop.email, kop.website]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  document.getElementById(ROOT_ID)?.remove();
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <style>${GAYA}</style>
    <header class="kop">
      ${kop.logo_url ? `<img src="${esc(kop.logo_url)}" alt="" class="logo">` : ""}
      <div>
        <div class="nama">${esc(kop.nama || "Nama Sekolah")}</div>
        ${kop.alamat ? `<div class="kecil">${esc(kop.alamat)}</div>` : ""}
        ${kontak ? `<div class="kecil">${kontak}</div>` : ""}
      </div>
    </header>
    <h1>KUITANSI</h1>
    <div class="nomor">Nomor: ${esc(p.nomor)}</div>
    ${p.status === "Dibatalkan" ? `<div class="batal">DIBATALKAN: ${esc(p.alasan_batal)}</div>` : ""}
    <table class="data">
      <tr><td>Untuk siswa</td><td>: ${esc(p.nama_siswa)}${p.kelas ? ` (${esc(p.kelas)})` : ""}</td></tr>
      <tr><td>Tanggal</td><td>: ${esc(tanggalPanjang(p.tanggal))}</td></tr>
      <tr><td>Cara bayar</td><td>: ${esc(keteranganMetode(detail))}</td></tr>
      ${p.keterangan ? `<tr><td>Keterangan</td><td>: ${esc(p.keterangan)}</td></tr>` : ""}
    </table>
    <table class="rincian">
      <thead><tr><th>Untuk pembayaran</th><th class="angka">Jumlah</th></tr></thead>
      <tbody>
        ${detail.alokasi
          .map(
            (item) =>
              `<tr><td>${esc(namaAlokasi(item))}</td><td class="angka">${esc(formatRupiah(item.nominal))}</td></tr>`,
          )
          .join("")}
        <tr><th>Total</th><th class="angka">${esc(formatRupiah(p.total))}</th></tr>
      </tbody>
    </table>
    <div class="tanda">
      <div class="ttd">
        <div>Penerima</div>
        <div class="ruang"></div>
        <div class="garis">${esc(p.dibuat_oleh)}</div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  // Beri waktu logo selesai dimuat sebelum dialog cetak dibuka.
  setTimeout(() => {
    window.focus();
    window.print();
    setTimeout(() => root.remove(), 3000);
  }, 300);
}
