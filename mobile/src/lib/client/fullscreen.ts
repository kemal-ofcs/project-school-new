import { isDesktopRuntime, isMobileRuntime } from "@/lib/runtime/app-runtime";

/**
 * Layar penuh untuk mode scan terminal.
 *
 * Di Desktop, Fullscreen API WebView2 hanya memenuhi area WebView dan taskbar
 * tetap tampil, jadi jendelanya sendiri yang dibuat layar penuh. Di browser,
 * panggilan pertama harus terjadi sinkron di handler klik (syarat gestur), dan
 * cabang itu memang tidak menunggu apa pun sebelum `requestFullscreen`.
 */
export async function setScanFullscreen(on: boolean): Promise<void> {
  try {
    if (isDesktopRuntime() && !isMobileRuntime()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setFullscreen(on);
      return;
    }
    if (on) await document.documentElement.requestFullscreen?.();
    else if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Ditolak WebView atau gesturnya kedaluwarsa: overlay CSS mode scan tetap
    // menutupi jendela, jadi tidak ada yang hilang bagi operator.
  }
}
