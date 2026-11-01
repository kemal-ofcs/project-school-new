"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  halamanKontenCms,
  kontenUntukSalinan,
  TAB_KONTEN_CMS,
} from "@/lib/constants/landing-cms-fields";
import { getDaftarUnit } from "@/lib/gateways/academic";
import {
  ambilKontenHalaman,
  simpanKontenHalaman,
} from "@/lib/gateways/content";

interface Unit {
  id: string;
  nama: string;
}

async function adaIsiUnit(idUnit: string): Promise<boolean> {
  // ponytail: empat permintaan per unit; cukup untuk puluhan unit di layar admin.
  const isi = await Promise.all(
    TAB_KONTEN_CMS.map((tab) =>
      ambilKontenHalaman(halamanKontenCms(idUnit, tab)),
    ),
  );
  return isi.some((halaman) =>
    Object.values(halaman.items ?? {}).some((nilai) =>
      String(nilai ?? "").trim(),
    ),
  );
}

/**
 * Pemilih isi yang sedang disunting di Konten Halaman Publik: Umum, atau satu
 * unit aktif dari menu Akademik. Tanda centang muncul setelah unit punya isi.
 *
 * Gagal membaca daftar unit tidak menutup CMS: Umum tetap bisa disunting.
 */
export function PemilihUnitKonten({
  idUnit,
  onPilih,
  adaPerubahan,
  versi,
  onDisalin,
  disabled = false,
}: {
  idUnit: string;
  onPilih: (idUnit: string) => void;
  /** Ada isian yang belum disimpan: pindah harus dikonfirmasi lebih dulu. */
  adaPerubahan: boolean;
  /** Naik setiap kali isi tersimpan, supaya tanda centang unit aktif segar. */
  versi: number;
  onDisalin: () => void;
  disabled?: boolean;
}) {
  const [unit, setUnit] = useState<Unit[]>([]);
  const [terisi, setTerisi] = useState<Record<string, boolean>>({});
  const [galatDaftar, setGalatDaftar] = useState<string | null>(null);
  const [galatSalin, setGalatSalin] = useState<string | null>(null);
  const [tujuan, setTujuan] = useState<string | null>(null);
  const [menyalin, setMenyalin] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const daftar = (await getDaftarUnit())
          .filter((u) => Number(u.status_aktif ?? 1) === 1)
          .map((u) => ({
            id: String(u.id_unit ?? ""),
            nama: String(u.nama_unit ?? "").trim(),
          }))
          .filter((u) => u.id);
        const status = await Promise.all(daftar.map((u) => adaIsiUnit(u.id)));
        if (batal) return;
        setUnit(daftar);
        setTerisi(
          Object.fromEntries(daftar.map((u, i) => [u.id, Boolean(status[i])])),
        );
      } catch (err) {
        if (!batal) setGalatDaftar(err instanceof Error ? err.message : "");
      }
    })();
    return () => {
      batal = true;
    };
  }, []);

  // `versi` dipakai sebagai pemicu: isinya baru berubah setelah simpan.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lihat komentar di atas
  useEffect(() => {
    if (!idUnit || versi === 0) return;
    let batal = false;
    adaIsiUnit(idUnit)
      .then((ada) => {
        if (!batal) setTerisi((lama) => ({ ...lama, [idUnit]: ada }));
      })
      .catch(() => {
        // Tanda centang saja yang tertinggal; isinya sudah tersimpan.
      });
    return () => {
      batal = true;
    };
  }, [versi]);

  const pilih = (id: string) => {
    if (id === idUnit) return;
    if (adaPerubahan) {
      setTujuan(id);
      return;
    }
    setTujuan(null);
    setGalatSalin(null);
    onPilih(id);
  };

  const salinDariUmum = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyalin(true);
    setGalatSalin(null);
    try {
      const umum = await Promise.all(
        TAB_KONTEN_CMS.map((tab) =>
          ambilKontenHalaman(halamanKontenCms("", tab)),
        ),
      );
      // ponytail: per tab, tidak atomik; gagal di tengah cukup diulang karena
      // tombol tetap ada dan salinannya menimpa kunci yang sama.
      for (const [i, tab] of TAB_KONTEN_CMS.entries()) {
        const salinan = kontenUntukSalinan(umum[i]?.items ?? {});
        if (Object.keys(salinan).length > 0) {
          await simpanKontenHalaman(halamanKontenCms(idUnit, tab), salinan);
        }
      }
      setTerisi((lama) => ({ ...lama, [idUnit]: true }));
      onDisalin();
    } catch (err) {
      setGalatSalin(
        err instanceof Error ? err.message : "Gagal menyalin isi Umum.",
      );
    } finally {
      isSubmittingRef.current = false;
      setMenyalin(false);
    }
  };

  const pilihan = [{ id: "", nama: "Umum" }, ...unit];
  const namaAktif = pilihan.find((u) => u.id === idUnit)?.nama ?? "";
  const namaTujuan = pilihan.find((u) => u.id === tujuan)?.nama ?? "";

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-xs font-bold text-slate-300">
        Pilih isi yang akan disunting
      </p>
      <div className="flex flex-wrap gap-2">
        {pilihan.map((u) => (
          <button
            aria-pressed={u.id === idUnit}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold transition ${
              u.id === idUnit
                ? "bg-sky-500 text-slate-950 shadow-md"
                : "bg-slate-800 text-slate-300 hover:text-white"
            }`}
            key={u.id || "umum"}
            onClick={() => pilih(u.id)}
            type="button"
          >
            {u.nama}
            {terisi[u.id] ? (
              <>
                <Icon name="check" className="size-3.5" />
                <span className="sr-only">(sudah diisi)</span>
              </>
            ) : null}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">
        {idUnit
          ? `Isi ini tampil di halaman ${namaAktif}. Kolom yang kosong tidak ditampilkan.`
          : "Isi ini tampil di halaman depan dan halaman umum situs."}
      </p>

      {galatDaftar !== null ? (
        <p role="alert" className="text-xs text-rose-400">
          Daftar unit tidak bisa dibaca{galatDaftar ? `: ${galatDaftar}` : "."}
        </p>
      ) : null}

      {tujuan !== null ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"
        >
          <p>
            Isian {namaAktif} belum disimpan. Simpan dulu lewat tombol di bawah
            formulir, atau buang isiannya untuk pindah ke {namaTujuan}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="min-h-10 rounded-xl bg-slate-800 px-4 text-xs font-bold text-white hover:bg-slate-700"
              onClick={() => setTujuan(null)}
              type="button"
            >
              Tetap di {namaAktif}
            </button>
            <button
              className="min-h-10 rounded-xl border border-rose-500/30 px-4 text-xs font-bold text-rose-300 hover:bg-rose-500/10"
              onClick={() => {
                onPilih(tujuan);
                setTujuan(null);
              }}
              type="button"
            >
              Buang isian dan pindah
            </button>
          </div>
        </div>
      ) : null}

      {idUnit && !terisi[idUnit] && !disabled ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="min-w-0 flex-1 text-xs text-slate-300">
            {namaAktif} masih kosong. Salin isi Umum sebagai titik awal, lalu
            sunting yang berbeda.
          </p>
          <button
            className="min-h-10 rounded-xl bg-slate-800 px-4 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
            disabled={menyalin}
            onClick={() => void salinDariUmum()}
            type="button"
          >
            {menyalin ? "Menyalin..." : "Salin dari Umum"}
          </button>
        </div>
      ) : null}

      {galatSalin ? (
        <p role="alert" className="text-xs text-rose-400">
          {galatSalin}
        </p>
      ) : null}
    </div>
  );
}
