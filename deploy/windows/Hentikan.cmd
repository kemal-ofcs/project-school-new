@echo off
rem Menghentikan aplikasi yang dijalankan Mulai.cmd atau tugas otomatis.
cd /d "%~dp0"
if not exist "data\mulai.pid" (
  echo Aplikasi tidak sedang berjalan.
  exit /b 0
)
set /p KOS_PID=<"data\mulai.pid"
rem /T ikut menghentikan aplikasi admin, situs publik, dan proxy.
taskkill /PID %KOS_PID% /T /F >nul 2>&1
if errorlevel 1 (
  echo Gagal menghentikan proses %KOS_PID%. Bila aplikasi dijalankan otomatis oleh Windows, jalankan berkas ini lewat "Run as administrator".
  exit /b 1
)
del "data\mulai.pid" >nul 2>&1
echo Aplikasi dihentikan.
