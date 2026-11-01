import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Header dan footer berada di layout `(umum)` dan `[unit]`, sehingga alamat yang
 * tidak dikenal hanya melewati layout akar. Halaman ini satu-satunya jalan
 * kembali bagi pengunjung di sana.
 */
export default function TidakDitemukan() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="font-serif text-4xl font-bold text-primary">
        Halaman tidak ditemukan
      </h1>
      <p className="max-w-md text-muted-foreground">
        Alamat ini tidak ada, atau unitnya sudah tidak aktif.
      </p>
      <Button asChild className="rounded-full">
        <Link href="/">Kembali ke halaman depan</Link>
      </Button>
    </main>
  );
}
