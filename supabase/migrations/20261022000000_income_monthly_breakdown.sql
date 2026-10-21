-- =============================================================================
-- Rincian penghasilan per bulan (untuk Bab 2 Rekap: dari omzet sampai uang masuk)
--
--   * income_monthly_breakdown : per toko per bulan cair, jumlah tiap kolom tabel income (PDF maupun
--     Excel), ditambah rincian dari income_orders (Excel "Sudah Dilepas"): harga produk, refund,
--     biaya admin dan biaya proses pesanan terpisah. orders_complete = rincian per pesanan bulan itu
--     lengkap (totalnya sama dengan uang cair harian), jadi boleh dipakai sebagai pengganti angka harian.
--
-- Hanya view baru; angka Rekap tidak berubah. security_invoker: ikut aturan baca tabel asalnya.
-- Aman dijalankan lebih dari sekali. Jalankan SETELAH 20261021000000_income_per_order_views.sql.
-- =============================================================================

create or replace view public.income_monthly_breakdown
with (security_invoker = true) as
with d as (
  select store_id,
         date_trunc('month', released_date)::date as month,
         sum(subtotal_pesanan)       as subtotal_pesanan,
         sum(subtotal_ongkir)        as subtotal_ongkir,
         sum(voucher_subsidi)        as voucher_subsidi,
         sum(biaya_platform)         as biaya_platform,
         sum(biaya_gratis_ongkir)    as biaya_gratis_ongkir,
         sum(biaya_layanan_tambahan) as biaya_layanan_tambahan,
         sum(total_income)           as total_income
  from public.income
  group by 1, 2
), o as (
  select store_id,
         date_trunc('month', released_date)::date as month,
         count(distinct order_no) as order_count,
         sum(harga_produk)        as harga_produk,
         sum(pengembalian_dana)   as pengembalian_dana,
         sum(biaya_admin)         as biaya_admin,
         sum(biaya_proses)        as biaya_proses,
         sum(total_income)        as total_income
  from public.income_orders
  group by 1, 2
)
select d.store_id,
       d.month,
       d.subtotal_pesanan,
       d.subtotal_ongkir,
       d.voucher_subsidi,
       d.biaya_platform,
       d.biaya_gratis_ongkir,
       d.biaya_layanan_tambahan,
       d.total_income,
       o.order_count,
       o.harga_produk,
       o.pengembalian_dana,
       o.biaya_admin,
       o.biaya_proses,
       coalesce(o.total_income = d.total_income, false) as orders_complete
from d
left join o on o.store_id = d.store_id and o.month = d.month;

revoke all on public.income_monthly_breakdown from anon;
grant select on public.income_monthly_breakdown to authenticated;
