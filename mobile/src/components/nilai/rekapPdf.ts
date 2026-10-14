import type { RekapNilaiAkhir } from "@/lib/gateways/grades";

/**
 * Rekap nilai akhir sebagai PDF (Fase N2b), untuk semua build. WebView
 * Android tidak punya dialog cetak, jadi PDF inilah jalan rekap sampai ke
 * tangan guru di ponsel; berkasnya diserahkan lewat `saveFileWithPicker`
 * (dialog SAF di Android). Pustakanya dimuat saat dibutuhkan saja dan
 * dibundel bersama aplikasi, tanpa CDN.
 *
 * Huruf bawaan jsPDF (Helvetica) memakai WinAnsi, cukup untuk teks Indonesia.
 */

export interface InfoRekap {
  namaRombel: string;
  namaTahun: string;
  semester: string;
}

function angka(nilai: number | null): string {
  return nilai === null
    ? "-"
    : nilai.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function tanggalPendek(tanggal: string): string {
  const [, bulan, hari] = tanggal.split("-");
  return hari && bulan ? `${hari}/${bulan}` : tanggal;
}

/** Isi PDF rekap. Dipisah dari penyimpanan supaya bisa diuji tanpa dialog. */
export async function buatRekapPdf(
  data: RekapNilaiAkhir,
  info: InfoRekap,
): Promise<ArrayBuffer> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const lebar = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Rekap Nilai Akhir", 14, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `${data.nama_mapel}, ${info.namaRombel}, semester ${info.semester} ${info.namaTahun}`.trim(),
    14,
    21,
  );
  doc.setFontSize(8);
  doc.text(
    `Hari efektif ${data.rentang.mulai} s.d. ${data.rentang.selesai}. Dihitung ${data.dicetak} WIB, belum dibekukan.`,
    14,
    26,
  );

  const head = [
    "No",
    "Nama",
    "NIS",
    ...data.jenis.map((j) => `${j.nama}\n(${j.bobot}%)`),
    `Kehadiran\n(${data.bobot_kehadiran}%)`,
    "Nilai akhir",
  ];
  const body = data.siswa.map((s, indeks) => [
    String(indeks + 1),
    s.nama_lengkap,
    s.nis,
    ...s.komponen.map((k) => angka(k.rata)),
    s.kehadiran.persen === null ? "-" : `${angka(s.kehadiran.persen)}%`,
    s.nilai_akhir === null ? "-" : String(s.nilai_akhir),
  ]);
  const kolomAngka = Object.fromEntries(
    Array.from({ length: data.jenis.length + 2 }, (_, i) => [
      i + 3,
      { halign: "right" as const },
    ]),
  );
  autoTable(doc, {
    head: [head],
    body,
    startY: 30,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    columnStyles: { 0: { halign: "right" }, ...kolomAngka },
    margin: { left: 14, right: 14 },
  });

  const catatan = [
    ...data.catatan.map(
      (c) => `${c}. Bobotnya dibagi ke komponen lain untuk mapel ini.`,
    ),
    ...(data.nilai_kosong > 0
      ? [`${data.nilai_kosong} nilai belum diisi dan dihitung 0.`]
      : []),
    ...data.siswa
      .filter((s) => s.kehadiran.bolos.length > 0)
      .map(
        (s) =>
          `${s.nama_lengkap}: ${s.kehadiran.bolos
            .map(
              (b) =>
                `bolos ${b.mapel.join(", ")} (${tanggalPendek(b.tanggal)})`,
            )
            .join("; ")}`,
      ),
  ];
  const akhirTabel =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 30;
  let y = akhirTabel + 6;
  doc.setFontSize(8);
  const tinggi = doc.internal.pageSize.getHeight();
  for (const baris of catatan) {
    for (const potongan of doc.splitTextToSize(baris, lebar - 28) as string[]) {
      if (y > tinggi - 10) {
        doc.addPage();
        y = 15;
      }
      doc.text(potongan, 14, y);
      y += 4;
    }
  }
  return doc.output("arraybuffer");
}
