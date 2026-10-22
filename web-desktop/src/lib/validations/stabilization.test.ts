import { describe, expect, test } from "bun:test";
import { canAccessArea } from "@/lib/auth/access";
import { employeeQrPayload } from "@/lib/client/qr-code";
import { validateGeofenceSettings } from "@/lib/validations/geofence";
import { parseQrToken } from "@/lib/validations/scanner";
import {
  createEmployeeIdentifiers,
  emailPersonil,
  firstValidationMessage,
  isValidTime,
  validateEmployeeDraft,
  validateShiftDraft,
} from "./stabilization";

describe("temporary access guard", () => {
  test("membatasi area sensitif untuk role non-Admin", () => {
    const admin = {
      isSuperadmin: false,
      permissions: ["branding.manage", "employees.view"] as const,
    };
    const scanner = {
      isSuperadmin: false,
      permissions: ["scanner.use"] as const,
    };
    expect(canAccessArea(admin, "settings")).toBe(true);
    expect(canAccessArea(scanner, "settings")).toBe(false);
    expect(canAccessArea(scanner, "karyawan")).toBe(false);
    expect(canAccessArea(scanner, "scanner")).toBe(true);
    expect(
      canAccessArea({ isSuperadmin: true, permissions: [] }, "operators"),
    ).toBe(true);
  });
});

describe("employee stabilization", () => {
  test("membuat identitas stabil dari UUID", () => {
    expect(
      createEmployeeIdentifiers("123e4567-e89b-12d3-a456-426614174000"),
    ).toEqual({
      idUnik: "EMP_123E4567E89B",
      kodeKaryawan: "K14174000",
    });
  });

  test("menolak draft karyawan yang belum lengkap", () => {
    const errors = validateEmployeeDraft({
      id_unik: "",
      kode_karyawan: "",
      nama: "A",
      divisi: "",
      id_shift: 0,
    });

    expect(Object.keys(errors)).toHaveLength(5);
    expect(firstValidationMessage(errors)).toBe("ID unik wajib diisi.");
  });
});

describe("shift stabilization", () => {
  test("memvalidasi jam 24 jam", () => {
    expect(isValidTime("07:30")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("7:30")).toBe(false);
  });

  test("menolak nilai shift yang tidak aman", () => {
    const errors = validateShiftDraft({
      kode_shift: 0,
      nama_shift: "",
      jam_masuk: "25:00",
      jam_pulang: "25:00",
      toleransi_masuk_menit: -1,
      jam_kerja_normal_menit: 0,
      istirahat_menit: 1500,
    });

    expect(Object.keys(errors)).toHaveLength(7);
  });
});

describe("QR payload", () => {
  test("hanya menerima payload ID dan token QR", () => {
    expect(parseQrToken("EMP_ABC123|TOKEN-QR-01")).toEqual({
      valid: true,
      pesan: "QR Valid.",
      idUnik: "EMP_ABC123",
      token: "TOKEN-QR-01",
    });
    expect(parseQrToken("EMP_ABC123").valid).toBe(false);
    expect(parseQrToken("").valid).toBe(false);
  });

  test("membentuk payload untuk data lama yang hanya memiliki token", () => {
    expect(
      employeeQrPayload({ id_unik: "EMP_LAMA", token_absensi: "TOKEN123" }),
    ).toBe("EMP_LAMA|TOKEN123");
    expect(employeeQrPayload({ id_unik: "EMP_TANPA_TOKEN" })).toBe("");
  });
});

describe("geofencing", () => {
  test("memvalidasi koordinat dan radius kantor", () => {
    expect(
      validateGeofenceSettings({
        enabled: true,
        latitude: -6.2,
        longitude: 106.8,
        radiusMeter: 100,
      }),
    ).toEqual({});
    expect(
      validateGeofenceSettings({
        enabled: true,
        latitude: 0,
        longitude: 0,
        radiusMeter: 5,
      }),
    ).toEqual({
      latitude: "Tentukan koordinat kantor sebelum geofencing diaktifkan.",
      radiusMeter: "Radius wajib berupa angka bulat antara 10-10.000 meter.",
    });
  });
});

// Vektor yang sama dengan `email_personil_membedakan_absen_kosong_dan_salah`
// di `turso.rs`.
describe("emailPersonil", () => {
  test("membedakan tidak dikirim, dikosongkan, dan diisi", () => {
    expect(emailPersonil(undefined)).toBeUndefined();
    expect(emailPersonil(null)).toBe("");
    expect(emailPersonil("  ")).toBe("");
    expect(emailPersonil(" Guru.Satu@Sekolah.SCH.ID ")).toBe(
      "guru.satu@sekolah.sch.id",
    );
    expect(() => emailPersonil("guru@sekolah")).toThrow(
      "Format email tidak valid.",
    );
  });

  test("validateEmployeeDraft menolak email salah format, kosong boleh", () => {
    const draft = {
      id_unik: "EMP_1",
      kode_karyawan: "K1",
      nama: "Ani",
      divisi: "Dapur",
      id_shift: 1,
    };
    expect(
      validateEmployeeDraft({ ...draft, email: "" }).email,
    ).toBeUndefined();
    expect(
      validateEmployeeDraft({ ...draft, email: "ani@sekolah" }).email,
    ).toBe("Format email tidak valid.");
  });
});
