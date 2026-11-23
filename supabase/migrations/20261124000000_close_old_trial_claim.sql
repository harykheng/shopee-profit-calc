-- =============================================================================
-- Tutup daftar lewat link versi lama (tanpa no HP)
--
-- claim_trial_link(kode, email, password) versi 3 isian dibiarkan terbuka di 20261123 supaya halaman daftar
-- lama tidak rusak selama jeda antara SQL dan deploy. Setelah aplikasi versi baru (no HP + tahu dari mana)
-- sudah live, versi itu ditutup untuk aplikasi: pendaftaran tanpa login hanya lewat versi 5 isian, jadi
-- setiap toko dari link pasti punya no HP & jawaban.
--
-- Fungsinya TIDAK dihapus: versi 5 isian memanggilnya dari dalam database (sebagai pemilik fungsi).
--
-- Butuh 20261123000000_trial_signup_profile.sql. Aman dijalankan lebih dari sekali. Tidak mengubah data.
-- Jalankan SESUDAH deploy aplikasi versi 23 November: sebelum itu halaman daftar yang live masih memakai
-- versi lama dan semua pendaftaran akan ditolak.
-- =============================================================================

revoke execute on function public.claim_trial_link(text, text, text) from public, anon, authenticated;
