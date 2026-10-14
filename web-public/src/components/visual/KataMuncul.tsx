import { type CSSProperties, Fragment } from "react";

/**
 * Judul yang dipecah per kata supaya bisa muncul berurutan di desktop.
 *
 * Pemecahannya terjadi saat render, bukan dengan mengubah DOM sesudahnya, jadi
 * React tidak pernah kehilangan jejak teksnya. Di HP (tanpa `html[data-efek]`)
 * span-nya teks biasa tanpa gaya apa pun. `langsung`: beranimasi saat halaman
 * dibuka (judul di layar pertama); tanpa itu, saat judul digulir masuk layar.
 */
export function KataMuncul({
  teks,
  langsung = false,
}: {
  teks: string;
  langsung?: boolean;
}) {
  const kata = teks.split(/\s+/).filter(Boolean);
  return (
    <span className={langsung ? "kata-langsung" : "kata-gulir"}>
      {kata.map((k, i) => (
        // Urutan kata adalah identitasnya; kata yang sama boleh berulang.
        // Spasi di luar span: spasi di ujung isi `inline-block` dipangkas.
        // biome-ignore lint/suspicious/noArrayIndexKey: posisi kata stabil
        <Fragment key={i}>
          <span className="kata" style={{ "--i": i } as CSSProperties}>
            {k}
          </span>
          {i < kata.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}
