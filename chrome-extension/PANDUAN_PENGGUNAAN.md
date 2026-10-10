Tolong implementasikan Realtime Deletion Sync dan peningkatan UX operasional pada halaman LIS & Integrasi Alat Medis (lis_debug.js):

----------------------------------------------------------------------
1. REALTIME DELETION SYNC (MULTI-DEVICE)
----------------------------------------------------------------------
- Pastikan saat user menghapus sampel (klik tombol hapus/X):
  1. Frontend memanggil fungsi delete ke database Supabase (tabel lis_samples / lis_orders beserta detail hasilnya).
  2. Pasang Supabase Realtime channel listener di lis_debug.js pada event 'DELETE' untuk tabel lis_samples:
     supabase.channel('lis_samples_changes')
       .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lis_samples' }, payload => {
           // Hapus elemen kartu sampel dari DOM di browser manapun secara instan
           // Perbarui total counter dan daftar riwayat aktif
       })
       .subscribe();
  3. Pastikan jika data dihapus dari device A, device B langsung menghapus baris tersebut secara realtime tanpa perlu reload browser.

----------------------------------------------------------------------
2. PENINGKATAN UX KARYAWAN (MUDAH DIOPERASIKAN)
----------------------------------------------------------------------
A. Konfirmasi Hapus yang Aman:
   - Saat tombol 'X' pada kartu sampel diklik, tampilkan modal/dialog konfirmasi ringkas yang menyebutkan ID dan Nama Pasien agar tidak sengaja terhapus.

B. Fitur Bersihkan Data / Hapus Massal:
   - Tambahkan tombol opsi "Bersihkan Sampel Kemarin" dengan konfirmasi aman, sehingga karyawan dapat mengosongkan riwayat hari lalu dengan 1 klik.

C. Indikator Status Pengambilan:
   - Berikan badge pembeda status pada kartu sampel:
     * Badge hijau jika sampel sudah ditarik/terhubung ke form lab pasien.
     * Badge oranye/kuning jika sampel baru masuk dari alat dan belum diproses.

D. Pencarian & Filter Cepat:
   - Optimalkan input pencarian 'Cari Sample ID, Pasien...' agar memfilter list secara instan (realtime input) mencakup nama pasien, nomor lab, atau tanggal.

----------------------------------------------------------------------
3. ATURAN REPOSITORI & VALIDASI
----------------------------------------------------------------------
- ATURAN ZERO-EMOJI: Dilarang menggunakan karakter emoji pada kode, log, dan commit.
- ZERO BREAKING CHANGES: Jangan merusak alur parser penerimaan data dari alat (Mindray, Sysmex, Wondfo) dan format pembulatan yang sudah ada.
- Validasi sintaks: Jalankan 'node -c js/pages/lis_debug.js' untuk memastikan tidak ada syntax error.