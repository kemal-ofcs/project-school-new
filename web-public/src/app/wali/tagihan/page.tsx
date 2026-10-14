import { getReadyPublicDatabase } from "@/lib/server/db";
import { wajibSesiWaliSiap } from "@/lib/server/wali-session";
import {
  bacaTagihanAnak,
  labelPeriode,
  portalTagihanAktif,
  RIWAYAT_KUITANSI_BULAN,
  rupiah,
  type TagihanAnak,
  tanggalTampil,
} from "@/lib/services/wali-tagihan";
import { PesanGagal } from "../PesanGagal";

/**
 * Tunggakan, saldo titipan, dan riwayat kuitansi anak (Fase K4c). Sama seperti
 * halaman Nilai, tiga keadaan dibedakan: belum dibuka sekolah, kosong, dan
 * gagal dibaca. Tanpa PDF: kuitansi resmi tetap dari bagian keuangan sekolah.
 */
export default async function HalamanTagihan() {
  const sesi = await wajibSesiWaliSiap();

  let aktif = false;
  let data: TagihanAnak | null = null;
  try {
    const client = await getReadyPublicDatabase();
    aktif = await portalTagihanAktif(client);
    // `idSiswa` dari SESI, tidak pernah dari permintaan.
    if (aktif) data = await bacaTagihanAnak(client, sesi.idSiswa);
  } catch (error) {
    console.error("[web-public] gagal membaca tagihan anak:", error);
    return <PesanGagal konteks="Informasi tagihan" />;
  }

  if (!aktif || !data) {
    return (
      <main>
        <h1 className="font-semibold text-xl">Tagihan</h1>
        <div className="mt-6 rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut leading-relaxed">
          Informasi tagihan belum dibuka sekolah di portal ini. Untuk keterangan
          tagihan, hubungi bagian keuangan sekolah.
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-10">
      <section>
        <h1 className="font-semibold text-xl">Tagihan</h1>
        <p className="mt-1 text-sm text-teks-lembut">
          Pembayaran yang baru dicatat di sekolah bisa butuh beberapa saat
          sebelum tampil di sini.
        </p>
        {data.tunggakan.length === 0 ? (
          <p className="mt-6 rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut">
            Tidak ada tagihan yang belum lunas.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-teks-lembut">
              {data.tunggakan.length} tagihan belum lunas, total{" "}
              <span className="font-semibold text-teks">
                {rupiah(data.totalTunggakan)}
              </span>
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-teks-lembut text-xs uppercase">
                  <tr>
                    <th className="py-2">Tagihan</th>
                    <th className="py-2">Jatuh tempo</th>
                    <th className="py-2 text-right">Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tunggakan.map((item, indeks) => (
                    <tr
                      className="border-garis border-t"
                      key={`${item.namaTagihan}-${item.periode}-${indeks}`}
                    >
                      <td className="py-2">
                        {[item.namaTagihan, labelPeriode(item.periode)]
                          .filter(Boolean)
                          .join(" ")}
                      </td>
                      <td className="py-2">
                        {item.jatuhTempo ? tanggalTampil(item.jatuhTempo) : "-"}
                        {item.terlambat ? (
                          <span className="ml-2 text-teks-lembut text-xs">
                            lewat jatuh tempo
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {rupiah(item.sisa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {data.saldoTitipan > 0 ? (
          <p className="mt-4 text-sm text-teks-lembut">
            Saldo titipan di sekolah:{" "}
            <span className="font-semibold text-teks">
              {rupiah(data.saldoTitipan)}
            </span>
            . Titipan dipakai untuk membayar tagihan atas permintaan Anda ke
            bagian keuangan.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="font-semibold text-base">Riwayat pembayaran</h2>
        <p className="mt-1 text-sm text-teks-lembut">
          {RIWAYAT_KUITANSI_BULAN} bulan terakhir
        </p>
        {data.kuitansi.length === 0 ? (
          <p className="mt-4 rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut">
            Belum ada pembayaran pada rentang ini.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-teks-lembut text-xs uppercase">
                <tr>
                  <th className="py-2">Tanggal</th>
                  <th className="py-2">Nomor kuitansi</th>
                  <th className="py-2">Cara bayar</th>
                  <th className="py-2 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {data.kuitansi.map((item, indeks) => (
                  <tr
                    className={`border-garis border-t ${
                      item.dibatalkan ? "text-teks-lembut" : ""
                    }`}
                    key={`${item.nomor}-${item.tanggal}-${indeks}`}
                  >
                    <td className="py-2">{tanggalTampil(item.tanggal)}</td>
                    <td className="py-2 font-mono text-xs">{item.nomor}</td>
                    <td className="py-2">
                      {item.metode === "Titipan" ? "Dari titipan" : item.metode}
                      {item.dibatalkan ? (
                        <span className="ml-2 text-xs">dibatalkan</span>
                      ) : null}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        item.dibatalkan ? "line-through" : ""
                      }`}
                    >
                      {rupiah(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
