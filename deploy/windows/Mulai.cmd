@echo off
rem Menjalankan aplikasi admin, situs publik, dan proxy HTTPS.
cd /d "%~dp0"
if not exist ".env" (
  echo Berkas .env belum ada. Salin .env.example menjadi .env, isi, lalu jalankan lagi.
  pause
  exit /b 1
)
"runtime\node.exe" mulai.mjs
if errorlevel 1 pause
