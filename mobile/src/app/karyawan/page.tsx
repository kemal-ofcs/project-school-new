"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmployeeBulkActions } from "@/components/karyawan/EmployeeBulkActions";
import { EmployeeCard } from "@/components/karyawan/EmployeeCard";
import { EmployeeDetailModal } from "@/components/karyawan/EmployeeDetailModal";
import { EmployeeFormModal } from "@/components/karyawan/EmployeeFormModal";
import { MobileAppShell } from "@/components/MobileAppShell";
import {
  jalankanBerurutan,
  ringkasHasil,
} from "@/components/operational/aturanPilihPersonil";
import {
  alihkanSatu,
  alihkanSemuaTampil,
  type KolomMassal,
  terapkanKolomMassal,
} from "@/components/personnel/aturanUbahMassal";
import {
  type TerapkanMassal,
  UbahMassal,
} from "@/components/personnel/UbahMassal";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import { getDaftarUnit } from "@/lib/gateways/academic";
import {
  getDaftarKaryawan,
  type KaryawanInput,
  toggleStatusKaryawan,
  updateKaryawan,
} from "@/lib/gateways/employee";
import { getDaftarShift } from "@/lib/gateways/shift";
import { subscribeSyncCompleted } from "@/lib/gateways/sync-status";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useStatusFotoPersonil } from "@/lib/hooks/useStatusFotoPersonil";
import {
  draftKaryawanDariBaris,
  opsiFilterUnit,
  shiftLabel,
  TANPA_UNIT,
} from "@/lib/validations/personnel";
import {
  firstValidationMessage,
  validateEmployeeDraft,
} from "@/lib/validations/stabilization";

type FilterStatus = "" | "Aktif" | "Nonaktif";
type FilterBackup = "" | "BACKUP" | "NORMAL";

/**
 * Halaman Master Karyawan Mobile.
 *
 * Dilindungi oleh dua lapis RBAC:
 * - Mengakses halaman: membutuhkan employees.view
 * - Tombol Tambah/Edit/Toggle: membutuhkan employees.manage
 *
 * Data dibaca langsung dari SQLite lokal (0ms response).
 * Reaktif terhadap event 'sppg:sync-completed' untuk pembaruan otomatis.
 */
