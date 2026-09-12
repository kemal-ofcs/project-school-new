import { redirect } from "next/navigation";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { ambilSesiWali } from "@/lib/server/wali-session";
import { bacaKehadiran, RENTANG_BAWAAN_HARI } from "@/lib/services/wali-data";
import { PesanGagal } from "../PesanGagal";

export default async function HalamanKehadiran() {
  const sesi = await ambilSesiWali();
  if (!sesi) redirect("/wali");

  let baris: Awaited<ReturnType<typeof bacaKehadiran>>;
  try {
    // `idSiswa` datang dari SESI, tidak pernah dari permintaan. Tidak ada satu
    // pun halaman portal yang menerimanya sebagai parameter.
    baris = await bacaKehadiran(await getReadyPublicDatabase(), sesi.idSiswa);
  } catch (error) {
    console.error("[web-public] gagal membaca kehadiran:", error);
    return <PesanGagal konteks="Riwayat kehadiran" />;
  }

  return (
    <main>
      <h1 className="font-semibold text-xl">Kehadiran Gerbang</h1>
      <p className="mt-1 text-sm text-teks-lembut">
        {RENTANG_BAWAAN_HARI} hari terakhir
      </p>

      {baris.length === 0 ? (
        <p className="mt-6 rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut">
          Belum ada catatan kehadiran pada rentang ini.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-teks-lembut text-xs uppercase">
              <tr>
                <th className="py-2">Tanggal</th>
                <th className="py-2">Masuk</th>
                <th className="py-2">Pulang</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((hari) => (
                <tr className="border-garis border-t" key={hari.tanggal}>
                  <td className="py-2">{hari.tanggal}</td>
                  <td className="py-2 font-mono">{hari.jamMasuk ?? "—"}</td>
                  <td className="py-2 font-mono">{hari.jamPulang ?? "—"}</td>
                  <td className="py-2">
                    {hari.status}
                    {hari.menitTerlambat > 0 ? (
                      <span className="ml-2 text-teks-lembut text-xs">
                        terlambat {hari.menitTerlambat} menit
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
