-- =============================================================================
-- Semua status pesanan + tabel "Pesanan masuk"
--
-- Sebelumnya hanya pesanan Selesai yang disimpan. Sekarang semua status ikut
-- disimpan (dari export pesanan status "Semua"), dikelompokkan menjadi:
--   selesai = dihitung modal & profit (seperti sebelumnya)
--   proses  = belum selesai (perlu dikirim, sedang dikirim, dll.)
--   batal   = batal / belum bayar
-- Perhitungan profit TIDAK berubah: tetap hanya pesanan selesai, berdasarkan
-- tanggal selesai. Data baru dipakai untuk tabel "Pesanan masuk" (berdasarkan
-- tanggal pesanan dibuat) di halaman Rekap.
--
-- Aman dijalankan lebih dari sekali. Tidak menghapus data yang ada.
-- Jalankan SETELAH 20260930000000_init.sql dan 20261004000000_income_adjustments.sql.
-- =============================================================================

alter table public.order_items add column if not exists created_at timestamptz;
alter table public.order_items add column if not exists status_group text not null default 'selesai';
alter table public.order_items alter column completed_at drop not null;

do $$
begin
  alter table public.order_items
    add constraint order_items_status_group_check check (status_group in ('selesai', 'proses', 'batal'));
exception when duplicate_object then null;
end $$;

create index if not exists order_items_store_created_idx on public.order_items (store_id, created_at);

-- Data yang sudah ada: kelompokkan ulang dari kolom status. Perlu kalau aplikasi versi
-- baru sempat meng-upload pesanan batal/dikirim sebelum file ini dijalankan.
-- (Aturan sama dengan src/lib/shopeeColumns.ts: COMPLETED_STATUSES & CANCELLED_STATUS_KEYWORDS.)
update public.order_items
set status_group = case
      when lower(trim(status)) = 'selesai' then 'selesai'
      when lower(status) like '%batal%' or lower(status) like '%belum bayar%' then 'batal'
      else 'proses'
    end
where status_group is distinct from case
      when lower(trim(status)) = 'selesai' then 'selesai'
      when lower(status) like '%batal%' or lower(status) like '%belum bayar%' then 'batal'
      else 'proses'
    end;

-- -----------------------------------------------------------------------------
-- HPP dikunci saat item MENJADI selesai (bukan saat pertama di-upload), supaya
-- pesanan yang di-upload waktu masih "dikirim" tetap memakai HPP saat selesai.
-- -----------------------------------------------------------------------------
create or replace function public.order_items_lock_hpp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.recalc_hpp', true), '') = 'on' then
    return new; -- tombol "Hitung ulang HPP"
  end if;
  if tg_op = 'INSERT' then
    if new.status_group = 'selesai' then
      select p.hpp into new.hpp_snapshot
      from public.products p
      where p.store_id = new.store_id and p.sku = new.sku;
    else
      new.hpp_snapshot := null;
    end if;
  elsif new.status_group = 'selesai' and old.status_group is distinct from 'selesai' then
    select p.hpp into new.hpp_snapshot
    from public.products p
    where p.store_id = new.store_id and p.sku = new.sku;
  else
    -- Upload ulang / update biasa tidak boleh mengubah HPP yang sudah terkunci.
    new.hpp_snapshot := old.hpp_snapshot;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Upload: semua status
-- -----------------------------------------------------------------------------
drop function if exists public.order_items_from_json(jsonb);

-- p_items: array JSON berisi objek
--   { order_no, sku, sku_source, product_name, variant_name, qty, returned_qty,
--     status, status_group, return_status, completed_at, created_at, subtotal }
create function public.order_items_from_json(p_items jsonb)
returns table (
  order_no text, sku text, sku_source text, product_name text, variant_name text,
  qty integer, returned_qty integer, status text, status_group text, return_status text,
  completed_at timestamptz, created_at timestamptz, subtotal bigint
)
language sql
immutable
set search_path = ''
as $$
  select
    x.order_no,
    x.sku,
    coalesce(min(x.sku_source), 'sku'),
    min(x.product_name),
    coalesce(min(x.variant_name), ''),
    sum(x.qty)::integer,
    coalesce(sum(x.returned_qty), 0)::integer,
    min(x.status),
    -- Klien lama tidak mengirim status_group; dulu hanya pesanan selesai yang dikirim.
    coalesce(min(x.status_group), 'selesai'),
    coalesce(max(x.return_status), ''),
    max(x.completed_at),
    min(x.created_at),
    coalesce(sum(x.subtotal), 0)::bigint
  from jsonb_to_recordset(p_items) as x (
    order_no text, sku text, sku_source text, product_name text,
    variant_name text, qty integer, returned_qty integer, status text, status_group text,
    return_status text, completed_at timestamptz, created_at timestamptz, subtotal bigint
  )
  group by x.order_no, x.sku