export default function KaryawanPage() {
  const isHydrated = useHydrated();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canView = canAccessArea(user, "karyawan");
  const canManage = hasPermission(user, "employees.manage");

  // ─── Data & Loading State ───────────────────────────────────────────────────
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [units, setUnits] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ─── Filter & Pencarian ─────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("");
  const [filterBackup, setFilterBackup] = useState<FilterBackup>("");
  const [filterUnit, setFilterUnit] = useState<string>("");

  // ─── Modal State ────────────────────────────────────────────────────────────
  const [detailEmployee, setDetailEmployee] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [formInitialData, setFormInitialData] = useState<KaryawanInput | null>(
    null,
  );
  const [formOpen, setFormOpen] = useState(false);

  // ─── Busy Guard ─────────────────────────────────────────────────────────────
  const isSubmittingRef = useRef(false);
  const [terpilih, setTerpilih] = useState<string[]>([]);
  const [bulkEditing, setBulkEditing] = useState(false);

  // ─── Auth Guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // ─── RBAC Guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isHydrated && isAuthenticated && !canView) {
      router.replace("/dashboard");
    }
  }, [isHydrated, isAuthenticated, canView, router]);

  // ─── Load Data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [empData, shiftData, unitData] = await Promise.all([
          getDaftarKaryawan({
            search: debouncedSearch || undefined,
            status_aktif: filterStatus || undefined,
            hanya_pegawai: true,
          }),
          getDaftarShift(),
          getDaftarUnit(),
        ]);
        setEmployees(empData);
        setShifts(shiftData);
        // Hanya unit aktif yang masuk dropdown; unit nonaktif tetap tersimpan
        // pada personil lama supaya datanya tidak hilang saat dipensiunkan.
        setUnits(unitData.filter((u) => Number(u.status_aktif) === 1));
        setErrorMsg(null);
      } catch (err: unknown) {
        if (!silent) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : "Data karyawan gagal dimuat. Pastikan koneksi ke database aktif.",
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [debouncedSearch, filterStatus],
  );

  // Load awal saat hydrated & terautentikasi
  useEffect(() => {
    if (isHydrated && isAuthenticated && canView) {
      void loadData();
    }
  }, [isHydrated, isAuthenticated, canView, loadData]);

  // Reaktivitas sinkronisasi real-time (Rule 4.16)
  useEffect(() => {
    return subscribeSyncCompleted(() => void loadData(true));
  }, [loadData]);

  // ─── Filter Client-Side (status_backup) ─────────────────────────────────────
  // Filter status_backup dilakukan di sisi klien karena tidak tersedia
  // sebagai parameter di gateway backend — aman untuk < 1000 baris.
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (
        filterBackup &&
        String(emp.status_backup ?? "NORMAL") !== filterBackup
      ) {
        return false;
      }
      if (filterUnit) {
        const unitBaris = String(emp.unit || "").trim();
        if (
          filterUnit === TANPA_UNIT
            ? unitBaris !== ""
            : unitBaris !== filterUnit
        ) {
          return false;
        }
      }
      return true;
    });
  }, [employees, filterBackup, filterUnit]);

  // Kartu hanya butuh status "punya foto"; fotonya dimuat saat dibuka.
  const idKaryawanTampil = useMemo(
    () => filteredEmployees.map((emp) => String(emp.id_unik ?? "")),
    [filteredEmployees],
  );
  const { punyaFoto, muatUlang: muatUlangStatusFoto } =
    useStatusFotoPersonil(idKaryawanTampil);

  const unitOptions = useMemo(
    () => opsiFilterUnit(units, employees),
    [units, employees],
  );

  // ─── Handler: Toggle Status ─────────────────────────────────────────────────
  const handleToggleStatus = useCallback(
    async (idUnik: string, currentStatus: string) => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      const nextStatus: "Aktif" | "Nonaktif" =
        currentStatus === "Aktif" ? "Nonaktif" : "Aktif";
      try {
        await toggleStatusKaryawan(idUnik, nextStatus);
        setSuccessMsg(`Status karyawan berhasil diubah menjadi ${nextStatus}.`);
        triggerHaptic("success");
        await loadData(true);
        // Perbarui selectedEmployee jika modal detail masih terbuka
        setDetailEmployee((prev) =>
          prev && String(prev.id_unik) === idUnik
            ? { ...prev, status_aktif: nextStatus }
            : prev,
        );
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Gagal mengubah status karyawan.",
        );
        triggerHaptic("error");
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [loadData],
  );

  // ─── Handler: Buka Detail Modal ─────────────────────────────────────────────
  const handleOpenDetail = useCallback((emp: Record<string, unknown>) => {
    setDetailEmployee(emp);
    setDetailOpen(true);
  }, []);

  // ─── Handler: Buka Form Edit dari dalam modal detail ────────────────────────
  const handleEditRequest = useCallback(
    (emp: Record<string, unknown>) => {
      if (!canManage) return;
      const initData: KaryawanInput = draftKaryawanDariBaris(emp);
      setFormMode("edit");
      setFormInitialData(initData);
      setDetailOpen(false);
      setFormOpen(true);
    },
    [canManage],
  );

  // ─── Ubah massal ───────────────────────────────────────────────────────────
  const kolomMassal = useMemo<KolomMassal[]>(
    () => [
      { key: "divisi", label: "Divisi", jenis: "teks" },
      { key: "jabatan_status", label: "Jabatan", jenis: "teks" },
      {
        key: "unit",
        label: "Unit",
        opsi: units.map((u) => ({
          value: String(u.nama_unit),
          label: String(u.nama_unit),
        })),
      },
      {
        key: "id_shift",
        label: "Shift",
        jenis: "angka",
        opsi: shifts.map((shift) => ({
          value: String(shift.id_shift),
          label: shiftLabel(shift),
        })),
      },
      {
        key: "status_aktif",
        label: "Status aktif",
        opsi: [
          { value: "Aktif", label: "Aktif" },
          { value: "Nonaktif", label: "Nonaktif" },
        ],
      },
      { key: "tanggal_mulai_aktif", label: "Mulai aktif", jenis: "tanggal" },
      {
        key: "tanggal_selesai_aktif",
        label: "Selesai aktif",
        jenis: "tanggal",
      },
    ],
    [units, shifts],
  );

  const namaKaryawan = (id: string) =>
    String(employees.find((emp) => String(emp.id_unik) === id)?.nama || id);

  const handleUbahMassal: TerapkanMassal = async (kolom, nilai, onProgres) => {
    if (!canManage || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setBulkEditing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const hasil = await jalankanBerurutan(
        terpilih,
        async (id) => {
          const emp = employees.find((row) => String(row.id_unik) === id);
          if (!emp) return { sukses: false, pesan: "tidak ada di daftar" };
          if (kolom.key === "status_aktif") {
            // Jalur yang sama dengan tombol Aktif/Nonaktif per karyawan.
            await toggleStatusKaryawan(id, nilai as "Aktif" | "Nonaktif");
            return { sukses: true, pesan: "" };
          }
          const draft = terapkanKolomMassal(
            draftKaryawanDariBaris(emp),
            kolom,
            nilai,
          );
          const galat = validateEmployeeDraft(draft);
          if (Object.keys(galat).length > 0) {
            return { sukses: false, pesan: firstValidationMessage(galat) };
          }
          await updateKaryawan(id, draft);
          return { sukses: true, pesan: "" };
        },
        onProgres,
      );
      const ringkasan = `Ubah ${kolom.label}: ${ringkasHasil(hasil, namaKaryawan)}`;
      if (hasil.gagal.length > 0) setErrorMsg(ringkasan);
      else setSuccessMsg(ringkasan);
      triggerHaptic(hasil.gagal.length > 0 ? "error" : "success");
      // Yang gagal tetap terpilih supaya bisa langsung dicoba lagi.
      setTerpilih(hasil.gagal.map((item) => item.id));
      await loadData(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Ubah massal gagal.");
    } finally {
      isSubmittingRef.current = false;
      setBulkEditing(false);
    }
  };

  // ─── Handler: Tambah Karyawan Baru ─────────────────────────────────────────
  const handleAddNew = () => {
    if (!canManage) return;
    triggerHaptic("light");
    setFormMode("add");
    setFormInitialData(null);
    setFormOpen(true);
  };

  // ─── Handler: Sukses Form ───────────────────────────────────────────────────
  const handleFormSuccess = useCallback(
    (message: string) => {
      setSuccessMsg(message);
      void loadData(true);
      void muatUlangStatusFoto();
    },
    [loadData, muatUlangStatusFoto],
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  // State saat autentikasi masih loading
  if (authLoading || !isHydrated) {
    return (
      <MobileAppShell>
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-white/5 bg-slate-900/40 animate-pulse"
            />
          ))}
        </div>
      </MobileAppShell>
    );
  }

  return (
    <MobileAppShell>
      {/* ── Header Halaman ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-black text-white leading-tight">
            Data Karyawan
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {loading
              ? "Memuat data..."
              : `${filteredEmployees.length} dari ${employees.length} karyawan`}
          </p>
        </div>
        {/* Tombol Tambah Karyawan — hanya jika canManage */}
        {canManage ? (
          <button
            type="button"
            id="btn-tambah-karyawan"
            onClick={handleAddNew}
            aria-label="Tambah karyawan baru"
            className="grid size-10 place-items-center rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-on-accent shadow-lg shadow-sky-500/30 hover:brightness-110 active:scale-90 transition-all"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* ── Aksi Massal: impor Excel & generate QR (employees.manage) ── */}
      {canManage ? (
        <EmployeeBulkActions
          exportRows={filteredEmployees}
          shifts={shifts}
          onCompleted={(message) => {
            setErrorMsg(null);
            setSuccessMsg(message);
            void loadData(true);
          }}
          onInfo={(message) => {
            setErrorMsg(null);
            setSuccessMsg(message);
          }}
          onError={(message) => {
            setSuccessMsg(null);
            setErrorMsg(message);
          }}
        />
      ) : null}

      {/* ── Kolom Pencarian ── */}
      <div className="relative mb-3">
        <Icon
          name="users"
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400"
        />
        <input
          aria-label="Cari karyawan"
          id="search-karyawan"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, kode, ID, atau divisi..."
          className="w-full rounded-xl border border-white/10 bg-slate-800/60 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition"
        />
      </div>

      {/* ── Filter Chips (horizontal scroll) ── */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {/* Filter Status */}
        {(
          [
            { label: "Semua", status: "" as FilterStatus },
            { label: "Aktif", status: "Aktif" as FilterStatus },
            { label: "Nonaktif", status: "Nonaktif" as FilterStatus },
          ] as const
        ).map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setFilterStatus(item.status)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-all active:scale-95 ${
              filterStatus === item.status
                ? "border-sky-500 bg-sky-500/20 text-sky-300"
                : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}

        {/* Pemisah visual */}
        <div className="shrink-0 w-px bg-white/10 self-stretch" />

        {/* Filter Backup */}
        {(
          [
            { label: "Semua Tipe", backup: "" as FilterBackup },
            { label: "Karyawan Utama", backup: "NORMAL" as FilterBackup },
            { label: "Backup", backup: "BACKUP" as FilterBackup },
          ] as const
        ).map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setFilterBackup(item.backup)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-all active:scale-95 ${
              filterBackup === item.backup
                ? "border-amber-500 bg-amber-500/20 text-amber-300"
                : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}

        {/* Pemisah visual */}
        <div className="shrink-0 w-px bg-white/10 self-stretch" />

        {/* Filter Unit — dropdown, bukan chip: jumlah unitnya ditentukan
            sekolah dan bisa jauh lebih banyak daripada tiga pilihan tetap. */}
        <select
          value={filterUnit}
          onChange={(e) => setFilterUnit(e.target.value)}
          aria-label="Saring berdasarkan unit"
          className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-slate-300 outline-none focus:border-sky-500"
        >
          <option value="">Semua Unit</option>
          <option value={TANPA_UNIT}>(Tanpa unit)</option>
          {unitOptions.map((nama) => (
            <option key={nama} value={nama}>
              {nama}
            </option>
          ))}
        </select>
      </div>

      {/* ── Feedback Banners ── */}
      {successMsg ? (
        <FeedbackBanner
          type="success"
          message={successMsg}
          onClose={() => setSuccessMsg(null)}
          className="mb-3"
        />
      ) : null}
      {errorMsg ? (
        <FeedbackBanner
          type="error"
          message={errorMsg}
          onClose={() => setErrorMsg(null)}
          className="mb-3"
        />
      ) : null}

      {canManage ? (
        <div className="mb-3">
          <UbahMassal
            id="massal-karyawan"
            terpilih={terpilih}
            namaDari={namaKaryawan}
            satuan="karyawan"
            kolom={kolomMassal}
            onTerapkan={handleUbahMassal}
            onKosongkan={() => setTerpilih([])}
            sibuk={bulkEditing}
          />
        </div>
      ) : null}

      {canManage && !loading && filteredEmployees.length > 0 ? (
        <label className="mb-3 flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 text-xs font-semibold text-slate-300">
          <input
            type="checkbox"
            className="size-4 accent-sky-400"
            checked={idKaryawanTampil.every((id) => terpilih.includes(id))}
            onChange={() =>
              setTerpilih((prev) => alihkanSemuaTampil(prev, idKaryawanTampil))
            }
          />
          Pilih semua yang tampil ({filteredEmployees.length}) untuk diubah
          sekaligus
        </label>
      ) : null}

      {/* ── Daftar Karyawan ── */}
      {loading ? (
        /* Skeleton Loading */
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-white/5 bg-slate-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : filteredEmployees.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-900/40 py-12 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-slate-800/60 text-slate-500">
            <Icon name="users" className="size-7" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-300">
              {search || filterStatus || filterBackup
                ? "Tidak ada karyawan yang sesuai filter"
                : "Belum ada data karyawan"}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {search || filterStatus || filterBackup
                ? "Coba ubah filter atau kata kunci pencarian"
                : canManage
                  ? "Tambah lewat tombol + atau impor dari berkas Excel/CSV"
                  : "Belum ada karyawan yang terdaftar"}
            </p>
          </div>
          {search || filterStatus || filterBackup ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilterStatus("");
                setFilterBackup("");
              }}
              className="mt-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/10 active:scale-95 transition"
            >
              Reset Filter
            </button>
          ) : null}
        </div>
      ) : (
        /* Daftar Kartu Karyawan */
        <div className="flex flex-col gap-3">
          {filteredEmployees.map((emp) => {
            const id = String(emp.id_unik ?? "");
            const kartu = (
              <EmployeeCard
                key={id}
                employee={emp}
                canManage={canManage}
                onOpenDetail={handleOpenDetail}
                punyaFoto={punyaFoto.has(id)}
              />
            );
            return canManage ? (
              <div key={id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={`Pilih ${String(emp.nama || id)}`}
                  className="mt-5 size-5 shrink-0 accent-sky-400"
                  checked={terpilih.includes(id)}
                  onChange={() => setTerpilih((prev) => alihkanSatu(prev, id))}
                />
                <div className="min-w-0 flex-1">{kartu}</div>
              </div>
            ) : (
              <div key={id}>{kartu}</div>
            );
          })}
        </div>
      )}

      {/* ── Modal Detail Karyawan ── */}
      <EmployeeDetailModal
        employee={detailEmployee}
        shifts={shifts}
        canManage={canManage}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEditRequest={handleEditRequest}
        onToggleStatus={handleToggleStatus}
        onPhotoChanged={() => void muatUlangStatusFoto()}
      />

      {/* ── Modal Form Tambah / Edit (hanya render jika canManage) ── */}
      {canManage ? (
        <EmployeeFormModal
          isOpen={formOpen}
          mode={formMode}
          initialData={formInitialData}
          shifts={shifts}
          units={units}
          onClose={() => setFormOpen(false)}
          onSuccess={handleFormSuccess}
          onWarning={setErrorMsg}
        />
      ) : null}
    </MobileAppShell>
  );
}
