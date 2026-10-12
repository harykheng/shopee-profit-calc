-- =============================================================================
-- Langganan habis = mode baca saja (bukan terkunci total)
--
-- Sebelumnya (20261012000000_multi_tenant.sql) seluruh tabel data hanya bisa diakses
-- anggota toko yang langganannya AKTIF, untuk membaca maupun menulis. Pelanggan yang
-- langganannya habis tidak bisa melihat datanya sendiri.
--
-- Sekarang:
--   * MEMBACA : semua anggota toko, walau langganan sudah habis.
--   * MENULIS : tetap hanya anggota dengan langganan aktif (policy lama
--               "anggota aktif: akses penuh" tidak diubah).
--
-- Cara kerjanya: ditambahkan satu policy SELECT per tabel. Policy di Postgres
-- digabung dengan OR, jadi baca = anggota ATAU anggota-aktif = anggota; tulis tetap
-- lewat policy lama. Semua view dan fungsi upsert/recalc `security invoker`, jadi
-- ikut aturan ini otomatis (upload dan hitung ulang HPP ditolak saat langganan habis).
--
-- Aman dijalankan lebih dari sekali. Tidak menghapus data.
-- =============================================================================

drop policy if exists "anggota: baca" on public.products;
create policy "anggota: baca" on public.products
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "anggota: baca" on public.order_items;
create policy "anggota: baca" on public.order_items
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "anggota: baca" on public.income;
create policy "anggota: baca" on public.income
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "anggota: baca" on public.income_adjustments;
create policy "anggota: baca" on public.income_adjustments
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "anggota: baca" on public.expenses;
create policy "anggota: baca" on public.expenses
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "anggota: baca" on public.ad_reports;
create policy "anggota: baca" on public.ad_reports
  for select to authenticated using (public.is_store_member(store_id));

-- ad_rows tidak punya store_id: lewat laporan induknya.
drop policy if exists "anggota: baca" on public.ad_rows;
create policy "anggota: baca" on public.ad_rows
  for select to authenticated using (exists (
    select 1 from public.ad_reports r
    where r.id = ad_rows.report_id and public.is_store_member(r.store_id)
  ));
