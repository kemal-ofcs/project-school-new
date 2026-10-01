@echo off
rem Mendaftarkan aplikasi supaya menyala setiap Windows dinyalakan.
rem Jalankan lewat "Run as administrator".
cd /d "%~dp0"
schtasks /Create /TN "Manajemen Sekolah" /TR "\"%~dp0Mulai.cmd\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 (
  echo Gagal mendaftarkan. Klik kanan berkas ini, lalu pilih "Run as administrator".
  pause
  exit /b 1
)
schtasks /Run /TN "Manajemen Sekolah"
echo Aplikasi akan menyala otomatis setiap Windows dinyalakan.
pause
