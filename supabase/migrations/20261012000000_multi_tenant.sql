-- =============================================================================
-- Multi-tenant: tiap user hanya bisa mengakses toko miliknya
--
-- Sebelumnya semua policy RLS memakai `using (true)`: setiap user yang login bisa
-- membaca dan menulis data SEMUA toko. Migration ini menggantinya dengan
-- keanggotaan toko (store_members) dan masa langganan (stores.active_until).
--
-- * stores         : SELECT kalau user anggota toko (tetap terlihat walau langganan
--                    habis, supaya app bisa menampilkan layar "langganan habis").
-- * tabel data     : akses penuh hanya kalau user anggota toko DAN langganan aktif.
-- * store_members  : user hanya bisa MEMBACA barisnya sendiri. Tidak ada
--                    insert/update/delete dari client; admin mengisinya lewat
--                    SQL Editor (lihat admin_add_customer di bawah).
--
-- Fungsi upsert/recalc dan semua view sudah `security invoker`, jadi otomatis ikut
-- RLS di bawah. Satu-satunya `security definer` di migration ini adalah dua fungsi
-- helper (is_store_member, is_store_active).
--
-- Aman dijalankan lebih dari sekali. Tidak menghapus data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Kolom & tabel
-- -----------------------------------------------------------------------------

-- Tanggal terakhir langganan aktif (inklusif). null = tidak dibatasi (toko keluarga).
alter table public.stores add column if not exists active_until date;

-- Dua pelanggan boleh punya nama toko yang sama.
alter table public.stores drop constraint if exists stores_name_key;

create table if not exists public.store_members (
  store_id bigint not null references public.stores (id) on delete cascade,
  user_id  uuid   not null references auth.users (id)    on delete cascade,
  role     text   not null default 'owner',
  primary key (store_id, user_id)
);

create index if not exists store_members_user_idx on public.store_members (user_id);

alter table public.store_members enable row level security;

drop policy if exists "anggota: lihat keanggotaan sendiri" on public.store_members;
create policy "anggota: lihat keanggotaan sendiri" on public.store_members
  for select to authenticated using (user_id = (select auth.uid()));

-- Client hanya boleh membaca. (Default Supabase memberi semua hak ke authenticated.)
revoke all on public.store_members from anon, authenticated;
grant select on public.store_members to authenticated;

-- -----------------------------------------------------------------------------
-- Fungsi helper (security definer: perlu membaca store_members & stores tanpa
-- terhalang RLS-nya sendiri; hasilnya selalu hanya tentang auth.uid())
-- -----------------------------------------------------------------------------

create or replace function public.is_store_member(p_store_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Anggota DAN langganan masih berlaku (hari ini menurut WIB <= active_until).
create or replace function public.is_store_active(p_store_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members m
    join public.stores s on s.id = m.store_id
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and (s.active_until is null
           or s.active_until >= (now() at time zone 'Asia/Jakarta')::date)
  );
$$;

revoke execute on function public.is_store_member(bigint) from public, anon;
revoke execute on function public.is_store_active(bigint) from public, anon;
grant execute on function public.is_store_member(bigint) to authenticated;
grant execute on function public.is_store_active(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- Policy: ganti semua "login: ..." yang memakai using (true)
-- -----------------------------------------------------------------------------

-- stores hanya boleh dibaca client (default Supabase memberi semua hak ke authenticated).
-- Toko dibuat/diubah admin lewat SQL Editor.
revoke all on public.stores from anon, authenticated;
grant select on public.stores to authenticated;

drop policy if exists "login: baca toko" on public.stores;
drop policy if exists "anggota: baca toko" on public.stores;
create policy "anggota: baca toko" on public.stores
  for select to authenticated using (public.is_store_member(id));

drop policy if exists "login: akses penuh" on public.products;
drop policy if exists "anggota aktif: akses penuh" on public.products;
create policy "anggota aktif: akses penuh" on public.products
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));

drop policy if exists "login: akses penuh" on public.order_items;
drop policy if exists "anggota aktif: akses penuh" on public.order_items;
create policy "anggota aktif: akses penuh" on public.order_items
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));

