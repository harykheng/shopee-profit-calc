# Petunjuk untuk asisten AI

Baca **[CONTEXT.md](CONTEXT.md)** dulu: isi aplikasi, aturan wajib, rumus, struktur kode, dan
riwayat keputusan. Ringkasnya:

- Semua teks aplikasi & dokumen pemakai dalam **Bahasa Indonesia** yang sederhana.
- **Jangan** membaca/menyimpan/menampilkan data pribadi pembeli; file Shopee asli hanya di
  `sample-data/` (gitignored), jangan pernah di-commit.
- Perubahan database hanya lewat file SQL **baru** di `supabase/migrations/`, dan sebutkan ke
  pemilik bahwa SQL itu perlu dijalankan.
- Logika hitungan di `src/lib/*` (murni + test), tampilan di `src/pages/*`; ikuti
  [DESIGN.md](DESIGN.md) (jawaban dulu di bidang biru, lembar putih untuk rincian).
- Sebelum selesai: `npm test` dan `npm run build` lulus; perbarui [PANDUAN.md](PANDUAN.md) untuk
  fitur yang terlihat pemakai.
