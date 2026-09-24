# 🩺 Ekstensi PCare BPJS Auto Filler - Lab Purbalingga

Ekstensi Chrome untuk membantu otomasi pengisian data pemeriksaan ke portal PCare BPJS Kesehatan dari Google Sheets / Sistem Laboratorium.

---

## 🚀 Panduan Pemasangan Awal (Untuk Staf / Pengguna Baru)

Lakukan langkah ini **hanya satu kali** di setiap komputer:

### 1. Prasyarat
- Pastikan komputer sudah terinstall **Git**: [Unduh Git for Windows](https://git-scm.com/download/win) *(opsi default saat install sudah cukup)*.
- Menggunakan browser **Google Chrome**.

### 2. Download Ekstensi via Git
1. Buka folder tempat kamu ingin menyimpan ekstensi (misal di `D:\` atau `C:\`).
2. Klik kanan di area kosong > pilih **Open Git Bash here** (atau PowerShell / CMD).
3. Jalankan perintah berikut:
   ```bash
   git clone https://github.com/muhammaddz4ki/pcare.git
   ```

### 3. Pasang di Google Chrome
1. Buka browser **Google Chrome**.
2. Masuk ke halaman ekstensi dengan mengetikkan di address bar:
   ```text
   chrome://extensions
   ```
3. Di pojok kanan atas, **aktifkan toggle "Developer mode"** (Mode Pengembang).
4. Di pojok kiri atas, klik tombol **"Load unpacked"** (Muat yang belum dibongkar).
5. Pilih folder:
   ```text
   pcare/chrome-extension
   ```
6. Ekstensi siap digunakan! Pin ikon ekstensi di toolbar browser agar mudah diakses.

---

## 🔄 Cara Update Ekstensi (Saat Ada Fitur/Perbaikan Baru)

Setiap ada update atau pembaruan sistem:

1. Buka folder `pcare` di komputer kamu.
2. Klik ganda (double-click) file:
   ```text
   UPDATE.bat
   ```
3. Tunggu hingga muncul tulisan `[BERHASIL] Ekstensi berhasil diperbarui!`.
4. Buka `chrome://extensions` di Google Chrome, lalu klik ikon **Reload (putar balik)** pada kartu ekstensi PCare BPJS Auto Filler.
5. Selesai! Kamu sudah menggunakan versi paling mutakhir.
