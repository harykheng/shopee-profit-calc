-- =============================================================================
-- Operasional: pemantau error dan prosedur ekspor / hapus data
--
-- 1. client_errors : laporan error dari browser pelanggan (tanpa dependency pihak ketiga; data
--                    tetap di project Supabase sendiri). Pelanggan hanya bisa MENULIS; tidak ada
--                    yang bisa membaca selain admin lewat SQL Editor.
-- 2. client_error_summary : ringkasan per jenis error untuk dicek admin.
-- 3. admin_export_store / admin_delete_store / admin_list_orphan_users : prosedur data pelanggan
--    (lihat OPERASI.md). Dijalankan admin dari SQL Editor (role postgres); TIDAK diberikan ke
--    anon/authenticated, jadi tidak bisa dipanggil dari aplikasi.
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data yang ada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Laporan error dari browser
-- -----------------------------------------------------------------------------

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  store_id    bigint references public.stores (id) on delete set null,
  -- uncaught / unhandledrejection : error yang lolos; render : komponen gagal tampil;
  -- handled : error dari server yang ditampilkan ke pelanggan; parse : file Shopee gagal dibaca.
  kind        text not null check (kind in ('uncaught', 'unhandledrejection', 'render', 'handled', 'parse')),
  message     text not null check (length(message) <= 1000),
  stack       text check (stack is null or length(stack) <= 6000),
  route       text check (route is null or length(route) <= 200),
  app_version text check (app_version is null or length(app_version) <= 40),
  user_agent  text check (user_agent is null or length(user_agent) <= 300),
  -- Kunci pengelompokan error yang sama (dihitung di browser).
  fingerprint text not null check (length(fingerprint) <= 64)
);

create index if not exists client_errors_fingerprint_idx on public.client_errors (fingerprint, created_at desc);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
create index if not exists client_errors_user_idx on public.client_errors (user_id, created_at desc);

alter table public.client_errors enable row level security;

-- Hanya menulis. Tidak ada policy SELECT, jadi pelanggan tidak bisa membaca laporan siapa pun.
revoke all on public.client_errors from anon, authenticated;
grant insert on public.client_errors to authenticated;

drop policy if exists "pelanggan: lapor error" on public.client_errors;
create policy "pelanggan: lapor error" on public.client_errors
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (store_id is null or public.is_store_member(store_id))
  );

-- Batas laporan per user supaya satu browser yang error berulang (atau disalahgunakan) tidak
-- membanjiri tabel: maksimal 30 laporan per 10 menit. Security definer karena user tidak punya
-- hak membaca tabelnya sendiri.
create or replace function public.client_errors_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and (
    select count(*) from public.client_errors
    where user_id = new.user_id and created_at > now() - interval '10 minutes'
  ) >= 30 then
    raise exception 'Terlalu banyak laporan error dalam waktu singkat.';
  end if;
  return new;
end;
$$;

drop trigger if exists client_errors_rate_limit on public.client_errors;
create trigger client_errors_rate_limit
  before insert on public.client_errors
  for each row execute function public.client_errors_rate_limit();

-- -----------------------------------------------------------------------------
-- 2. Ringkasan untuk admin
--   select * from public.client_error_summary where last_seen > now() - interval '1 day';
-- -----------------------------------------------------------------------------

create or replace view public.client_error_summary
with (security_invoker = true) as
select fingerprint,
       kind,
       left(min(message), 200)                                   as message,
       count(*)                                                  as kejadian,
       count(distinct user_id)                                   as user_berbeda,
       count(distinct store_id)                                  as toko_berbeda,
       min(created_at)                                           as pertama,
       max(created_at)                                           as terakhir,
       (array_agg(route order by created_at desc))[1]            as halaman_terakhir,
       (array_agg(app_version order by created_at desc))[1]      as versi_terakhir
from public.client_errors
group by fingerprint, kind
order by max(created_at) desc;

revoke all on public.client_error_summary from anon, authenticated;

