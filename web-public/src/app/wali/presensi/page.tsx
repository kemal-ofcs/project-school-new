import { redirect } from "next/navigation";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { ambilSesiWali } from "@/lib/server/wali-session";
import {
  bacaPresensiMapel,
  RENTANG_BAWAAN_HARI,
} from "@/lib/services/wali-data";
import { PesanGagal } from "../PesanGagal";

export default async function HalamanPresensiMapel() {
  const sesi = await ambilSesiWali();
  if (!sesi) redirect("/wali");

  let baris: Awaited<ReturnType<typeof bacaPresensiMapel>>;
  try {
    baris = await bacaPresensiMapel(
      await getReadyPublicDatabase(),
      sesi.idSiswa,
    );
  } catch (error) {
    console.error("[web-public] gagal membaca presensi mapel:", error);
    return <PesanGagal konteks="Presensi mata pelajaran" />;
  }

  return (
    <main>
      <h1 className="font-semibold text-xl">Presensi Mata Pelajaran</h1>
      <p className="mt-1 text-sm text-teks-lembut">
        {RENTANG_BAWAAN_HARI} hari terakhir
      </p>

      {baris.length === 0 ? (
        <p className="mt-6 rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut">
          Belum ada presensi mata pelajaran pada rentang ini.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-teks-lembut text-xs uppercase">
              <tr>
                <th className="py-2">Tanggal</th>
                <th className="py-2">Jam</th>
                <th className="py-2">Mata pelajaran</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((item, urutan) => (
                <tr
                  className="border-garis border-t"
                  key={`${item.tanggal}-${item.jamKe}-${urutan}`}
                >
                  <td className="py-2">{item.tanggal}</td>
                  <td className="py-2">{item.jamKe}</td>
                  <td className="py-2">{item.namaMapel}</td>
                  <td className="py-2">
                    {item.status}
                    {item.catatan ? (
                      <span className="ml-2 text-teks-lembut text-xs">
                        {item.catatan}
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
