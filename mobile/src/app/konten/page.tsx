"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CollectionRepeater } from "@/components/content/CollectionRepeater";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { optimizeImageFile } from "@/lib/client/image-optimizer";
import {
  HALAMAN_CMS,
  KOLEKSI_LANDING,
  LANDING_PAGE_SUBSECTIONS,
  muatKoleksiLanding,
  siapkanSimpanLanding,
} from "@/lib/constants/landing-cms-fields";
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
  const [slug, setSlug] = useState("");
  // WAJIB ikut dibawa saat menyimpan: `save_article` menulis `gambar_sampul = ?`
  // apa adanya, sehingga draft tanpa kunci ini mengubah sampul artikel menjadi
  // NULL — sunting judul dari ponsel dan gambar yang dipasang lewat Desktop
  // lenyap tanpa peringatan.
  const [gambarSampul, setGambarSampul] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ArticleStatus | "Semua">(
    "Semua",
  );
  const [pencarian, setPencarian] = useState("");
  const [isPending, startTransition] = useTransition();

  // State Halaman
  const [halamanTab, setHalamanTab] = useState<
    "profil" | "kontak" | "program" | "landing"
  >("profil");
  const [landingSubTab, setLandingSubTab] = useState<string>("hero_stats");
  const [contentMap, setContentMap] = useState<PageContentMap>({});
  // Item koleksi disimpan terurai; diserialisasi jadi JSON hanya saat menyimpan.
  const [koleksiItems, setKoleksiItems] = useState<
    Record<string, Record<string, unknown>[]>
  >({});
  const [loadingHalaman, setLoadingHalaman] = useState(false);

  const muatBerita = useCallback(async () => {
    setLoadingArticles(true);
    setGalat(null);
    try {
      const res = await daftarArtikel({
        status: filterStatus,
        search: pencarian.trim() || undefined,
        limit: 50,
      });
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
  }, [filterStatus, pencarian]);

  const muatHalaman = useCallback(async (hal: string) => {
    setLoadingHalaman(true);
    setGalat(null);
    try {
      const res = await ambilKontenHalaman(hal);
      const items = res.items || {};
      setContentMap(items);
      setKoleksiItems(muatKoleksiLanding(items));
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

  /**
   * Kompresi gambar sampul dilakukan lewat `optimizeImageFile`, bukan rantai
   * FileReader→Image→canvas yang ditulis sendiri: helper itu me-`reject` kedua
   * jalur gagalnya (berkas tidak terbaca, gambar tidak bisa didekode), sehingga
   * kegagalan memilih gambar tidak pernah berakhir sebagai state yang diam-diam
   * tetap null lalu tersimpan sebagai artikel tanpa sampul.
   */
  const handlePilihGambar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Dikosongkan supaya memilih berkas yang sama dua kali tetap memicu change.
    e.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setGalat("Format gambar sampul harus JPEG, PNG, atau WebP.");
      return;
    }

    try {
      const { dataUrl } = await optimizeImageFile(file, {
        maxWidth: 1200,
        maxHeight: 800,
        quality: 0.82,
        mimeType: "image/jpeg",
        fit: "contain",
      });
      // Batas yang sama dengan `save_article` di Rust dan `validasiGambarSampul`
      // di TypeScript — ditolak di sini supaya pesannya bisa menyebut solusinya.
      if (dataUrl.length > 750_000) {
        setGalat(
          "Gambar masih terlalu besar setelah dikompres (maksimal 500 KB). Pilih gambar dengan resolusi lebih rendah.",
        );
        return;
      }
      setGambarSampul(dataUrl);
      setGalat(null);
      triggerHaptic("light");
    } catch (err) {
      triggerHaptic("error");
      setGalat(
        err instanceof Error ? err.message : "Gagal memproses gambar sampul.",
      );
    }
  };

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
          slug: slug.trim() || undefined,
          ringkasan: ringkasan.trim(),
          isi: isi.trim(),
          gambarSampul,
          status,
          penulis: user?.nama_operator || "Operator Mobile",
        };
        await simpanArtikel(draft);
        triggerHaptic("success");
        setKabar("Artikel berita berhasil disimpan.");
        setArticleFormOpen(false);
        setEditingId(null);
        setJudul("");
        setSlug("");
        setRingkasan("");
        setIsi("");
        setGambarSampul(null);
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
      setSlug(art.slug);
      setRingkasan(art.ringkasan);
      setIsi(art.isi);
      setGambarSampul(art.gambar_sampul);
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
        // Hanya tab Landing yang punya koleksi; halaman lain disimpan apa adanya.
        const denganKoleksi =
          halamanTab === "landing"
            ? siapkanSimpanLanding(contentMap, koleksiItems)
            : contentMap;
        await simpanKontenHalaman(halamanTab, denganKoleksi);
        setContentMap(denganKoleksi);
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
                    setSlug("");
                    setRingkasan("");
                    setIsi("");
                    setGambarSampul(null);
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="select-mob-filter-status"
                  className="block text-[11px] font-bold text-slate-400 mb-1"
                >
                  Filter status
                </label>
                <select
                  id="select-mob-filter-status"
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus(e.target.value as ArticleStatus | "Semua")
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-800 p-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                >
                  <option value="Semua" className="bg-slate-900 text-white">
                    Semua status
                  </option>
                  <option value="Draft" className="bg-slate-900 text-white">
                    Draft
                  </option>
                  <option value="Terbit" className="bg-slate-900 text-white">
                    Terbit
                  </option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="input-mob-cari-berita"
                  className="block text-[11px] font-bold text-slate-400 mb-1"
                >
                  Cari judul
                </label>
                <input
                  id="input-mob-cari-berita"
                  type="search"
                  value={pencarian}
                  onChange={(e) => setPencarian(e.target.value)}
                  placeholder="Kata kunci..."
                  className="w-full rounded-xl border border-white/10 bg-slate-800 p-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
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

            {/* Sub-tab khusus Landing Page di Mobile */}
            {halamanTab === "landing" && (
              <div className="flex overflow-x-auto gap-1.5 pb-1">
                {LANDING_PAGE_SUBSECTIONS.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic("light");
                      setLandingSubTab(sub.id);
                    }}
                    className={`whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-bold transition ${
                      landingSubTab === sub.id
                        ? "bg-sky-500 text-slate-950 shadow"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {sub.title}
                  </button>
                ))}
              </div>
            )}

            {loadingHalaman ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Memuat data...
              </p>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 space-y-3">
                {halamanTab === "landing"
                  ? (() => {
                      const currentSub =
                        LANDING_PAGE_SUBSECTIONS.find(
                          (s) => s.id === landingSubTab,
                        ) ?? LANDING_PAGE_SUBSECTIONS[0];
                      return currentSub.fields.map((field) => {
                        const value = contentMap[field.key] ?? "";
                        return (
                          <div key={field.key}>
                            <label
                              htmlFor={`input-hal-${field.key}`}
                              className="block text-[11px] font-bold text-slate-300 mb-1"
                            >
                              {field.label}
                            </label>
                            {field.description ? (
                              <p className="mb-1 text-[10px] text-sky-400/90">
                                ℹ️ {field.description}
                              </p>
                            ) : null}
                            {field.type === "textarea" ? (
                              <textarea
                                id={`input-hal-${field.key}`}
                                aria-label={field.label}
                                rows={field.rows || 2}
                                value={value}
                                onChange={(e) =>
                                  setContentMap((prev) => ({
                                    ...prev,
                                    [field.key]: e.target.value,
                                  }))
                                }
                                placeholder={field.placeholder}
                                disabled={!canManage}
                                className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                              />
                            ) : (
                              <input
                                id={`input-hal-${field.key}`}
                                aria-label={field.label}
                                type="text"
                                value={value}
                                onChange={(e) =>
                                  setContentMap((prev) => ({
                                    ...prev,
                                    [field.key]: e.target.value,
                                  }))
                                }
                                placeholder={field.placeholder}
                                disabled={!canManage}
                                className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                              />
                            )}
                          </div>
                        );
                      });
                    })()
                  : null}

                {halamanTab === "landing" && KOLEKSI_LANDING[landingSubTab] ? (
                  <CollectionRepeater
                    label={KOLEKSI_LANDING[landingSubTab].label}
                    description={KOLEKSI_LANDING[landingSubTab].description}
                    kunci={KOLEKSI_LANDING[landingSubTab].kunci}
                    fields={KOLEKSI_LANDING[landingSubTab].fields}
                    items={
                      koleksiItems[KOLEKSI_LANDING[landingSubTab].kunci] ?? []
                    }
                    maksItem={KOLEKSI_LANDING[landingSubTab].maksItem}
                    disabled={!canManage}
                    onChange={(items) =>
                      setKoleksiItems((prev) => ({
                        ...prev,
                        [KOLEKSI_LANDING[landingSubTab].kunci]: items,
                      }))
                    }
                  />
                ) : null}

                {/* Field halaman Profil/Kontak/Program dari konfigurasi bersama.
                    Dulu tab ini merender kunci yang KEBETULAN sudah ada di
                    database, sehingga pada pemasangan baru tidak ada satu
                    field pun yang bisa diisi dari ponsel. */}
                {halamanTab === "landing"
                  ? null
                  : (HALAMAN_CMS[halamanTab]?.fields ?? []).map((field) => (
                      <div key={field.key}>
                        <label
                          htmlFor={`input-hal-${field.key}`}
                          className="block text-[11px] font-bold text-slate-300 mb-1"
                        >
                          {field.label}
                        </label>
                        {field.description ? (
                          <p className="mb-1 text-[10px] text-sky-400/90">
                            {field.description}
                          </p>
                        ) : null}
                        {field.type === "textarea" ? (
                          <textarea
                            id={`input-hal-${field.key}`}
                            rows={field.rows || 3}
                            value={contentMap[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(e) =>
                              setContentMap((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            disabled={!canManage}
                            className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                          />
                        ) : (
                          <input
                            id={`input-hal-${field.key}`}
                            type="text"
                            value={contentMap[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(e) =>
                              setContentMap((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            disabled={!canManage}
                            className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                          />
                        )}
                      </div>
                    ))}

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
                htmlFor="input-mob-slug"
                className="block font-bold text-slate-300 mb-1"
              >
                Slug URL
              </label>
              <input
                id="input-mob-slug"
                aria-label="Slug URL artikel"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Dikosongkan = dibuat dari judul"
                className="w-full rounded-xl border border-white/10 bg-slate-800 p-2.5 text-white focus:border-sky-400 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Alamat artikel di situs publik. Mengubahnya akan memutus tautan
                yang sudah tersebar.
              </p>
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
                htmlFor="input-mob-gambar"
                className="block font-bold text-slate-300 mb-1"
              >
                Gambar Sampul
              </label>
              <input
                id="input-mob-gambar"
                aria-label="Pilih gambar sampul artikel"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePilihGambar}
                className="w-full text-[11px] text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-[11px] file:font-bold file:text-sky-300"
              />
              {gambarSampul ? (
                <div className="relative mt-2 h-32 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950">
                  {/* biome-ignore lint/performance/noImgElement: preview data URI hasil kompresi canvas di sisi klien */}
                  <img
                    src={gambarSampul}
                    alt="Pratinjau gambar sampul"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Hapus gambar sampul"
                    onClick={() => setGambarSampul(null)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-rose-300"
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-slate-500">
                  Opsional. Tampil sebagai sampul kartu berita di situs publik.
                </p>
              )}
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
