"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { ScannerSafetyCard } from "@/components/settings/ScannerSafetyCard";
import { BackHeader } from "@/components/ui/HubRow";
import { hasPermission } from "@/lib/auth/access";
import {
  calculateDistanceMeters,
  getCurrentCoordinates,
} from "@/lib/client/geolocation";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";
import {
  type GeofenceSettings,
  getGeofenceSettings,
  saveGeofenceSettings,
} from "@/lib/gateways/geofence";
import {
  getScanSecurity,
  saveScanSecurity,
} from "@/lib/gateways/scan-security";
import { subscribeSyncCompleted } from "@/lib/gateways/sync-status";
import { validateGeofenceSettings } from "@/lib/validations/geofence";
import { validateIpAllowlistEntries } from "@/lib/validations/ip-allowlist";

export default function KeamananAbsensiPage() {
  const isSubmittingRef = useRef(false);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canManageGeofence = Boolean(
    user?.isSuperadmin || hasPermission(user, "branding.manage"),
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    // Keamanan absensi (foto bukti, IP allowlist, geofencing, keamanan
    // pemindai) adalah wewenang konfigurasi, bukan tontonan umum — hanya
    // Superadmin atau pemegang `branding.manage` yang boleh membuka layar ini.
    if (
      !authLoading &&
      isAuthenticated &&
      !user?.isSuperadmin &&
      !hasPermission(user, "branding.manage")
    ) {
      router.replace("/settings");
    }
  }, [authLoading, isAuthenticated, user, router]);

  const [geofence, setGeofence] = useState<GeofenceSettings>({
    enabled: false,
    latitude: 0,
    longitude: 0,
    radiusMeter: 100,
  });
  const [geofenceLoading, setGeofenceLoading] = useState(true);
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [ipAllowlistDraft, setIpAllowlistDraft] = useState("");
  const [ipDeviceAddresses, setIpDeviceAddresses] = useState<string[]>([]);
  const [ipAllowlistBusy, setIpAllowlistBusy] = useState(false);
  const [ipAllowlistMessage, setIpAllowlistMessage] = useState("");
  const [scanPhotoEnabled, setScanPhotoEnabled] = useState(false);
  const [scanIpEnabled, setScanIpEnabled] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [currentDeviceCoords, setCurrentDeviceCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [geofenceBusy, setGeofenceBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadScanSecurity() {
      if (!canManageGeofence) return;
      try {
        const settings = await getScanSecurity();
        if (cancelled) return;
        setScanPhotoEnabled(settings.photoEnabled);
        setScanIpEnabled(settings.ipRestrictionEnabled);
        setIpAllowlist(settings.entries);
        setIpAllowlistDraft(settings.entries.join("\n"));
        setIpDeviceAddresses(settings.deviceAddresses);
      } catch {
        // Ditangani lewat pesan pada saat menyimpan.
      }
    }
    void loadScanSecurity();

    async function loadGeofence() {
      try {
        const settings = await getGeofenceSettings();
        if (!cancelled) setGeofence(settings);
      } catch {
        // Pengaturan geofence gagal dimuat: formulirnya tetap tampil dengan
        // nilai bawaan, dan penyimpanan berikutnya menulis ulang nilainya.
      } finally {
        if (!cancelled) setGeofenceLoading(false);
      }
    }
    if (isAuthenticated && canManageGeofence) {
      void loadGeofence();
    } else {
      setGeofenceLoading(false);
    }

    const onSyncCompleted = () => {
      if (isAuthenticated && canManageGeofence) {
        void loadGeofence();
      }
    };
    const lepas = subscribeSyncCompleted(onSyncCompleted);

    return () => {
      cancelled = true;
      lepas();
    };
  }, [isAuthenticated, canManageGeofence]);

  const handleUseCurrentLocation = async () => {
    setGeofenceBusy(true);
    triggerHaptic("light");
    const coordinates = await getCurrentCoordinates();
    setGeofenceBusy(false);
    if (!coordinates) {
      triggerHaptic("error");
      setSaveMessage(
        "Lokasi GPS tidak dapat dideteksi. Pastikan GPS/Location HP aktif dan izin lokasi diizinkan.",
      );
      setTimeout(() => setSaveMessage(""), 4000);
      return;
    }
    setCurrentDeviceCoords({ lat: coordinates.lat, lng: coordinates.lng });
    setGeofence((curr) => ({
      ...curr,
      latitude: Number(coordinates.lat.toFixed(7)),
      longitude: Number(coordinates.lng.toFixed(7)),
    }));
    triggerHaptic("success");
    setSaveMessage("Koordinat GPS HP berhasil dimasukkan ke form.");
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const handleSaveGeofence = async () => {
    if (isSubmittingRef.current) return;
    const errors = validateGeofenceSettings(geofence);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      triggerHaptic("error");
      setSaveMessage(firstError);
      setTimeout(() => setSaveMessage(""), 3000);
      return;
    }
    setGeofenceBusy(true);
    triggerHaptic("light");
    isSubmittingRef.current = true;
    try {
      const saved = await saveGeofenceSettings(geofence);
      setGeofence(saved);
      triggerHaptic("success");
      setSaveMessage(
        "Pengaturan Geofencing berhasil disimpan dan disinkronkan.",
      );
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      triggerHaptic("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Gagal menyimpan geofencing.",
      );
      setTimeout(() => setSaveMessage(""), 3000);
    } finally {
      isSubmittingRef.current = false;
      setGeofenceBusy(false);
    }
  };

  const handleSaveScanSecurity = async () => {
    if (isSubmittingRef.current) return;
    const entries = ipAllowlistDraft
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const validationMessage = Object.values(
      validateIpAllowlistEntries(entries),
    )[0];
    if (validationMessage) {
      setIpAllowlistMessage(validationMessage);
      return;
    }
    setIpAllowlistBusy(true);
    isSubmittingRef.current = true;
    try {
      const saved = await saveScanSecurity({
        photoEnabled: scanPhotoEnabled,
        ipRestrictionEnabled: scanIpEnabled,
        entries,
      });
      setScanPhotoEnabled(saved.photoEnabled);
      setScanIpEnabled(saved.ipRestrictionEnabled);
      setIpAllowlist(saved.entries);
      setIpAllowlistDraft(saved.entries.join("\n"));
      setIpDeviceAddresses(saved.deviceAddresses);
      setIpAllowlistMessage(
        !saved.photoEnabled && !saved.ipRestrictionEnabled
          ? "Kedua fitur dimatikan. Absensi berjalan seperti biasa."
          : saved.ipRestrictionEnabled && saved.entries.length === 0
            ? "Tersimpan. Pembatasan IP aktif tetapi daftarnya masih kosong, jadi belum ada yang dibatasi."
            : "Pengaturan keamanan absensi tersimpan.",
      );
      triggerHaptic("success");
    } catch (error) {
      setIpAllowlistMessage(
        error instanceof Error
          ? error.message
          : "Pengaturan keamanan absensi gagal disimpan.",
      );
      triggerHaptic("error");
    } finally {
      isSubmittingRef.current = false;
      setIpAllowlistBusy(false);
    }
  };

  const handleToggleGeofence = async () => {
    if (isSubmittingRef.current) return;
    triggerHaptic("light");
    const sebelumnya = geofence;
    const updated = { ...geofence, enabled: !geofence.enabled };
    setGeofence(updated);
    isSubmittingRef.current = true;
    try {
      await saveGeofenceSettings(updated);
      triggerHaptic("success");
      setSaveMessage(
        updated.enabled
          ? "Geofencing GPS diaktifkan."
          : "Geofencing GPS dinonaktifkan.",
      );
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      setGeofence(sebelumnya);
      triggerHaptic("error");
      setSaveMessage(
        error instanceof Error
          ? `Gagal menyimpan geofencing: ${error.message}`
          : "Gagal menyimpan pengaturan geofencing.",
      );
      setTimeout(() => setSaveMessage(""), 4000);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4">
        <BackHeader
          href="/settings"
          label="Pengaturan"
          title="Keamanan Absensi"
        />

        {saveMessage && (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-950/60 p-3 text-xs font-bold text-sky-200 shadow-lg">
            {saveMessage}
          </div>
        )}

        {/* Keamanan absensi: sakelar induk fitur + daftar IP */}
        {canManageGeofence ? (
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 backdrop-blur-md">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-white">Keamanan Absensi</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Dua fitur opsional. Selama mati, sakelar per role di Master
                Operator tidak berpengaruh apa pun.
              </p>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
              <input
                type="checkbox"
                checked={scanPhotoEnabled}
                onChange={(event) => setScanPhotoEnabled(event.target.checked)}
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="text-[11px] leading-5 text-slate-300">
                <strong className="text-white">Wajib foto bukti absensi</strong>
                <br />
                Setelah QR terbaca, terminal menahan sebentar dan memotret wajah
                serta latar orang yang absen.
              </span>
            </label>

            <label className="mt-2 flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
              <input
                type="checkbox"
                checked={scanIpEnabled}
                onChange={(event) => setScanIpEnabled(event.target.checked)}
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="text-[11px] leading-5 text-slate-300">
                <strong className="text-white">Batasi alamat IP</strong>
                <br />
                Absensi hanya diterima dari alamat yang terdaftar di bawah.
              </span>
            </label>

            {scanIpEnabled ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Alamat IP yang diizinkan
                  </p>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                      ipAllowlist.length > 0
                        ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
                        : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                    }`}
                  >
                    {ipAllowlist.length > 0
                      ? `${ipAllowlist.length} entri`
                      : "Belum membatasi"}
                  </span>
                </div>
                <textarea
                  aria-label="Daftar alamat IP yang diizinkan"
                  value={ipAllowlistDraft}
                  onChange={(event) => setIpAllowlistDraft(event.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder={"192.168.1.0/24\n10.10.0.7"}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-xs text-white outline-none focus:border-sky-400"
                />
                {ipDeviceAddresses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {ipDeviceAddresses.map((address) => (
                      <button
                        key={address}
                        type="button"
                        onClick={() =>
                          setIpAllowlistDraft((current) =>
                            current
                              .split(/[\n,;]/)
                              .map((item) => item.trim())
                              .filter(Boolean)
                              .includes(address)
                              ? current
                              : `${current.trim()}${current.trim() ? "\n" : ""}${address}`,
                          )
                        }
                        className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 font-mono text-[11px] font-bold text-sky-200"
                      >
                        + {address}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {ipAllowlistMessage ? (
              <div className="mt-2 rounded-xl border border-sky-500/30 bg-sky-950/40 p-2.5 text-xs text-sky-200">
                {ipAllowlistMessage}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleSaveScanSecurity()}
              disabled={ipAllowlistBusy}
              className="mt-3 w-full rounded-xl bg-sky-400 py-2.5 text-xs font-black text-slate-950 transition active:scale-95 disabled:opacity-60"
            >
              {ipAllowlistBusy ? "Menyimpan..." : "Simpan keamanan absensi"}
            </button>
          </div>
        ) : null}

        {/* GPS Geofencing Preferences */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                GPS Geofencing Absensi
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Validasi radius lokasi scan terhadap titik koordinat kantor
              </p>
            </div>
            {canManageGeofence ? (
              <button
                type="button"
                onClick={handleToggleGeofence}
                disabled={geofenceLoading}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  geofence.enabled ? "bg-sky-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-5 transform rounded-full bg-on-accent shadow-lg ring-0 transition duration-200 ease-in-out ${
                    geofence.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            ) : (
              <span className="rounded-full border border-white/10 bg-slate-950 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                Hanya Superadmin
              </span>
            )}
          </div>

          {canManageGeofence ? (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Latitude</span>
                  <input
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    value={geofence.latitude}
                    onChange={(e) =>
                      setGeofence((c) => ({
                        ...c,
                        latitude: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-sky-400"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Longitude</span>
                  <input
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    value={geofence.longitude}
                    onChange={(e) =>
                      setGeofence((c) => ({
                        ...c,
                        longitude: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-sky-400"
                  />
                </label>
              </div>

              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Radius Kantor (meter)</span>
                  <span className="font-mono font-bold text-sky-400">
                    {geofence.radiusMeter}m
                  </span>
                </div>
                <input
                  aria-label="Radius kantor dalam meter"
                  type="number"
                  min={10}
                  max={10000}
                  value={geofence.radiusMeter}
                  onChange={(e) =>
                    setGeofence((c) => ({
                      ...c,
                      radiusMeter: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-sky-400"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {[25, 50, 100, 250, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        setGeofence((c) => ({ ...c, radiusMeter: preset }));
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                        geofence.radiusMeter === preset
                          ? "bg-sky-400 text-slate-950 shadow-sm"
                          : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              </div>

              {currentDeviceCoords ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>GPS HP Anda:</span>
                    <span className="font-mono text-sky-300">
                      {currentDeviceCoords.lat.toFixed(5)},{" "}
                      {currentDeviceCoords.lng.toFixed(5)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Jarak ke Titik Kantor:</span>
                    <span className="font-mono font-bold text-white">
                      {calculateDistanceMeters(
                        currentDeviceCoords.lat,
                        currentDeviceCoords.lng,
                        geofence.latitude,
                        geofence.longitude,
                      )}{" "}
                      meter
                    </span>
                  </div>
                  <div className="pt-1 flex justify-end">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        calculateDistanceMeters(
                          currentDeviceCoords.lat,
                          currentDeviceCoords.lng,
                          geofence.latitude,
                          geofence.longitude,
                        ) <= geofence.radiusMeter
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {calculateDistanceMeters(
                        currentDeviceCoords.lat,
                        currentDeviceCoords.lng,
                        geofence.latitude,
                        geofence.longitude,
                      ) <= geofence.radiusMeter
                        ? "Di Dalam Radius Kantor"
                        : "Di Luar Radius Kantor"}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  disabled={geofenceBusy}
                  onClick={handleUseCurrentLocation}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 active:scale-95 transition disabled:opacity-50"
                >
                  Ambil Lokasi GPS HP Ini
                </button>
                <button
                  type="button"
                  disabled={geofenceBusy}
                  onClick={handleSaveGeofence}
                  className="w-full rounded-xl bg-sky-400 py-2.5 text-xs font-black text-slate-950 shadow-md hover:bg-sky-300 active:scale-95 transition disabled:opacity-50"
                >
                  {geofenceBusy
                    ? "Menyimpan..."
                    : "Simpan Pengaturan Geofencing"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-3 text-xs text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Radius Validasi:</span>
                <span className="font-semibold text-white">
                  {geofence.radiusMeter} meter
                </span>
              </div>
              <div className="flex justify-between">
                <span>Koordinat Kantor:</span>
                <span className="font-mono text-slate-300">
                  {geofence.latitude.toFixed(5)},{" "}
                  {geofence.longitude.toFixed(5)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Keamanan pemindai (backend menolak selain Superadmin) */}
        {user?.isSuperadmin ? <ScannerSafetyCard /> : null}
      </div>
    </MobileAppShell>
  );
}
