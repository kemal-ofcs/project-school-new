@echo off
rem Membatalkan Pasang-otomatis.cmd. Jalankan lewat "Run as administrator".
cd /d "%~dp0"
schtasks /End /TN "Manajemen Sekolah" >nul 2>&1
schtasks /Delete /TN "Manajemen Sekolah" /F
if errorlevel 1 (
  echo Gagal mencopot. Klik kanan berkas ini, lalu pilih "Run as administrator".
  pause
  exit /b 1
)
echo Aplikasi tidak lagi menyala otomatis.
pause
