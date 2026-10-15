import { rupiahPmb } from "@/lib/validations/pmb-pembayaran";

/** Rekening tujuan dari CMS `landing.pmb_bayar_*`; kunci yang kosong tidak tampil. */
export interface RekeningPmb {
  bank?: string;
  nomor?: string;
  atasNama?: string;
  instruksi?: string;
}

/** `2026-10-22` → `22 Oktober 2026`, tanpa geser zona waktu. */
export function tanggalPanjang(tanggal: string): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  if (!y || !m || !d) return tanggal;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Blok pembayaran biaya pendaftaran. `keadaan` dihitung server
 * (`SQL_KEADAAN_BAYAR_PMB`), bukan jam perangkat orang tua.
 */
export function InfoBayarPmb({
  keadaan,
  biaya,
  batasBayar,
  dibayarTanggal,
  rekening,
}: {
  keadaan: string;
  biaya: number;
  batasBayar: string | null;
  dibayarTanggal?: string | null;
  rekening: RekeningPmb;
}) {
  if (keadaan === "Tanpa biaya" || biaya <= 0) return null;

  if (keadaan === "Lunas") {
    return (
      <div className="mt-5 rounded-md bg-latar-lembut p-4 text-sm">
        <p className="font-medium">Biaya pendaftaran lunas</p>
        {dibayarTanggal ? (
          <p className="mt-1 text-teks-lembut">
            Pembayaran tercatat pada {tanggalPanjang(dibayarTanggal)}.
          </p>
        ) : null}
      </div>
    );
  }

  if (keadaan === "Kedaluwarsa") {
    return (
      <div className="mt-5 rounded-md border border-garis p-4 text-sm">
        <p className="font-medium">Masa pembayaran telah berakhir</p>
        <p className="mt-1 text-teks-lembut leading-relaxed">
          Hubungi sekolah untuk meminta perpanjangan batas bayar.
        </p>
      </div>
    );
  }

  const adaRekening = Boolean(rekening.nomor);
  return (
    <div className="mt-5 rounded-md border border-garis p-4 text-sm">
      <p className="font-medium">Biaya pendaftaran</p>
      <p className="mt-1 font-semibold text-2xl">Rp{rupiahPmb(biaya)}</p>
      {batasBayar ? (
        <p className="mt-1 text-teks-lembut">
          Bayar paling lambat {tanggalPanjang(batasBayar)}.
        </p>
      ) : null}

      {adaRekening ? (
        <dl className="mt-4 space-y-1">
          {rekening.bank ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-teks-lembut">Bank:</dt>
              <dd>{rekening.bank}</dd>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-teks-lembut">Nomor rekening:</dt>
            <dd className="select-all font-mono">{rekening.nomor}</dd>
          </div>
          {rekening.atasNama ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-teks-lembut">Atas nama:</dt>
              <dd>{rekening.atasNama}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <p className="mt-4 text-teks-lembut leading-relaxed">
        {rekening.instruksi ??
          (adaRekening
            ? "Bayar di loket sekolah atau transfer ke rekening di atas. Tulis nomor pendaftaran di berita transfer, lalu tunjukkan bukti transfer kepada panitia."
            : "Bayar di loket sekolah dan tunjukkan nomor pendaftaran kepada panitia.")}
      </p>
    </div>
  );
}
