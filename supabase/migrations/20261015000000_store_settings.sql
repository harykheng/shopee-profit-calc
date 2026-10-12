-- =============================================================================
-- Pengaturan hitungan per toko (store_settings)
--
-- Tiga angka yang sebelumnya tertanam di kode, sekarang bisa diubah tiap toko:
--
--   * ads_target_profit_pct   : untung yang diinginkan SETELAH iklan, % dari harga jual
--                               (bawaan 5). Dipakai saran target ROAS dan verdict halaman Iklan.
--   * price_target_margin_pct : untung yang diinginkan dari harga jual SEBELUM iklan
--                               (bawaan 20). Dipakai saran harga.
--   * return_recovery_pct     : dari barang yang diretur pembeli, berapa persen yang bisa dijual
--                               lagi (bawaan 100 = semua kembali ke stok, modalnya tidak hilang).
--                               Di bawah 100, sisanya dihitung sebagai kerugian modal di
--                               monthly_recap dan product_monthly_recap.
--
-- Kolom kosong (null) atau tidak ada baris = bawaan, jadi angka toko yang ada TIDAK berubah
-- sebelum pelanggan mengubah pengaturannya.
--
-- Pengaturan retur berlaku untuk semua bulan sekaligus: view dihitung ulang setiap dibaca.
--
-- Aturan akses sama dengan tabel data lain (20261012, 20261013): anggota toko boleh MEMBACA kapan
-- saja, MENULIS hanya kalau langganan aktif.
--
-- monthly_recap mendapat kolom baru di akhir: returned_loss (modal barang retur yang hilang).
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data yang ada.
-- =============================================================================

create table if not exists public.store_settings (
  store_id                bigint primary key references public.stores (id) on delete cascade,
  ads_target_profit_pct   numeric(5, 2) check (ads_target_profit_pct is null or (ads_target_profit_pct >= 0 and ads_target_profit_pct <= 50)),
  price_target_margin_pct numeric(5, 2) check (price_target_margin_pct is null or (price_target_margin_pct >= 0 and price_target_margin_pct <= 90)),
  return_recovery_pct     numeric(5, 2) check (return_recovery_pct is null or (return_recovery_pct >= 0 and return_recovery_pct <= 100)),
  updated_at              timestamptz not null default now()
);

drop trigger if exists store_settings_set_updated_at on public.store_settings;
create trigger store_settings_set_updated_at
  before update on public.store_settings
  for each row execute function public.set_updated_at();

alter table public.store_settings enable row level security;

revoke all on public.store_settings from anon;
grant select, insert, update, delete on public.store_settings to authenticated;

drop policy if exists "anggota: baca" on public.store_settings;
create policy "anggota: baca" on public.store_settings
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "anggota aktif: akses penuh" on public.store_settings;
create policy "anggota aktif: akses penuh" on public.store_settings
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));

-- -----------------------------------------------------------------------------
-- View: modal ikut menghitung barang retur yang tidak bisa dijual lagi
-- (turunan dari 20261005000000_all_order_statuses.sql; hanya bagian modal yang berubah)
-- -----------------------------------------------------------------------------

create or replace view public.monthly_recap
with (security_invoker = true) as
with inc as (
  select store_id,
         date_trunc('month', released_date)::date as month,
         sum(total_income)     as total_income,
         sum(subtotal_pesanan) as subtotal_pesanan
  from public.income
  group by 1, 2
), adj as (
  select store_id,
         date_trunc('month', released_date)::date as month,
         sum(amount) as adjustments
  from public.income_adjustments
  group by 1, 2
), modal as (
  -- Modal = barang yang tidak diretur + bagian barang retur yang TIDAK bisa dijual lagi
  -- (store_settings.return_recovery_pct; kosong = 100% kembali, jadi hasilnya sama seperti dulu).
  select oi.store_id,
         public.wib_month(oi.completed_at) as month,
         sum((oi.qty - oi.returned_qty) * oi.hpp_snapshot
             + oi.returned_qty * oi.hpp_snapshot * (1 - coalesce(ss.return_recovery_pct, 100) / 100.0))
           as total_modal,
         sum(oi.returned_qty * oi.hpp_snapshot * (1 - coalesce(ss.return_recovery_pct, 100) / 100.0))
           as returned_loss,
         sum(oi.qty - oi.returned_qty) as total_qty,
         count(*) filter (where oi.hpp_snapshot is null and oi.qty - oi.returned_qty > 0)
           as items_missing_hpp
  from public.order_items oi
  left join public.store_settings ss on ss.store_id = oi.store_id
  where oi.status_group = 'selesai' and oi.completed_at is not null
  group by oi.store_id, public.wib_month(oi.completed_at)
), exp as (
  select store_id, month,
         sum(amount) as total_expenses,
         sum(amount) filter (where category = 'iklan_shopee') as iklan_shopee,
         sum(amount) filter (where category = 'meta_ads')     as meta_ads,
         sum(amount) filter (where category = 'packaging')    as packaging,
         sum(amount) filter (where category = 'lain_lain')    as lain_lain,
         -- > 0 berarti biaya bulan ini sudah pernah disimpan (walau nominalnya 0).
         count(*)                                              as expense_entries
  from public.expenses
  group by 1, 2
), months as (
  select store_id, month from inc
  union
  select store_id, month from adj
  union
  select store_id, month from modal
  union
  select store_id, month from exp
), totals as (
  select m.store_id, m.month,
         coalesce(inc.total_income, 0)     as income_released,
         coalesce(adj.adjustments, 0)      as adjustments,
         coalesce(inc.total_income, 0) + coalesce(adj.adjustments, 0) as total_income,
         coalesce(inc.subtotal_pesanan, 0) as subtotal_pesanan,
         coalesce(modal.total_modal, 0)    as total_modal,
         coalesce(modal.returned_loss, 0)  as returned_loss,
         coalesce(modal.total_qty, 0)      as total_qty,
         coalesce(modal.items_missing_hpp, 0) as items_missing_hpp,
         coalesce(exp.total_expenses, 0)   as total_expenses,
         coalesce(exp.iklan_shopee, 0)     as iklan_shopee,
         coalesce(exp.meta_ads, 0)         as meta_ads,
         coalesce(exp.packaging, 0)        as packaging,
         coalesce(exp.lain_lain, 0)        as lain_lain,
         coalesce(exp.expense_entries, 0)  as expense_entries
  from months m
  left join inc   using (store_id, month)
  left join adj   using (store_id, month)
  left join modal using (store_id, month)
  left join exp   using (store_id, month)
)
select t.store_id,
       s.name as store_name,
       t.month,
       t.total_income,
       t.subtotal_pesanan,
       t.total_modal,
       t.total_expenses,
       t.iklan_shopee,
       t.meta_ads,
       t.packaging,
       t.lain_lain,
       t.total_income - t.total_modal - t.total_expenses as net_profit,
       case when t.total_income > 0
            then round((t.total_income - t.total_modal - t.total_expenses) * 100.0
                       / t.total_income, 2)
       end as margin_pct,
       t.total_qty,
       t.items_missing_hpp,
       t.expense_entries,
       t.income_released,
       t.adjustments,
       t.returned_loss
from totals t
join public.stores s on s.id = t.store_id;

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
       bool_or(oi.hpp_snapshot is null and oi.qty - oi.returned_qty > 0) as missing_hpp
from public.order_items oi
left join public.store_settings ss on ss.store_id = oi.store_id
where oi.status_group = 'selesai' and oi.completed_at is not null
group by oi.store_id, public.wib_month(oi.completed_at), oi.sku;
