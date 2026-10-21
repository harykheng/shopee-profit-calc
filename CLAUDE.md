# Petunjuk untuk asisten AI

Baca **[CONTEXT.md](CONTEXT.md)** dulu: isi aplikasi, aturan wajib, rumus, struktur kode, data, dan
riwayat keputusan. Ringkasnya:

- Semua teks aplikasi & dokumen pemakai dalam **Bahasa Indonesia** yang sederhana.
- **Jangan** membaca/menyimpan/menampilkan data pribadi pembeli; file Shopee asli hanya di
  `sample-data/` (gitignored), jangan pernah di-commit.
- Perubahan database hanya lewat file SQL **baru** di `supabase/migrations/`; sebutkan ke pemilik bahwa
  SQL itu perlu dijalankan, dan apakah harus sebelum deploy. Tabel/view baru dengan `store_id`: RLS /
  `security_invoker`, lalu tambahkan ke uji pemisahan toko dan fungsi admin ekspor/hapus.
- Jangan mengubah rumus untung bersih bulanan tanpa persetujuan pemilik.
- Logika hitungan di `src/lib/*` (murni + test), tampilan di `src/pages/*`; ikuti
  [DESIGN.md](DESIGN.md) (jawaban dulu, lalu rincian; satu angka cukup sekali).
- Sebelum selesai: `npm test` dan `npm run build` lulus; perbarui [PANDUAN.md](PANDUAN.md) untuk fitur
  yang terlihat pemakai, dan CONTEXT.md/README untuk SQL atau setup baru.
