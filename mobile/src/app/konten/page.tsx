"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  type ArticleDraft,
  type ArticleItem,
  type ArticleStatus,
  ambilDetailArtikel,
  ambilKontenHalaman,
  daftarArtikel,
  hapusArtikel,
  type PageContentMap,
  simpanArtikel,
  simpanKontenHalaman,
} from "@/lib/gateways/content";
import { useHydrated } from "@/lib/hooks/useHydrated";

export default function KontenMobilePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const isHydrated = useHydrated();

  // Penjaga klik ganda mutasi (Audit UI Guard)
  const isSubmittingRef = useRef(false);

  const [activeTab, setActiveTab] = useState<"berita" | "halaman">("berita");
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  // Guard hak akses di mobile
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (isHydrated && isAuthenticated && !canAccessArea(user, "konten")) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, isHydrated, user, router]);

  const canManage = hasPermission(user, "content.manage");
  const canDelete = hasPermission(user, "content.delete");

  // State Berita
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [articleFormOpen, setArticleFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [judul, setJudul] = useState("");
  const [ringkasan, setRingkasan] = useState("");
  const [isi, setIsi] = useState("");
  const [status, setStatus] = useState<ArticleStatus>("Draft");
  const [isPending, startTransition] = useTransition();

  // State Halaman
  const [halamanTab, setHalamanTab] = useState<
    "profil" | "kontak" | "program" | "landing"
  >("profil");
  const [contentMap, setContentMap] = useState<PageContentMap>({});
  const [loadingHalaman, setLoadingHalaman] = useState(false);

  const muatBerita = useCallback(async () => {
    setLoadingArticles(true);
    setGalat(null);
    try {
      const res = await daftarArtikel({ limit: 50 });
      setArticles(res.items);
    } catch (err) {
      setGalat(
        err instanceof Error
          ? `${err.message} — CMS membaca langsung dari cloud dan memerlukan jaringan.`
          : "Gagal memuat artikel berita.",
      );
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  const muatHalaman = useCallback(async (hal: string) => {
    setLoadingHalaman(true);
    setGalat(null);
    try {
      const res = await ambilKontenHalaman(hal);
      setContentMap(res.items || {});
    } catch (err) {
      setGalat(
        err instanceof Error
          ? `${err.message} — CMS membaca langsung dari cloud dan memerlukan jaringan.`
          : "Gagal memuat konten halaman.",
      );
    } finally {
      setLoadingHalaman(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated && canAccessArea(user, "konten")) {
      if (activeTab === "berita") {
        void muatBerita();
      } else {
        void muatHalaman(halamanTab);
      }
    }
  }, [
    authLoading,
    isAuthenticated,
    user,
    activeTab,
    halamanTab,
    muatBerita,
    muatHalaman,
  ]);

  const handleSimpanArtikel = () => {
    if (isSubmittingRef.current) return;
    if (!judul.trim() || !isi.trim()) {
      setGalat("Judul dan isi artikel wajib diisi.");
      return;
    }
    isSubmittingRef.current = true;
    setGalat(null);
    startTransition(async () => {
      try {
        const draft: ArticleDraft = {
          idBerita: editingId || undefined,
          judul: judul.trim(),
          ringkasan: ringkasan.trim(),
          isi: isi.trim(),
          status,
          penulis: user?.nama_operator || "Operator Mobile",
        };
        await simpanArtikel(draft);
        triggerHaptic("success");
        setKabar("Artikel berita berhasil disimpan.");
        setArticleFormOpen(false);
        setEditingId(null);
        setJudul("");
        setRingkasan("");
        setIsi("");
        void muatBerita();
      } catch (err) {
        triggerHaptic("error");
        setGalat(
          err instanceof Error ? err.message : "Gagal menyimpan artikel.",
        );
      } finally {
        isSubmittingRef.current = false;
      }
    });
  };

  const handleEditArtikel = async (item: ArticleItem) => {
    try {
      const res = await ambilDetailArtikel(item.id_berita);
      const art = res.article;
      setEditingId(art.id_berita);
      setJudul(art.judul);
      setRingkasan(art.ringkasan);
      setIsi(art.isi);
      setStatus(art.status);
      setArticleFormOpen(true);
    } catch (err) {
      setGalat(
        err instanceof Error ? err.message : "Gagal memuat detail artikel.",
      );
    }
  };

  const handleHapusArtikel = async (idBerita: string) => {
    if (isSubmittingRef.current) return;
    if (!window.confirm("Hapus artikel ini secara permanen?")) return;
    isSubmittingRef.current = true;
    try {
      await hapusArtikel(idBerita);
      triggerHaptic("warning");
      setKabar("Artikel berhasil dihapus.");
      void muatBerita();
    } catch (err) {
      triggerHaptic("error");
      setGalat(err instanceof Error ? err.message : "Gagal menghapus artikel.");
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleSimpanHalaman = () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat(null);
    startTransition(async () => {
      try {
        await simpanKontenHalaman(halamanTab, contentMap);
        triggerHaptic("success");
        setKabar("Konten halaman berhasil diperbarui.");
      } catch (err) {
        triggerHaptic("error");
        setGalat(
          err instanceof Error
            ? err.message
            : "Gagal menyimpan konten halaman.",
        );
      } finally {
        isSubmittingRef.current = false;
      }
    });
  };

  return (
    <MobileAppShell>
      <div className="space-y-4 p-4 pb-20">
        {/* Header Title */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">Situs Publik (CMS)</h1>
        </div>

        {/* Pesan status */}
        {galat ? (
          <FeedbackBanner
            type="error"
            message={galat}
            onClose={() => setGalat(null)}
          />
        ) : null}
        {kabar ? (
          <FeedbackBanner
            type="success"
            message={kabar}
            onClose={() => setKabar(null)}
          />
        ) : null}

        {/* Tab switcher utama */}
        <div className="flex rounded-2xl bg-slate-850 p-1 border border-white/10">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setActiveTab("berita");
            }}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "berita"
                ? "bg-sky-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Berita & Artikel
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setActiveTab("halaman");
            }}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "halaman"
                ? "bg-sky-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Halaman Publik
          </button>
        </div>

        {/* Konten Tab Berita */}
        {activeTab === "berita" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Daftar Berita</h2>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    setEditingId(null);
                    setJudul("");
                    setRingkasan("");
                    setIsi("");
                    setStatus("Draft");
                    setArticleFormOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-md"
                >
                  <Icon name="plus" className="size-3.5" />
                  <span>Tulis Berita</span>
                </button>
              )}
            </div>

            {loadingArticles ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Memuat daftar berita...
              </p>
            ) : articles.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Belum ada artikel berita.
              </p>
            ) : (
              <div className="space-y-2.5">
                {articles.map((item) => (
                  <div
                    key={item.id_berita}
                    className="rounded-2xl border border-white/10 bg-slate-900 p-3.5 shadow-sm space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white line-clamp-1">
                          {item.judul}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                          {item.ringkasan || "Tidak ada ringkasan."}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.status === "Terbit"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-slate-400">
                      <span>{item.penulis || "Admin"}</span>
                      <div className="flex items-center gap-2">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleEditArtikel(item)}
                            className="text-sky-400 font-semibold"
                          >
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleHapusArtikel(item.id_berita)}
                            className="text-rose-400 font-semibold"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Konten Tab Halaman Publik */
          <div className="space-y-4">
            <div className="flex overflow-x-auto gap-1.5 pb-1">
              {(
                [
                  { id: "profil", label: "Profil" },
                  { id: "kontak", label: "Kontak" },
                  { id: "program", label: "Program" },
                  { id: "landing", label: "Landing" },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    setHalamanTab(sub.id);
                  }}
                  className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    halamanTab === sub.id
                      ? "bg-white/15 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {loadingHalaman ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Memuat data...
              </p>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 space-y-3">
                {Object.keys(contentMap).length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Belum ada data khusus untuk bagian ini.
                  </p>
                ) : (
                  Object.entries(contentMap).map(([kunci, isi]) => (
                    <div key={kunci}>
                      <label
                        htmlFor={`input-hal-${kunci}`}
                        className="block text-[11px] font-bold text-slate-300 mb-1"
                      >
                        {kunci}
                      </label>
                      <textarea
                        id={`input-hal-${kunci}`}
                        aria-label={`Konten untuk ${kunci}`}
                        rows={2}
                        value={isi}
                        onChange={(e) =>
                          setContentMap((prev) => ({
                            ...prev,
                            [kunci]: e.target.value,
                          }))
                        }
                        disabled={!canManage}
                        className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                      />
                    </div>
                  ))
                )}

                {canManage && (
                  <button
                    type="button"
                    onClick={handleSimpanHalaman}
                    disabled={isPending}
                    className="w-full rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-slate-950 shadow-md mt-2"
                  >
                    {isPending ? "Menyimpan..." : "Simpan Perubahan Bagian Ini"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Form Artikel Mobile */}
        <Modal
          isOpen={articleFormOpen}
          onClose={() => setArticleFormOpen(false)}
          title={editingId ? "Edit Berita" : "Tulis Berita Baru"}
          hideFooter
        >
          <div className="space-y-3 text-xs">
            <div>
              <label
                htmlFor="input-mob-judul"
                className="block font-bold text-slate-300 mb-1"
              >
                Judul Artikel *
              </label>
              <input
                id="input-mob-judul"
                aria-label="Judul artikel"
                type="text"
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                placeholder="Judul artikel..."
                className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-white focus:border-sky-400 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="input-mob-ringkasan"
                className="block font-bold text-slate-300 mb-1"
              >
                Ringkasan Singkat
              </label>
              <textarea
                id="input-mob-ringkasan"
                aria-label="Ringkasan singkat artikel"
                rows={2}
                value={ringkasan}
                onChange={(e) => setRingkasan(e.target.value)}
                placeholder="Ringkasan..."
                className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-white focus:border-sky-400 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="input-mob-isi"
                className="block font-bold text-slate-300 mb-1"
              >
                Isi Konten *
              </label>
              <textarea
                id="input-mob-isi"
                aria-label="Isi lengkap artikel"
                rows={6}
                value={isi}
                onChange={(e) => setIsi(e.target.value)}
                placeholder="Isi lengkap artikel..."
                className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-white focus:border-sky-400 focus:outline-none font-sans"
              />
            </div>

            <div>
              <label
                htmlFor="select-mob-status"
                className="block font-bold text-slate-300 mb-1"
              >
                Status Publikasi
              </label>
              <select
                id="select-mob-status"
                aria-label="Status publikasi artikel"
                value={status}
                onChange={(e) => setStatus(e.target.value as ArticleStatus)}
                className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-white focus:border-sky-400 focus:outline-none"
              >
                <option value="Draft" className="bg-slate-900 text-white">
                  Draft
                </option>
                <option value="Terbit" className="bg-slate-900 text-white">
                  Terbit (Tampil di Situs)
                </option>
              </select>
            </div>

            <div className="flex gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setArticleFormOpen(false)}
                className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSimpanArtikel}
                disabled={isPending}
                className="flex-1 rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50"
              >
                {isPending ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </MobileAppShell>
  );
}