drop policy if exists "login: akses penuh" on public.income;
drop policy if exists "anggota aktif: akses penuh" on public.income;
create policy "anggota aktif: akses penuh" on public.income
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));

drop policy if exists "login: akses penuh" on public.income_adjustments;
drop policy if exists "anggota aktif: akses penuh" on public.income_adjustments;
create policy "anggota aktif: akses penuh" on public.income_adjustments
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));

drop policy if exists "login: akses penuh" on public.expenses;
drop policy if exists "anggota aktif: akses penuh" on public.expenses;
create policy "anggota aktif: akses penuh" on public.expenses
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));

drop policy if exists "login: akses penuh" on public.ad_reports;
drop policy if exists "anggota aktif: akses penuh" on public.ad_reports;
create policy "anggota aktif: akses penuh" on public.ad_reports
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));

-- ad_rows tidak punya store_id: lewat laporan induknya.
drop policy if exists "login: akses penuh" on public.ad_rows;
drop policy if exists "anggota aktif: akses penuh" on public.ad_rows;
create policy "anggota aktif: akses penuh" on public.ad_rows
  for all to authenticated
  using (exists (
    select 1 from public.ad_reports r
    where r.id = ad_rows.report_id and public.is_store_active(r.store_id)
  ))
  with check (exists (
    select 1 from public.ad_reports r
    where r.id = ad_rows.report_id and public.is_store_active(r.store_id)
  ));

-- -----------------------------------------------------------------------------
-- Seed transisi (project keluarga)
--
-- Sebelum migration ini semua user boleh mengakses semua toko. Supaya akun yang
-- sudah ada (3 akun keluarga) tetap bisa masuk, SEMUA user di auth.users dijadikan
-- anggota SEMUA toko yang sudah ada.
--
-- Hanya berjalan kalau store_members masih KOSONG, yaitu pada run pertama. Kalau
-- migration dijalankan ulang setelah ada pelanggan, bagian ini tidak melakukan apa
-- pun. Tanpa pengaman ini, run ulang akan membuka data tiap pelanggan ke semua
-- pelanggan lain.
--
-- Di project HitungCuan yang baru ini tidak berpengaruh karena belum ada user saat
-- migration dijalankan. Jalankan migration SEBELUM membuat user, lalu hapus 2 toko
-- bawaan init.sql (lihat README).
-- -----------------------------------------------------------------------------

insert into public.store_members (store_id, user_id)
select s.id, u.id
from public.stores s
cross join auth.users u
where not exists (select 1 from public.store_members)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Fungsi admin: tambah pelanggan
--
-- Dijalankan admin dari SQL Editor Supabase (role postgres). TIDAK diberikan ke
-- anon/authenticated, jadi tidak bisa dipanggil dari aplikasi. Bukan security
-- definer: SQL Editor sudah berjalan sebagai postgres.
--
-- User dibuat dulu lewat dashboard (Authentication → Users → Add user).
--   select public.admin_add_customer('pelanggan@email.com', 'Toko Contoh', '2026-12-31');
-- Mengembalikan store_id toko yang baru dibuat. p_active_until null = tanpa batas.
-- -----------------------------------------------------------------------------

create or replace function public.admin_add_customer(
  p_email        text,
  p_store_name   text,
  p_active_until date default null
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid;
  v_store bigint;
begin
  if p_store_name is null or length(trim(p_store_name)) = 0 then
    raise exception 'Nama toko tidak boleh kosong.';
  end if;

  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user is null then
    raise exception
      'User dengan email "%" tidak ditemukan. Buat dulu lewat Authentication → Users → Add user.',
      p_email;
  end if;

  insert into public.stores (name, active_until)
  values (trim(p_store_name), p_active_until)
  returning id into v_store;

  insert into public.store_members (store_id, user_id, role)
  values (v_store, v_user, 'owner');

  return v_store;
end;
$$;

revoke execute on function public.admin_add_customer(text, text, date)
  from public, anon, authenticated;
