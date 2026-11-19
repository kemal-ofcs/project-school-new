"use client";

/**
 * Daftar centang rombel, dikelompokkan per tingkat, dengan tombol pilih
 * seluruh tingkat. Dipakai penugasan guru dan grid jadwal untuk kelas paralel.
 */
export interface PilihRombelBanyakProps {
  rombelList: Record<string, unknown>[];
  terpilih: ReadonlySet<string>;
  onChange: (terpilih: Set<string>) => void;
  /** Rombel yang sudah menjadi sasaran utama; tidak ditampilkan. */
  kecuali?: string;
}

export function PilihRombelBanyak({
  rombelList,
  terpilih,
  onChange,
  kecuali,
}: PilihRombelBanyakProps) {
  const perTingkat = new Map<string, Record<string, unknown>[]>();
  for (const rom of rombelList) {
    if (String(rom.id_rombel) === kecuali) continue;
    const tingkat = String(rom.tingkat ?? "");
    perTingkat.set(tingkat, [...(perTingkat.get(tingkat) ?? []), rom]);
  }
  const kelompok = [...perTingkat].sort(([a], [b]) =>
    a.localeCompare(b, "id", { numeric: true }),
  );

  if (kelompok.length === 0) {
    return <p className="text-xs text-slate-500">Tidak ada rombel lain.</p>;
  }

  const ubah = (ids: string[], pilih: boolean) => {
    const next = new Set(terpilih);
    for (const id of ids) {
      if (pilih) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {kelompok.map(([tingkat, daftar]) => {
        const ids = daftar.map((rom) => String(rom.id_rombel));
        const semua = ids.every((id) => terpilih.has(id));
        return (
          <fieldset key={tingkat} className="flex flex-col gap-1.5">
            <legend className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-slate-300">
              Kelas {tingkat}
              <button
                type="button"
                onClick={() => ubah(ids, !semua)}
                className="rounded-md px-2 py-0.5 text-[11px] text-sky-400 hover:bg-sky-500/10"
              >
                {semua ? "Lepas semua" : "Pilih semua"}
              </button>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {daftar.map((rom) => {
                const id = String(rom.id_rombel);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs text-slate-200 ${
                      terpilih.has(id)
                        ? "border-sky-400 bg-sky-500/15"
                        : "border-white/10 bg-slate-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={terpilih.has(id)}
                      onChange={(event) => ubah([id], event.target.checked)}
                      className="accent-sky-500"
                    />
                    {String(rom.nama_rombel)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
