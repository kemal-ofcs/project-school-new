import { requestWebApi } from "@/lib/client/api-client";
import { isDesktopRuntime } from "@/lib/runtime/app-runtime";
import { invokeDesktop } from "@/lib/runtime/desktop-commands";

/**
 * Ganti password akun yang sedang login. Di Web semua sesi akun itu dicabut,
 * jadi pemanggil wajib mengarahkan pengguna ke login lagi.
 */
export async function gantiPasswordSaya(
  currentPassword: string,
  newPassword: string,
): Promise<{ sukses: boolean }> {
  if (isDesktopRuntime()) {
    return invokeDesktop<{ sukses: boolean }>("desktop_change_own_password", {
      currentPassword,
      newPassword,
    });
  }
  return requestWebApi<{ sukses: boolean }>(
    "/api/auth/change-password",
    "POST",
    { currentPassword, newPassword },
  );
}
