-- =============================================================================
-- Kalkulator Profit Bersih Shopee — skema awal
--
-- Catatan desain:
-- * Basis periode: tanggal dana dilepas. Di Shopee dana dilepas di hari yang
--   sama dengan "Waktu Pesanan Selesai", jadi modal per bulan dihitung dari
--   item yang selesai di bulan itu, dan penghasilan dari laporan PDF bulanan
--   (total per tanggal dana dilepas).
-- * Semua waktu dari export Shopee adalah WIB; bulan dihitung di Asia/Jakarta.
-- * Uang dalam Rupiah bulat (bigint). HPP numeric supaya boleh ada sen.
-- * TIDAK ADA kolom data pribadi pembeli di skema ini, dan memang tidak boleh
--   ditambahkan.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper
-- -----------------------------------------------------------------------------

-- Bulan (tanggal 1) dari sebuah waktu, menurut zona WIB.
create or replace function public.wib_month(ts timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select date_trunc('month', ts at time zone 'Asia/Jakarta')::date
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tabel
-- -----------------------------------------------------------------------------

create table public.stores (
  id   bigint generated always as identity primary key,
  name text not null unique
);

insert into public.stores (name) values
  ('Harel Beauty'),
  ('Oraiste Beauty House');

create table public.products (
  id           bigint generated always as identity primary key,
  store_id     bigint not null references public.stores (id) on delete restrict,
  -- Kunci produk. Urutan sumber: Nomor Referensi SKU → SKU Induk + Nama Variasi
  -- → Nama Produk + Nama Variasi (lihat src/lib/shopeeColumns.ts).
  sku          text not null check (length(trim(sku)) > 0),
  -- 'sku' | 'sku_induk' | 'nama' — dipakai untuk menampilkan peringatan.
  sku_source   text not null default 'sku'
               check (sku_source in ('sku', 'sku_induk', 'nama')),
  product_name text not null,
  variant_name text not null default '',
  hpp          numeric(14, 2) check (hpp is null or hpp >= 0),
  updated_at   timestamptz not null default now(),
  unique (store_id, sku)
);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create table public.order_items (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references public.stores (id) on delete restrict,
  order_no      text not null,
  sku           text not null,
  product_name  text not null,
  variant_name  text not null default '',
  qty           integer not null check (qty >= 0),
  returned_qty  integer not null default 0 check (returned_qty >= 0),
  status        text not null,
  -- Isi kolom "Status Pembatalan/ Pengembalian" (mis. 'Permintaan Disetujui').
  return_status text not null default '',
  completed_at  timestamptz,
  -- "Subtotal Pesanan" per item, untuk dicocokkan dengan PDF per hari.
  subtotal      bigint not null default 0,
  -- Diisi otomatis oleh trigger dari products.hpp saat baris pertama kali
  -- disimpan, lalu dikunci. Hanya berubah lewat public.recalc_hpp().
  hpp_snapshot  numeric(14, 2),
  uploaded_by   uuid default auth.uid() references auth.users (id) on delete set null,
  uploaded_at   timestamptz not null default now(),
  unique (store_id, order_no, sku),
  check (returned_qty <= qty)
);

create index order_items_store_completed_idx
  on public.order_items (store_id, completed_at);

-- Penghasilan dari PDF "Catatan Transaksi Penghasilan": satu baris per toko
-- per tanggal dana dilepas (tabel "Rincian Dana Dilepaskan").
create table public.income (
  id                     bigint generated always as identity primary key,
  store_id               bigint not null references public.stores (id) on delete restrict,
  released_date          date not null,
  subtotal_pesanan       bigint not null default 0,
  subtotal_ongkir        bigint not null default 0,
  voucher_subsidi        bigint not null default 0,
  biaya_platform         bigint not null default 0,
  biaya_gratis_ongkir    bigint not null default 0,
  biaya_layanan_tambahan bigint not null default 0,
  total_income           bigint not null,
  uploaded_by            uuid default auth.uid() references auth.users (id) on delete set null,
  uploaded_at            timestamptz not null default now(),
  unique (store_id, released_date)
);

create table public.expenses (
  id         bigint generated always as identity primary key,
  store_id   bigint not null references public.stores (id) on delete restrict,
  month      date not null check (extract(day from month) = 1),
  category   text not null
             check (category in ('iklan_shopee', 'meta_ads', 'packaging', 'lain_lain')),
  amount     bigint not null default 0 check (amount >= 0),
  note       text not null default '',
  updated_at timestamptz not null default now(),
  unique (store_id, month, category)
);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- HPP dikunci saat upload
-- -----------------------------------------------------------------------------

create or replace function public.order_items_lock_hpp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Selalu ambil dari master produk, abaikan nilai dari klien.
    select p.hpp into new.hpp_snapshot
    from public.products p
    where p.store_id = new.store_id and p.sku = new.sku;
  elsif coalesce(current_setting('app.recalc_hpp', true), '') <> 'on' then
    -- Upload ulang / update biasa tidak boleh mengubah HPP yang sudah terkunci.
    new.hpp_snapshot := old.hpp_snapshot;
  end if;
  return new;
end;
$$;

create trigger order_items_lock_hpp
  before insert or update on public.order_items
  for each row execute function public.order_items_lock_hpp();

-- -----------------------------------------------------------------------------
-- RPC upload (anti-duplikat + hitung baris baru / di-update / tidak berubah)
-- -----------------------------------------------------------------------------

-- Ubah array JSON dari parser menjadi baris; baris kembar (no. pesanan + SKU
-- sama) dalam satu file digabung.
-- p_items: array JSON berisi objek
--   { order_no, sku, sku_source, product_name, variant_name, qty, returned_qty,
--     status, return_status, completed_at, subtotal }
create or replace function public.order_items_from_json(p_items jsonb)
returns table (
  order_no text, sku text, sku_source text, product_name text, variant_name text,
  qty integer, returned_qty integer, status text, return_status text,
  completed_at timestamptz, subtotal bigint
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
    coalesce(max(x.return_status), ''),
    max(x.completed_at),
    coalesce(sum(x.subtotal), 0)::bigint
  from jsonb_to_recordset(p_items) as x (
    order_no text, sku text, sku_source text, product_name text,
    variant_name text, qty integer, returned_qty integer, status text,
    return_status text, completed_at timestamptz, subtotal bigint
  )
  group by x.order_no, x.sku
$$;

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

  -- SKU baru otomatis masuk ke master produk dengan HPP kosong.
  insert into public.products (store_id, sku, sku_source, product_name, variant_name)
  select distinct on (s.sku) p_store_id, s.sku, s.sku_source,
         s.product_name, s.variant_name
  from public.order_items_from_json(p_items) s
  order by s.sku
  on conflict (store_id, sku) do nothing;
  get diagnostics v_new_products = row_count;

  with up as (
    insert into public.order_items as oi (
      store_id, order_no, sku, product_name, variant_name, qty, returned_qty,
      status, return_status, completed_at, subtotal
    )
    select p_store_id, s.order_no, s.sku, s.product_name, s.variant_name, s.qty,
           s.returned_qty, s.status, s.return_status, s.completed_at, s.subtotal
    from public.order_items_from_json(p_items) s
    on conflict (store_id, order_no, sku) do update set
      product_name  = excluded.product_name,
      variant_name  = excluded.variant_name,
      qty           = excluded.qty,
      returned_qty  = excluded.returned_qty,
      status        = excluded.status,
      return_status = excluded.return_status,
      completed_at  = excluded.completed_at,
      subtotal      = excluded.subtotal,
      uploaded_by   = auth.uid(),
      uploaded_at   = now()
    -- Data identik tidak di-update, supaya bisa dihitung sebagai "tidak berubah".
    where (oi.product_name, oi.variant_name, oi.qty, oi.returned_qty, oi.status,
           oi.return_status, oi.completed_at, oi.subtotal)
          is distinct from
          (excluded.product_name, excluded.variant_name, excluded.qty,
           excluded.returned_qty, excluded.status, excluded.return_status,
           excluded.completed_at, excluded.subtotal)
    returning (xmax = 0) as is_insert
  )
  select count(*) filter (where is_insert), count(*) filter (where not is_insert)
  into v_ins, v_upd
  from up;

  return query select v_ins, v_upd, v_rows - v_ins - v_upd, v_new_products;
end;
$$;

-- p_rows: array JSON berisi objek
--   { released_date, subtotal_pesanan, subtotal_ongkir, voucher_subsidi,
--     biaya_platform, biaya_gratis_ongkir, biaya_layanan_tambahan, total_income }
create or replace function public.upsert_income(p_store_id bigint, p_rows jsonb)
returns table (inserted integer, updated integer, unchanged integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ins integer;
  v_upd integer;
  v_rows integer;
begin
  select count(distinct x.released_date) into v_rows
  from jsonb_to_recordset(p_rows) as x (released_date date);

  with src as (
    select distinct on (x.released_date) x.*
    from jsonb_to_recordset(p_rows) as x (
      released_date date, subtotal_pesanan bigint, subtotal_ongkir bigint,
      voucher_subsidi bigint, biaya_platform bigint, biaya_gratis_ongkir bigint,
      biaya_layanan_tambahan bigint, total_income bigint
    )
    order by x.released_date
  ), up as (
    insert into public.income as i (
      store_id, released_date, subtotal_pesanan, subtotal_ongkir, voucher_subsidi,
      biaya_platform, biaya_gratis_ongkir, biaya_layanan_tambahan, total_income
    )
    select p_store_id, s.released_date,
           coalesce(s.subtotal_pesanan, 0), coalesce(s.subtotal_ongkir, 0),
           coalesce(s.voucher_subsidi, 0), coalesce(s.biaya_platform, 0),
           coalesce(s.biaya_gratis_ongkir, 0), coalesce(s.biaya_layanan_tambahan, 0),
           s.total_income
    from src s
    on conflict (store_id, released_date) do update set
      subtotal_pesanan       = excluded.subtotal_pesanan,
      subtotal_ongkir        = excluded.subtotal_ongkir,
      voucher_subsidi        = excluded.voucher_subsidi,
      biaya_platform         = excluded.biaya_platform,
      biaya_gratis_ongkir    = excluded.biaya_gratis_ongkir,
      biaya_layanan_tambahan = excluded.biaya_layanan_tambahan,
      total_income           = excluded.total_income,
      uploaded_by            = auth.uid(),
      uploaded_at            = now()
    where (i.subtotal_pesanan, i.subtotal_ongkir, i.voucher_subsidi, i.biaya_platform,
           i.biaya_gratis_ongkir, i.biaya_layanan_tambahan, i.total_income)
          is distinct from
          (excluded.subtotal_pesanan, excluded.subtotal_ongkir, excluded.voucher_subsidi,
           excluded.biaya_platform, excluded.biaya_gratis_ongkir,
           excluded.biaya_layanan_tambahan, excluded.total_income)
    returning (xmax = 0) as is_insert
  )
  select count(*) filter (where is_insert), count(*) filter (where not is_insert)
  into v_ins, v_upd
  from up;

  return query select v_ins, v_upd, v_rows - v_ins - v_upd;
end;
$$;

-- Tombol "Hitung ulang HPP": perbarui hpp_snapshot item yang selesai di bulan
-- p_month (tanggal 1) memakai HPP terkini. p_only_missing = true hanya mengisi
-- item yang HPP-nya masih kosong. Mengembalikan jumlah item yang berubah.
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
    and public.wib_month(oi.completed_at) = date_trunc('month', p_month)::date
    and (not p_only_missing or oi.hpp_snapshot is null)
    and oi.hpp_snapshot is distinct from p.hpp;
  get diagnostics v_count = row_count;

  perform set_config('app.recalc_hpp', 'off', true);
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- View rekap
-- -----------------------------------------------------------------------------

-- Rekap per toko per bulan.
-- total_modal hanya menjumlah item yang punya HPP; items_missing_hpp > 0 berarti
-- profit bulan itu belum akurat.
create view public.monthly_recap
with (security_invoker = true) as
with inc as (
  select store_id,
         date_trunc('month', released_date)::date as month,
         sum(total_income)     as total_income,
         sum(subtotal_pesanan) as subtotal_pesanan
  from public.income
  group by 1, 2
), modal as (
  select store_id,
         public.wib_month(completed_at) as month,
         sum((qty - returned_qty) * hpp_snapshot) as total_modal,
         sum(qty - returned_qty) as total_qty,
         count(*) filter (where hpp_snapshot is null and qty - returned_qty > 0)
           as items_missing_hpp
  from public.order_items
  where status = 'Selesai' and completed_at is not null
  group by 1, 2
), exp as (
  select store_id, month,
         sum(amount) as total_expenses,
         sum(amount) filter (where category = 'iklan_shopee') as iklan_shopee,
         sum(amount) filter (where category = 'meta_ads')     as meta_ads,
         sum(amount) filter (where category = 'packaging')    as packaging,
         sum(amount) filter (where category = 'lain_lain')    as lain_lain
  from public.expenses
  group by 1, 2
), months as (
  select store_id, month from inc
  union
  select store_id, month from modal
  union
  select store_id, month from exp
), totals as (
  select m.store_id, m.month,
         coalesce(inc.total_income, 0)     as total_income,
         coalesce(inc.subtotal_pesanan, 0) as subtotal_pesanan,
         coalesce(modal.total_modal, 0)    as total_modal,
         coalesce(modal.total_qty, 0)      as total_qty,
         coalesce(modal.items_missing_hpp, 0) as items_missing_hpp,
         coalesce(exp.total_expenses, 0)   as total_expenses,
         coalesce(exp.iklan_shopee, 0)     as iklan_shopee,
         coalesce(exp.meta_ads, 0)         as meta_ads,
         coalesce(exp.packaging, 0)        as packaging,
         coalesce(exp.lain_lain, 0)        as lain_lain
  from months m
  left join inc   using (store_id, month)
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
       t.items_missing_hpp
from totals t
join public.stores s on s.id = t.store_id;

-- Rekap per produk per bulan: qty terjual (setelah retur) dan total modal.
create view public.product_monthly_recap
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
where status = 'Selesai' and completed_at is not null
group by store_id, public.wib_month(completed_at), sku;

-- Pencocokan per hari: subtotal di PDF penghasilan vs subtotal item yang
-- selesai di hari itu. Selisih ≠ 0 berarti ada pesanan yang belum di-upload
-- (biasanya dari export bulan sebelumnya) atau ada refund.
create view public.daily_reconciliation
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
  where status = 'Selesai' and completed_at is not null
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
-- Keamanan: RLS + hak akses
-- Hanya user yang login (role authenticated) yang bisa baca/tulis. Semua user
-- bisa akses kedua toko. Signup publik dimatikan dari dashboard Supabase.
-- -----------------------------------------------------------------------------

alter table public.stores      enable row level security;
alter table public.products    enable row level security;
alter table public.order_items enable row level security;
alter table public.income      enable row level security;
alter table public.expenses    enable row level security;

create policy "login: baca toko" on public.stores
  for select to authenticated using (true);

create policy "login: akses penuh" on public.products
  for all to authenticated using (true) with check (true);

create policy "login: akses penuh" on public.order_items
  for all to authenticated using (true) with check (true);

create policy "login: akses penuh" on public.income
  for all to authenticated using (true) with check (true);

create policy "login: akses penuh" on public.expenses
  for all to authenticated using (true) with check (true);

-- Lapisan kedua: role anon (belum login) tidak punya hak apa pun.
revoke all on public.stores, public.products, public.order_items, public.income,
              public.expenses, public.monthly_recap, public.product_monthly_recap,
              public.daily_reconciliation
  from anon;

grant select on public.stores to authenticated;
grant select, insert, update, delete
  on public.products, public.order_items, public.income, public.expenses
  to authenticated;
grant select on public.monthly_recap, public.product_monthly_recap,
                public.daily_reconciliation
  to authenticated;

revoke execute on function public.order_items_from_json(jsonb)     from public, anon;
revoke execute on function public.upsert_order_items(bigint, jsonb) from public, anon;
revoke execute on function public.upsert_income(bigint, jsonb)      from public, anon;
revoke execute on function public.recalc_hpp(bigint, date, boolean) from public, anon;
grant execute on function public.order_items_from_json(jsonb)     to authenticated;
grant execute on function public.upsert_order_items(bigint, jsonb) to authenticated;
grant execute on function public.upsert_income(bigint, jsonb)      to authenticated;
grant execute on function public.recalc_hpp(bigint, date, boolean) to authenticated;
