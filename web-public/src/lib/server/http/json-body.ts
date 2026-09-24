/**
 * Isi JSON permintaan, dibaca paling banyak `maksByte`.
 *
 * Menggantikan `request.json().catch(() => ({}))`, yang memuat body berapa pun
 * besarnya ke memori sebelum validasi: pada server sendiri (bukan Vercel yang
 * membatasi 4,5 MB) satu permintaan ratusan MB cukup untuk menjatuhkan proses.
 * Perilaku untuk body rusak dipertahankan: `{}`, lalu validasi route yang
 * menolaknya. Body yang melewati batas diperlakukan sama, dan pembacaannya
 * dihentikan di batas itu.
 */
export async function bacaJsonBerbatas<T>(
  request: Request,
  maksByte: number,
): Promise<T> {
  const kosong = {} as T;
  if (Number(request.headers.get("content-length")) > maksByte) return kosong;
  if (!request.body) return kosong;

  const reader = request.body.getReader();
  const potongan: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maksByte) {
        await reader.cancel().catch(() => undefined);
        return kosong;
      }
      potongan.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const isi = JSON.parse(new TextDecoder().decode(Buffer.concat(potongan)));
    return isi && typeof isi === "object" ? (isi as T) : kosong;
  } catch {
    return kosong;
  }
}