$$;

revoke execute on function public.order_items_from_json(jsonb) from public, anon;
grant execute on function public.order_items_from_json(jsonb) to authenticated;

create or replace function public.upsert_order_items(p_store_id bigint, p_items jsonb)
returns table (inserted integer, updated integer, unchanged integer, new_products integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ins integer;
  v_upd integer;
  v_rows integer;
  v_new_products integer;
begin
  select count(*) into v_rows from public.order_items_from_json(p_items);

  -- SKU baru otomatis masuk ke master produk dengan HPP kosong
  -- (kecuali dari pesanan batal, supaya halaman HPP tidak penuh produk yang tidak terjual).
  insert into public.products (store_id, sku, sku_source, product_name, variant_name)
  select distinct on (s.sku) p_store_id, s.sku, s.sku_source,
         s.product_name, s.variant_name
  from public.order_items_from_json(p_items) s
  where s.status_group <> 'batal'
  order by s.sku
  on conflict (store_id, sku) do nothing;
  get diagnostics v_new_products = row_count;

  with src as (
    select s.*,
           coalesce(s.created_at, o.created_at) as created_at_eff
    from public.order_items_from_json(p_items) s
    left join public.order_items o
      on o.store_id = p_store_id and o.order_no = s.order_no and o.sku = s.sku
    -- Export lama yang masih "dikirim" tidak boleh menimpa data yang sudah selesai.
    -- (o.* NULL untuk pesanan baru, jadi pakai IS DISTINCT FROM.)
    where o.status_group is distinct from 'selesai' or s.status_group = 'selesai'
  ), up as (
    insert into public.order_items as oi (
      store_id, order_no, sku, product_name, variant_name, qty, returned_qty,
      status, status_group, return_status, completed_at, created_at, subtotal
    )
    select p_store_id, s.order_no, s.sku, s.product_name, s.variant_name, s.qty,
           s.returned_qty, s.status, s.status_group, s.return_status, s.completed_at,
           s.created_at_eff, s.subtotal
    from src s
    on conflict (store_id, order_no, sku) do update set
      product_name  = excluded.product_name,
      variant_name  = excluded.variant_name,
      qty           = excluded.qty,
      returned_qty  = excluded.returned_qty,
      status        = excluded.status,
      status_group  = excluded.status_group,
      return_status = excluded.return_status,
      completed_at  = coalesce(excluded.completed_at, oi.completed_at),
      created_at    = excluded.created_at,
      subtotal      = excluded.subtotal,
      uploaded_by   = auth.uid(),
      uploaded_at   = now()
    -- Data identik tidak di-update, supaya bisa dihitung sebagai "tidak berubah".
    where (oi.product_name, oi.variant_name, oi.qty, oi.returned_qty, oi.status,
           oi.status_group, oi.return_status, oi.completed_at, oi.created_at, oi.subtotal)
          is distinct from
          (excluded.product_name, excluded.variant_name, excluded.qty,
           excluded.returned_qty, excluded.status, excluded.status_group,
           excluded.return_status, coalesce(excluded.completed_at, oi.completed_at),
           excluded.created_at, excluded.subtotal)
    returning (xmax = 0) as is_insert
  )
  select count(*) filter (where is_insert), count(*) filter (where not is_insert)
  into v_ins, v_upd
  from up;

  return query select v_ins, v_upd, v_rows - v_ins - v_upd, v_new_products;
end;
$$;

create or replace function public.recalc_hpp(
  p_store_id bigint,
  p_month date,
  p_only_missing boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform set_config('app.recalc_hpp', 'on', true);

  update public.order_items oi
  set hpp_snapshot = p.hpp
  from public.products p
  where p.store_id = oi.store_id
    and p.sku = oi.sku
    and oi.store_id = p_store_id
    and oi.status_group = 'selesai'
    and public.wib_month(oi.completed_at) = date_trunc('month', p_month)::date
    and (not p_only_missing or oi.hpp_snapshot is null)
    and oi.hpp_snapshot is distinct from p.hpp;
  get diagnostics v_count = row_count;

  perform set_config('app.recalc_hpp', 'off', true);
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- View profit: hanya pesanan selesai (sama seperti sebelumnya)
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
  select store_id,
         public.wib_month(completed_at) as month,
         sum((qty - returned_qty) * hpp_snapshot) as total_modal,
         sum(qty - returned_qty) as total_qty,
         count(*) filter (where hpp_snapshot is null and qty - returned_qty > 0)
           as items_missing_hpp
  from public.order_items
  where status_group = 'selesai' and completed_at is not null
  group by 1, 2
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
       t.adjustments
from totals t
join public.stores s on s.id = t.store_id;

create or replace view public.product_monthly_recap
with (security_invoker = true) as
select store_id,
       public.wib_month(completed_at) as month,
       sku,
       min(product_name) as product_name,
       min(variant_name) as variant_name,
       sum(qty - returned_qty) as qty_sold,
       sum(returned_qty)       as qty_returned,
       sum((qty - returned_qty) * hpp_snapshot) as total_modal,
       bool_or(hpp_snapshot is null and qty - returned_qty > 0) as missing_hpp
from public.order_items
where status_group = 'selesai' and completed_at is not null
group by store_id, public.wib_month(completed_at), sku;

create or replace view public.daily_reconciliation
with (security_invoker = true) as
with inc as (
  select store_id, released_date as day, subtotal_pesanan, total_income
  from public.income
), ord as (
  select store_id,
         (completed_at at time zone 'Asia/Jakarta')::date as day,
         sum(subtotal) as orders_subtotal,
         count(distinct order_no) as order_count
  from public.order_items
  where status_group = 'selesai' and completed_at is not null
  group by 1, 2
)
select coalesce(inc.store_id, ord.store_id) as store_id,
       coalesce(inc.day, ord.day)           as day,
       date_trunc('month', coalesce(inc.day, ord.day))::date as month,
       coalesce(inc.subtotal_pesanan, 0)    as income_subtotal,
       coalesce(inc.total_income, 0)        as total_income,
       coalesce(ord.orders_subtotal, 0)     as orders_subtotal,
       coalesce(ord.order_count, 0)         as order_count,
       coalesce(inc.subtotal_pesanan, 0) - coalesce(ord.orders_subtotal, 0) as difference,
       inc.store_id is not null             as has_income,
       ord.store_id is not null             as has_orders
from inc
full join ord on ord.store_id = inc.store_id and ord.day = inc.day;

-- -----------------------------------------------------------------------------
-- Pesanan masuk: per toko, per bulan pesanan DIBUAT, per kelompok status.
-- Modal memakai HPP terkunci kalau ada, kalau belum pakai HPP saat ini (perkiraan).
-- -----------------------------------------------------------------------------
create or replace view public.orders_by_created
with (security_invoker = true) as
select oi.store_id,
       public.wib_month(oi.created_at) as month,
       oi.status_group,
       count(distinct oi.order_no) as order_count,
       sum(oi.qty)                 as qty,
       sum(oi.returned_qty)        as qty_returned,
       sum(oi.subtotal)            as subtotal,
       sum(oi.qty * coalesce(oi.hpp_snapshot, p.hpp))          as modal,
       sum(oi.returned_qty * coalesce(oi.hpp_snapshot, p.hpp)) as modal_returned,
       count(*) filter (where coalesce(oi.hpp_snapshot, p.hpp) is null and oi.qty > 0
                          and oi.status_group <> 'batal') as items_missing_hpp
from public.order_items oi
left join public.products p on p.store_id = oi.store_id and p.sku = oi.sku
where oi.created_at is not null
group by oi.store_id, public.wib_month(oi.created_at), oi.status_group;

revoke all on public.monthly_recap, public.product_monthly_recap, public.daily_reconciliation,
              public.orders_by_created
  from anon;
grant select on public.monthly_recap, public.product_monthly_recap, public.daily_reconciliation,
                public.orders_by_created
  to authenticated;