-- Hapus laporan lama (bawaan 90 hari). Dijalankan admin, mis. sebulan sekali.
create or replace function public.admin_purge_client_errors(p_days integer default 90)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_count bigint;
begin
  if p_days is null or p_days < 1 then
    raise exception 'p_days harus minimal 1.';
  end if;
  delete from public.client_errors where created_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.admin_purge_client_errors(integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3a. Ekspor semua data satu toko (satu dokumen JSON)
--   select public.admin_export_store(5);
-- Isi: toko, anggota (email), produk + HPP, pesanan, penghasilan harian, penyesuaian, biaya, iklan,
-- kategori biaya admin, pengaturan. Tidak memuat data pribadi pembeli (memang tidak pernah disimpan).
-- Untuk toko besar, ekspor per tabel ke CSV (lihat OPERASI.md).
-- -----------------------------------------------------------------------------

create or replace function public.admin_export_store(p_store_id bigint)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_store jsonb;
begin
  select to_jsonb(s) into v_store from public.stores s where s.id = p_store_id;
  if v_store is null then
    raise exception 'Toko % tidak ditemukan.', p_store_id;
  end if;

  return jsonb_build_object(
    'diekspor_pada', now(),
    'toko', v_store,
    'anggota', (
      select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'peran', m.role)), '[]'::jsonb)
      from public.store_members m join auth.users u on u.id = m.user_id
      where m.store_id = p_store_id),
    'pengaturan', (select to_jsonb(ss) - 'store_id' from public.store_settings ss where ss.store_id = p_store_id),
    'kategori_biaya_admin', (
      select coalesce(jsonb_agg(to_jsonb(c) - 'store_id' order by c.name), '[]'::jsonb)
      from public.fee_categories c where c.store_id = p_store_id),
    'produk', (
      select coalesce(jsonb_agg(to_jsonb(p) - 'store_id' order by p.product_name, p.variant_name), '[]'::jsonb)
      from public.products p where p.store_id = p_store_id),
    'pesanan', (
      select coalesce(jsonb_agg((to_jsonb(o) - 'store_id') - 'uploaded_by' order by o.id), '[]'::jsonb)
      from public.order_items o where o.store_id = p_store_id),
    'penghasilan_harian', (
      select coalesce(jsonb_agg((to_jsonb(i) - 'store_id') - 'uploaded_by' order by i.released_date), '[]'::jsonb)
      from public.income i where i.store_id = p_store_id),
    'penyesuaian_penghasilan', (
      select coalesce(jsonb_agg((to_jsonb(a) - 'store_id') - 'uploaded_by' order by a.id), '[]'::jsonb)
      from public.income_adjustments a where a.store_id = p_store_id),
    'biaya_bulanan', (
      select coalesce(jsonb_agg(to_jsonb(e) - 'store_id' order by e.month, e.category), '[]'::jsonb)
      from public.expenses e where e.store_id = p_store_id),
    'iklan', (
      select coalesce(jsonb_agg(
        (to_jsonb(r) - 'store_id' - 'uploaded_by') || jsonb_build_object('baris', (
          select coalesce(jsonb_agg(to_jsonb(x) - 'report_id' order by x.seq), '[]'::jsonb)
          from public.ad_rows x where x.report_id = r.id))
        order by r.period_start, r.id), '[]'::jsonb)
      from public.ad_reports r where r.store_id = p_store_id)
  );
end;
$$;

revoke execute on function public.admin_export_store(bigint) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3b. Hapus semua data satu toko (dan tokonya)
--   select * from public.admin_delete_store(5, 'Nama Toko Persis');                -- hanya menghitung
--   select * from public.admin_delete_store(5, 'Nama Toko Persis', false);         -- menghapus
-- Aman berlapis: nama toko harus persis sama, dan bawaannya hanya MENGHITUNG apa yang akan dihapus.
-- Akun login (auth.users) tidak ikut terhapus; lihat admin_list_orphan_users.
-- Cadangkan dulu (OPERASI.md). Tidak bisa dibatalkan.
-- -----------------------------------------------------------------------------

