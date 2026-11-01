"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { hasPermission } from "@/lib/auth/access";
import {
  halamanKontenUnit,
  KOLOM_HALAMAN_UNIT,
} from "@/lib/constants/landing-cms-fields";
import { useAuth } from "@/lib/context/AuthContext";
import { getDaftarUnit } from "@/lib/gateways/academic";
import {
  ambilKontenHalaman,
  type PageContentMap,
  simpanKontenHalaman,
} from "@/lib/gateways/content";
import { GambarKontenInput } from "./GambarKontenInput";

interface Unit {
  id: string;
  nama: string;
}

const KELAS_ISIAN =
  "w-full rounded-xl border border-white/10 bg-slate-800/90 px-4 py-2.5 text-sm text-white focus:border-sky-400 focus:outline-none disabled:opacity-60";

function adaIsi(isi: PageContentMap | undefined): boolean {
  return Object.values(isi ?? {}).some((nilai) => String(nilai ?? "").trim());
}

/**
 * Isi halaman per unit di situs publik: pilih unit, isi, simpan, lalu lanjut ke
 * unit berikutnya. Daftar unit mengikuti unit aktif di menu Akademik, dan tanda
 * centang muncul setelah ada isian unit itu yang tersimpan.
 */
export function HalamanUnitEditor() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "content.manage");

  const [unit, setUnit] = useState<Unit[]>([]);
  const [tersimpan, setTersimpan] = useState<Record<string, PageContentMap>>(
    {},
  );
  const [idAktif, setIdAktif] = useState("");
  const [draf, setDraf] = useState<PageContentMap>({});
  const [tujuanPindah, setTujuanPindah] = useState<string | null>(null);
  const [status, setStatus] = useState<"memuat" | "siap" | "gagal">("memuat");
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
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
        // ponytail: satu permintaan per unit; cukup untuk puluhan unit.
        const isi = await Promise.all(
          daftar.map((u) => ambilKontenHalaman(halamanKontenUnit(u.id))),
        );
        if (batal) return;
        setUnit(daftar);
        setTersimpan(
          Object.fromEntries(daftar.map((u, i) => [u.id, isi[i]?.items ?? {}])),
        );
        if (daftar[0]) {
          setIdAktif(daftar[0].id);
          setDraf(isi[0]?.items ?? {});
        }
        setStatus("siap");
      } catch (err) {
        if (batal) return;
        setGalat(err instanceof Error ? err.message : null);
        setStatus("gagal");
      }
    })();
    return () => {
      batal = true;
    };
  }, []);

  const adaPerubahan = KOLOM_HALAMAN_UNIT.some(
    ({ key }) =>
      String(draf[key] ?? "").trim() !==
      String(tersimpan[idAktif]?.[key] ?? "").trim(),
  );

  const bukaUnit = (id: string) => {
    setIdAktif(id);
    setDraf(tersimpan[id] ?? {});
    setTujuanPindah(null);
    setGalat(null);
    setKabar(null);
  };

  const pilihUnit = (id: string) => {
    if (id === idAktif) return;
    if (adaPerubahan) setTujuanPindah(id);
    else bukaUnit(id);
  };

  const simpan = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    setKabar(null);
    const isi = Object.fromEntries(
      KOLOM_HALAMAN_UNIT.map(({ key }) => [
        key,
        String(draf[key] ?? "").trim(),
      ]),
    );
    try {
      await simpanKontenHalaman(halamanKontenUnit(idAktif), isi);
      setTersimpan((lama) => ({ ...lama, [idAktif]: isi }));
      setDraf(isi);
      setTujuanPindah(null);
      setKabar("Isi unit tersimpan.");
    } catch (err) {
      setGalat(
        err instanceof Error ? err.message : "Gagal menyimpan isi unit.",
      );
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  if (status === "memuat") {
    return (
      <p className="py-12 text-center text-sm text-slate-400">
        Memuat daftar unit...
      </p>
    );
  }
  if (status === "gagal") {
    return (
      <p
        role="alert"
        className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"
      >
        Daftar unit tidak bisa dibaca{galat ? `: ${galat}` : "."}
      </p>
    );
  }
  if (unit.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">
        Belum ada unit aktif. Tambahkan lewat menu Akademik, tab Unit.
      </p>
    );
  }

  const namaAktif = unit.find((u) => u.id === idAktif)?.nama ?? "";
  const namaTujuan = unit.find((u) => u.id === tujuanPindah)?.nama ?? "";

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {unit.map((u) => (
          <button
            aria-pressed={u.id === idAktif}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold transition ${
              u.id === idAktif
                ? "bg-sky-500 text-slate-950 shadow-md"
                : "bg-slate-800 text-slate-300 hover:text-white"
            }`}
            key={u.id}
            onClick={() => pilihUnit(u.id)}
            type="button"
          >
            {u.nama}
            {adaIsi(tersimpan[u.id]) ? (
              <>
                <Icon name="check" className="size-3.5" />
                <span className="sr-only">(sudah diisi)</span>
              </>
            ) : null}
          </button>
        ))}
      </div>

      {tujuanPindah ? (
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
              onClick={() => setTujuanPindah(null)}
              type="button"
            >
              Tetap di {namaAktif}
            </button>
            <button
              className="min-h-10 rounded-xl border border-rose-500/30 px-4 text-xs font-bold text-rose-300 hover:bg-rose-500/10"
              onClick={() => bukaUnit(tujuanPindah)}
              type="button"
            >
              Buang isian dan pindah
            </button>
          </div>
        </div>
      ) : null}

      {galat ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"
        >
          {galat}
        </p>
      ) : null}
      {kabar ? (
        <output className="block rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {kabar}
        </output>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-xl sm:p-8">
        <h3 className="border-b border-white/10 pb-4 text-lg font-bold text-white">
          Halaman {namaAktif}
        </h3>
        <div className="mt-5 space-y-5">
          {KOLOM_HALAMAN_UNIT.map((kolom) => {
            const inputId = `unit-${kolom.key}`;
            const nilai = draf[kolom.key] ?? "";
            const ubah = (baru: string) => {
              setDraf((lama) => ({ ...lama, [kolom.key]: baru }));
              setKabar(null);
            };
            if (kolom.type === "image") {
              return (
                <GambarKontenInput
                  disabled={!canManage}
                  inputId={inputId}
                  key={`${idAktif}-${kolom.key}`}
                  label={kolom.label}
                  onChange={ubah}
                  value={nilai}
                />
              );
            }
            return (
              <div key={kolom.key}>
                <label
                  className="mb-1.5 block text-xs font-bold text-slate-300"
                  htmlFor={inputId}
                >
                  {kolom.label}
                </label>
                {kolom.description ? (
                  <p className="mb-2 text-[11px] font-medium text-sky-400/90">
                    {kolom.description}
                  </p>
                ) : null}
                {kolom.type === "textarea" ? (
                  <textarea
                    className={KELAS_ISIAN}
                    disabled={!canManage}
                    id={inputId}
                    onChange={(e) => ubah(e.target.value)}
                    placeholder={kolom.placeholder}
                    rows={kolom.rows ?? 3}
                    value={nilai}
                  />
                ) : (
                  <input
                    className={KELAS_ISIAN}
                    disabled={!canManage}
                    id={inputId}
                    onChange={(e) => ubah(e.target.value)}
                    placeholder={kolom.placeholder}
                    type="text"
                    value={nilai}
                  />
                )}
              </div>
            );
          })}
        </div>

        {canManage ? (
          <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
            <button
              className="rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-400 disabled:opacity-50"
              data-konfirmasi
              disabled={menyimpan}
              onClick={() => void simpan()}
              type="button"
            >
              {menyimpan ? "Menyimpan..." : `Simpan Isi ${namaAktif}`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
