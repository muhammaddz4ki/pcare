@echo off
title Update Ekstensi PCare Lab
color 0b
cd /d "%~dp0"

echo ========================================================
echo       UPDATE OTOMATIS EKSTENSI PCARE BPJS
echo ========================================================
echo.
echo Sedang memeriksa dan mengunduh pembaruan dari GitHub...
echo.

git fetch origin main
git reset --hard origin/main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo --------------------------------------------------------
    echo [GAGAL] Terjadi kendala saat update.
    echo Pastikan:
    echo 1. Komputer terhubung ke internet.
    echo 2. Git sudah terinstall di komputer ini.
    echo --------------------------------------------------------
) else (
    echo.
    echo --------------------------------------------------------
    echo [BERHASIL] Ekstensi berhasil diperbarui ke versi terbaru!
    echo.
    echo LANGKAH TERAKHIR DI CHROME:
    echo 1. Buka tab baru di Chrome, buka alamat: chrome://extensions
    echo 2. Cari "PCare BPJS Auto Filler"
    echo 3. Klik tombol RELOAD (ikon panah melingkar)
    echo --------------------------------------------------------
)

echo.
pause
