"use client";

/**
 * Sakelar on/off untuk semua halaman, Web/Desktop dan Mobile (salinan identik
 * byte lewat `mobile/scripts/sync-frontend-lib.ts`).
 *
 * Warnanya ditulis di kelas `.sakelar*` pada `globals.css`, bukan lewat utilitas
 * `bg-slate-*`/`bg-white`: utilitas itu ditimpa blok tema terang Web dan dibalik
 * variabel `--color-*` Mobile, sehingga lintasan "mati" dulu menyatu dengan
 * kartu dan kenop putih hilang di latar terang.
 */
interface SakelarProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nama aksesibel; dibacakan bersama keadaan aktif/nonaktif. */
  label: string;
  disabled?: boolean;
  id?: string;
  /** Teks "Aktif"/"Nonaktif" di samping sakelar, supaya keadaan tidak hanya terbaca dari warna. */
  tampilkanStatus?: boolean;
}

export function Sakelar({
  checked,
  onChange,
  label,
  disabled = false,
  id,
  tampilkanStatus = true,
}: SakelarProps) {
  return (
    <span className="sakelar-wrap" data-aktif={checked ? "true" : "false"}>
      {tampilkanStatus ? (
        <span aria-hidden="true" className="sakelar-status">
          {checked ? "Aktif" : "Nonaktif"}
        </span>
      ) : null}
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="sakelar"
      >
        <span aria-hidden="true" className="sakelar-kenop" />
      </button>
    </span>
  );
}
