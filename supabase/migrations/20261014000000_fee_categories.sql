-- =============================================================================
-- Kategori biaya admin per toko
--
-- Biaya admin Shopee berbeda per kategori produk, dan tarifnya berubah dari waktu ke
-- waktu. Karena itu aplikasi TIDAK menanam tabel tarif: tiap toko membuat daftar
-- kategorinya sendiri (mis. "Skincare" 8,25%) dari Seller Centre-nya, lalu memilihkan
-- kategori untuk tiap produk. Mengubah persen di sini otomatis mengubah semua produk
-- di kategori itu.
--
--   * products.fee_category_id : kategori produk (null = pakai products.admin_pct isian
--                                manual, atau nilai bawaan kalau itu juga kosong).
--   * Satu produk = semua variasi dengan nama produk yang sama (sama seperti admin_pct).
--
-- Mengikuti aturan langganan di 20261012 dan 20261013: anggota toko boleh MEMBACA kapan
-- saja, MENULIS hanya kalau langganan aktif.
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data yang ada.
-- Butuh PostgreSQL 15+ (ON DELETE SET NULL dengan daftar kolom), standar di Supabase.
-- =============================================================================

create table if not exists public.fee_categories (
  id         bigint generated always as identity primary key,
  store_id   bigint not null references public.stores (id) on delete cascade,
  name       text   not null check (length(trim(name)) > 0),
  admin_pct  numeric(5, 2) not null check (admin_pct >= 0 and admin_pct < 100),
  updated_at timestamptz not null default now(),
  -- Dipakai products untuk memastikan kategori milik toko yang sama.
  unique (id, store_id)
);

-- Nama kategori unik per toko, tanpa membedakan huruf besar/kecil.
create unique index if not exists fee_categories_store_name_key
  on public.fee_categories (store_id, lower(trim(name)));

drop trigger if exists fee_categories_set_updated_at on public.fee_categories;
create trigger fee_categories_set_updated_at
  before update on public.fee_categories
  for each row execute function public.set_updated_at();

alter table public.products
  add column if not exists fee_category_id bigint;

-- Satu produk hanya boleh memakai kategori dari tokonya sendiri. Kategori dihapus →
-- hanya fee_category_id yang dikosongkan (store_id tetap).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_fee_category_fk'
  ) then
    alter table public.products
      add constraint products_fee_category_fk
      foreign key (fee_category_id, store_id)
      references public.fee_categories (id, store_id)
      on delete set null (fee_category_id);
  end if;
end $$;

create index if not exists products_fee_category_idx on public.products (fee_category_id);

-- products.admin_pct dipakai sebagai cadangan kalau kategori dihapus (produk kembali ke isian
-- manual dengan persen terakhirnya). Supaya cadangan itu tidak basi, persen kategori yang diubah
-- ikut disalin ke produk-produknya. Bukan security definer: ikut RLS orang yang mengubah.
create or replace function public.fee_categories_sync_products()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.admin_pct is distinct from old.admin_pct then
    update public.products
       set admin_pct = new.admin_pct
     where fee_category_id = new.id and store_id = new.store_id;
  end if;
  return new;
end;
$$;

drop trigger if exists fee_categories_sync_products on public.fee_categories;
create trigger fee_categories_sync_products
  after update of admin_pct on public.fee_categories
  for each row execute function public.fee_categories_sync_products();

-- -----------------------------------------------------------------------------
-- Hak akses & RLS
-- -----------------------------------------------------------------------------

alter table public.fee_categories enable row level security;

revoke all on public.fee_categories from anon;
grant select, insert, update, delete on public.fee_categories to authenticated;

drop policy if exists "anggota: baca" on public.fee_categories;
create policy "anggota: baca" on public.fee_categories
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "anggota aktif: akses penuh" on public.fee_categories;
create policy "anggota aktif: akses penuh" on public.fee_categories
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));
