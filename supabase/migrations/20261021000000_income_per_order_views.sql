-- =============================================================================
-- Memakai penghasilan per pesanan (income_orders, dari Excel "Sudah Dilepas")
--
--   * order_item_income       : uang masuk ASLI per item pesanan selesai. Uang satu pesanan dibagi ke
--                               item-itemnya sesuai nilai penjualan yang tidak diretur (subtotal × qty
--                               bersih ÷ qty). Pesanan 1 produk (hampir semua) = angka persis.
--   * product_monthly_recap   : kolom baru di akhir: uang masuk asli per produk + modal dan qty dari
--                               barang yang uangnya sudah ada, supaya untung per produk bisa dihitung.
--   * income_order_match      : per pesanan yang uangnya cair: ada di export pesanan sebagai Selesai,
--                               ada tapi belum Selesai (export lama), atau tidak ada sama sekali.
--   * income_product_monthly  : potongan Shopee asli per ID Produk per bulan cair (tanpa pesanan yang
--                               di-refund), untuk analisis iklan per Kode Produk.
--
-- Untung bersih bulanan (monthly_recap) TIDAK berubah.
-- Semua view memakai security_invoker: ikut aturan baca tabel asalnya (anggota toko).
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data.
-- Jalankan SETELAH 20261020000000_income_orders.sql.
-- =============================================================================

create or replace view public.order_item_income
with (security_invoker = true) as
with inc as (
  select store_id, order_no,
         sum(total_income)  as total_income,
         min(released_date) as released_date
  from public.income_orders
  group by store_id, order_no
), items as (
  select oi.id, oi.store_id, oi.order_no, oi.sku, oi.subtotal, oi.qty, oi.returned_qty,
         oi.completed_at, oi.created_at,
         case when oi.qty > 0 then oi.subtotal * (oi.qty - oi.returned_qty)::numeric / oi.qty else 0 end as weight
  from public.order_items oi
  where oi.status_group = 'selesai'
), w as (
  select i.*,
         sum(i.weight)   over (partition by i.store_id, i.order_no) as order_weight,
         sum(i.subtotal) over (partition by i.store_id, i.order_no) as order_subtotal,
         count(*)        over (partition by i.store_id, i.order_no) as order_items
  from items i
)
select w.id as order_item_id,
       w.store_id,
       w.order_no,
       w.sku,
       w.completed_at,
       w.created_at,
       inc.released_date,
       inc.total_income
         * case when w.order_weight > 0   then w.weight / w.order_weight
                when w.order_subtotal > 0 then w.subtotal::numeric / w.order_subtotal
                else 1.0 / w.order_items end as income
from w
join inc on inc.store_id = w.store_id and inc.order_no = w.order_no;

-- -----------------------------------------------------------------------------
-- Rekap per produk: sama dengan 20261015000000_store_settings.sql, ditambah 5 kolom di akhir.
-- -----------------------------------------------------------------------------
create or replace view public.product_monthly_recap
with (security_invoker = true) as
select oi.store_id,
       public.wib_month(oi.completed_at) as month,
       oi.sku,
       min(oi.product_name) as product_name,
       min(oi.variant_name) as variant_name,
       sum(oi.qty - oi.returned_qty) as qty_sold,
       sum(oi.returned_qty)          as qty_returned,
       -- Sama dengan monthly_recap: ikut menghitung barang retur yang tidak bisa dijual lagi.
       sum((oi.qty - oi.returned_qty) * oi.hpp_snapshot
           + oi.returned_qty * oi.hpp_snapshot * (1 - coalesce(ss.return_recovery_pct, 100) / 100.0)) as total_modal,
       bool_or(oi.hpp_snapshot is null
               and (oi.qty - oi.returned_qty > 0
                    or (oi.returned_qty > 0 and coalesce(ss.return_recovery_pct, 100) < 100))) as missing_hpp,
       -- Baru: uang masuk asli (hanya item yang pesanannya ada di Excel "Sudah Dilepas").
       count(*)                                        as item_count,
       count(oii.order_item_id)                        as items_with_income,
       round(sum(oii.income))                          as income,
       sum(oi.qty - oi.returned_qty) filter (where oii.order_item_id is not null) as qty_with_income,
       sum((oi.qty - oi.returned_qty) * oi.hpp_snapshot
           + oi.returned_qty * oi.hpp_snapshot * (1 - coalesce(ss.return_recovery_pct, 100) / 100.0))
         filter (where oii.order_item_id is not null) as modal_with_income
from public.order_items oi
left join public.store_settings ss on ss.store_id = oi.store_id
left join public.order_item_income oii on oii.store_id = oi.store_id and oii.order_item_id = oi.id
where oi.status_group = 'selesai' and oi.completed_at is not null
group by oi.store_id, public.wib_month(oi.completed_at), oi.sku;

-- -----------------------------------------------------------------------------
-- Pesanan yang uangnya cair, dicocokkan dengan export pesanan.
-- -----------------------------------------------------------------------------
create or replace view public.income_order_match
with (security_invoker = true) as
select io.store_id,
       io.order_no,
       min(io.released_date)                                as released_date,
       date_trunc('month', min(io.released_date))::date     as month,
       sum(io.total_income)                                 as total_income,
       case
         when not exists (select 1 from public.order_items oi
                          where oi.store_id = io.store_id and oi.order_no = io.order_no) then 'tidak_ada'
         when not exists (select 1 from public.order_items oi
                          where oi.store_id = io.store_id and oi.order_no = io.order_no
                            and oi.status_group = 'selesai') then 'belum_selesai'
         else 'cocok'
       end as match
from public.income_orders io
group by io.store_id, io.order_no;

-- -----------------------------------------------------------------------------
-- Potongan asli per ID Produk per bulan cair. Pesanan dengan refund tidak diikutkan, supaya
-- potongan tidak terlihat 100% karena uangnya dikembalikan ke pembeli.
-- -----------------------------------------------------------------------------
create or replace view public.income_product_monthly
with (security_invoker = true) as
select store_id,
       date_trunc('month', released_date)::date as month,
       product_id,
       min(product_name)      as product_name,
       count(*)               as lines,
       sum(harga_produk)      as harga_produk,
       sum(total_income)      as total_income
from public.income_orders
where product_id <> '' and pengembalian_dana = 0
group by store_id, date_trunc('month', released_date), product_id;

revoke all on public.order_item_income, public.income_order_match, public.income_product_monthly from anon;
grant select on public.order_item_income, public.income_order_match, public.income_product_monthly to authenticated;
revoke all on public.product_monthly_recap from anon;
grant select on public.product_monthly_recap to authenticated;