create or replace function public.admin_delete_store(
  p_store_id     bigint,
  p_confirm_name text,
  p_dry_run      boolean default true
)
returns table (item text, jumlah bigint)
language plpgsql
set search_path = public
as $$
declare
  v_name text;
  v_n    bigint;
begin
  select s.name into v_name from public.stores s where s.id = p_store_id;
  if v_name is null then
    raise exception 'Toko % tidak ditemukan.', p_store_id;
  end if;
  if p_confirm_name is distinct from v_name then
    raise exception 'Nama toko tidak cocok. Tulis persis: "%"', v_name;
  end if;

  if p_dry_run then
    item := 'MODE HITUNG SAJA (tidak ada yang dihapus)'; jumlah := 0; return next;
    select count(*) into v_n from public.ad_rows x join public.ad_reports r on r.id = x.report_id where r.store_id = p_store_id;
    item := 'ad_rows'; jumlah := v_n; return next;
    select count(*) into v_n from public.ad_reports where store_id = p_store_id;
    item := 'ad_reports'; jumlah := v_n; return next;
    select count(*) into v_n from public.order_items where store_id = p_store_id;
    item := 'order_items'; jumlah := v_n; return next;
    select count(*) into v_n from public.products where store_id = p_store_id;
    item := 'products'; jumlah := v_n; return next;
    select count(*) into v_n from public.income where store_id = p_store_id;
    item := 'income'; jumlah := v_n; return next;
    select count(*) into v_n from public.income_adjustments where store_id = p_store_id;
    item := 'income_adjustments'; jumlah := v_n; return next;
    select count(*) into v_n from public.expenses where store_id = p_store_id;
    item := 'expenses'; jumlah := v_n; return next;
    select count(*) into v_n from public.fee_categories where store_id = p_store_id;
    item := 'fee_categories'; jumlah := v_n; return next;
    select count(*) into v_n from public.store_settings where store_id = p_store_id;
    item := 'store_settings'; jumlah := v_n; return next;
    select count(*) into v_n from public.store_members where store_id = p_store_id;
    item := 'store_members'; jumlah := v_n; return next;
    return;
  end if;

  -- Urutan penting: tabel yang menunjuk ke toko memakai ON DELETE RESTRICT.
  select count(*) into v_n from public.ad_rows x join public.ad_reports r on r.id = x.report_id where r.store_id = p_store_id;
  item := 'ad_rows'; jumlah := v_n; return next;   -- terhapus lewat cascade dari ad_reports
  delete from public.ad_reports where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'ad_reports'; jumlah := v_n; return next;
  delete from public.order_items where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'order_items'; jumlah := v_n; return next;
  delete from public.products where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'products'; jumlah := v_n; return next;
  delete from public.income where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'income'; jumlah := v_n; return next;
  delete from public.income_adjustments where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'income_adjustments'; jumlah := v_n; return next;
  delete from public.expenses where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'expenses'; jumlah := v_n; return next;
  delete from public.fee_categories where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'fee_categories'; jumlah := v_n; return next;
  delete from public.store_settings where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'store_settings'; jumlah := v_n; return next;
  delete from public.store_members where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'store_members'; jumlah := v_n; return next;
  delete from public.stores where id = p_store_id;
  get diagnostics v_n = row_count; item := 'stores'; jumlah := v_n; return next;
end;
$$;

revoke execute on function public.admin_delete_store(bigint, text, boolean) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3c. Akun login yang sudah tidak punya toko (setelah admin_delete_store)
--   select * from public.admin_list_orphan_users();
-- Hapus akunnya lewat dashboard: Authentication → Users → ... → Delete user.
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_orphan_users()
returns table (user_id uuid, email text, dibuat timestamptz)
language sql
stable
set search_path = public
as $$
  select u.id, u.email::text, u.created_at
  from auth.users u
  where not exists (select 1 from public.store_members m where m.user_id = u.id)
  order by u.created_at;
$$;

revoke execute on function public.admin_list_orphan_users() from public, anon, authenticated;
