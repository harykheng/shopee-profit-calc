-- =============================================================================
-- Batas simulasi akun uji coba jadi 10 produk (sebelumnya 50, dari 20261028000000_trial_limits_total.sql)
--
-- Berlaku langsung untuk semua toko uji coba, termasuk yang sedang berjalan: toko yang sudah mencoba
-- lebih dari 10 produk tidak bisa membuka produk BARU (produk yang sudah pernah dicoba tetap terbuka).
-- Jatah tambahan per toko (stores.trial_sim_bonus, 20261102) tetap ditambahkan di atas angka ini.
-- Batas data uji coba tetap 1 bulan. Lama uji coba (7 hari) diatur di aplikasi (form Buat akun).
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah data. Jalankan sebelum/bersamaan deploy supaya angka
-- di aplikasi dan di database sama.
-- =============================================================================

create or replace function public.trial_simulation_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;
