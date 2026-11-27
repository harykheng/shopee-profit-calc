-- =============================================================================
-- Daftar lewat link uji coba: no HP (WhatsApp) dan "tahu HitungCuan dari mana?"
--
-- Calon pelanggan kini mengisi email, password, no HP, dan dari mana ia tahu aplikasi ini. Dua isian baru
-- disimpan per toko supaya pengelola bisa follow up lewat WhatsApp dan tahu promosi mana yang berhasil.
-- Beda dengan trial_links.source (20261116): itu diisi PENGELOLA per link ("dipasang di mana"); ini diisi
-- PENDAFTAR sendiri ("tahu dari mana").
--
--   1. trial_signups              : satu baris per toko yang daftar lewat link: no HP (format 628…),
--                                   tahu dari mana. Tanpa hak baca/tulis untuk aplikasi.
--   2. claim_trial_link(kode, email, password, no_hp, tahu_dari) : TANPA login. Versi 5 isian; memeriksa
--                                   no HP & jawaban, lalu memakai versi 3 isian (kode, kuota, masa berlaku,
--                                   akun, toko) dalam satu transaksi. Versi 3 isian sekarang ikut
--                                   mengembalikan store_id; tetap ada supaya halaman lama tidak rusak
--                                   selama jeda antara SQL ini dan deploy.
--   3. platform_signup_details()  : hanya pengelola; no HP & jawaban per toko untuk daftar Pelanggan.
--   4. admin_export_store / admin_delete_store ikut menyertakan trial_signups.
--
-- No HP adalah data pribadi pemilik akun (bukan data pembeli). Ikut terhapus bersama tokonya.
--
-- Butuh 20261111000000_trial_links.sql dan 20261116000000_activity_events.sql. Aman dijalankan lebih dari
-- sekali. Tidak mengubah data yang ada. Jalankan SEBELUM deploy: halaman daftar versi baru memakai versi 5 isian.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Isian pendaftaran
-- -----------------------------------------------------------------------------

create table if not exists public.trial_signups (
  store_id   bigint primary key references public.stores (id) on delete cascade,
  phone      text not null check (phone ~ '^628[0-9]{7,11}$'),
  heard_from text not null check (length(heard_from) between 1 and 80),
  created_at timestamptz not null default now()
);

alter table public.trial_signups enable row level security;
revoke all on public.trial_signups from anon, authenticated;

-- "0812-3456 789" / "+62 812…" / "812…" → "62812…"; null kalau bukan nomor HP Indonesia.
-- Sama dengan normalizePhone() di src/lib/trialLinks.ts.
create or replace function public.normalize_phone_id(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d ~ '^628[0-9]{7,11}$' then d end
  from (
    select case
             when x like '62%' then x
             when x like '0%' then '62' || substr(x, 2)
             when x like '8%' then '62' || x
             else x
           end as d
    from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as x) a
  ) b;
$$;

revoke execute on function public.normalize_phone_id(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Daftar lewat link (versi 3 isian ditulis ulang hanya untuk mengembalikan store_id)
-- -----------------------------------------------------------------------------

create or replace function public.claim_trial_link(p_token text, p_email text, p_password text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link  public.trial_links%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_local text := trim(split_part(v_email, '@', 1));
  -- Uji coba 7 hari, hari ini ikut dihitung (sama dengan DEFAULT_TRIAL_DAYS di aplikasi).
  v_until date := (now() at time zone 'Asia/Jakarta')::date + 6;
  v_out   jsonb;
begin
  -- Kunci baris link: dua orang yang mendaftar bersamaan tidak bisa sama-sama memakai jatah terakhir.
  select * into v_link from public.trial_links l
  where l.token_hash = public.trial_link_hash(p_token)
  for update;

  if not found then
    raise exception 'Link uji coba ini tidak dikenal. Periksa lagi link-nya, atau minta link baru ke pengelola.'
      using errcode = '22023';
  end if;
  if v_link.revoked_at is not null or v_link.expires_at <= now() then
    raise exception 'Link uji coba ini sudah tidak berlaku. Minta link baru ke pengelola.' using errcode = '22023';
  end if;
  if v_link.used_count >= v_link.max_uses then
    raise exception 'Kuota link uji coba ini sudah habis. Minta link baru ke pengelola.' using errcode = '22023';
  end if;

  begin
    -- Nama sementara dari email ("Toko budi"); pemiliknya mengisi nama asli saat pertama login.
    v_out := public.create_store_account(v_email, p_password, left('Toko ' || v_local, 100), v_until, true);
  exception when unique_violation then
    raise exception 'Email ini sudah punya akun. Silakan masuk; kalau lupa password, hubungi pengelola.'
      using errcode = '23505';
  end;

  update public.stores set name_pending = true, trial_link_id = v_link.id
  where id = (v_out ->> 'store_id')::bigint;
  update public.trial_links set used_count = used_count + 1 where id = v_link.id;

  return jsonb_build_object('email', v_out ->> 'email', 'active_until', v_until, 'store_id', (v_out ->> 'store_id')::bigint);
end;
$$;

revoke execute on function public.claim_trial_link(text, text, text) from public;
grant execute on function public.claim_trial_link(text, text, text) to anon, authenticated;

--   select public.claim_trial_link('kode', 'calon@contoh.com', 'PasswordSendiri1', '0812 3456 7890', 'Instagram');
create or replace function public.claim_trial_link(
  p_token      text,
  p_email      text,
  p_password   text,
  p_phone      text,
  p_heard_from text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone_id(p_phone);
  v_heard text := regexp_replace(trim(coalesce(p_heard_from, '')), '\s+', ' ', 'g');
  v_out   jsonb;
begin
  if v_phone is null then
    raise exception 'No HP belum benar. Contoh: 0812 3456 7890' using errcode = '22023';
  end if;
  if v_heard = '' or length(v_heard) > 80 then
    raise exception 'Pilih dari mana kamu tahu aplikasi ini.' using errcode = '22023';
  end if;

  -- Kode link, kuota, masa berlaku, email, password, akun, dan toko diperiksa/dibuat di versi 3 isian.
  v_out := public.claim_trial_link(p_token, p_email, p_password);
  insert into public.trial_signups (store_id, phone, heard_from)
  values ((v_out ->> 'store_id')::bigint, v_phone, v_heard);
  return v_out - 'store_id';
end;
$$;

revoke execute on function public.claim_trial_link(text, text, text, text, text) from public;
grant execute on function public.claim_trial_link(text, text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Pengelola: no HP & jawaban per toko
-- -----------------------------------------------------------------------------

create or replace function public.platform_signup_details()
returns table (store_id bigint, phone text, heard_from text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa melihat data pendaftaran.' using errcode = '42501';
  end if;
  return query select t.store_id, t.phone, t.heard_from from public.trial_signups t order by t.store_id;
end;
$$;

revoke execute on function public.platform_signup_details() from public, anon;
grant execute on function public.platform_signup_details() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Prosedur admin (turunan dari 20261116000000_activity_events.sql): ikut menyertakan trial_signups.
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
    'penghasilan_per_pesanan', (
      select coalesce(jsonb_agg((to_jsonb(o) - 'store_id') - 'uploaded_by' order by o.released_date, o.order_no, o.line_no), '[]'::jsonb)
      from public.income_orders o where o.store_id = p_store_id),
    'biaya_bulanan', (
      select coalesce(jsonb_agg(to_jsonb(e) - 'store_id' order by e.month, e.category), '[]'::jsonb)
      from public.expenses e where e.store_id = p_store_id),
    'iklan', (
      select coalesce(jsonb_agg(
        (to_jsonb(r) - 'store_id' - 'uploaded_by') || jsonb_build_object('baris', (
          select coalesce(jsonb_agg(to_jsonb(x) - 'report_id' order by x.seq), '[]'::jsonb)
          from public.ad_rows x where x.report_id = r.id))
        order by r.period_start, r.id), '[]'::jsonb)
      from public.ad_reports r where r.store_id = p_store_id),
    'simulasi_uji_coba', (
      select coalesce(jsonb_agg(jsonb_build_object('hari', t.day, 'jumlah', t.n) order by t.day), '[]'::jsonb)
      from (select day, count(*) as n from public.trial_simulations where store_id = p_store_id group by day) t),
    'aktivitas', (
      select coalesce(jsonb_agg(jsonb_build_object('aktivitas', a.event, 'waktu', a.created_at) order by a.created_at, a.id), '[]'::jsonb)
      from public.activity_events a where a.store_id = p_store_id),
    'pendaftaran_uji_coba', (
      select jsonb_build_object('no_hp', t.phone, 'tahu_dari', t.heard_from, 'waktu', t.created_at)
      from public.trial_signups t where t.store_id = p_store_id)
  );
end;
$$;

revoke execute on function public.admin_export_store(bigint) from public, anon, authenticated;

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
    select count(*) into v_n from public.income_orders where store_id = p_store_id;
    item := 'income_orders'; jumlah := v_n; return next;
    select count(*) into v_n from public.expenses where store_id = p_store_id;
    item := 'expenses'; jumlah := v_n; return next;
    select count(*) into v_n from public.fee_categories where store_id = p_store_id;
    item := 'fee_categories'; jumlah := v_n; return next;
    select count(*) into v_n from public.store_settings where store_id = p_store_id;
    item := 'store_settings'; jumlah := v_n; return next;
    select count(*) into v_n from public.trial_simulations where store_id = p_store_id;
    item := 'trial_simulations'; jumlah := v_n; return next;
    select count(*) into v_n from public.activity_events where store_id = p_store_id;
    item := 'activity_events'; jumlah := v_n; return next;
    select count(*) into v_n from public.trial_signups where store_id = p_store_id;
    item := 'trial_signups'; jumlah := v_n; return next;
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
  delete from public.income_orders where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'income_orders'; jumlah := v_n; return next;
  delete from public.expenses where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'expenses'; jumlah := v_n; return next;
  delete from public.fee_categories where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'fee_categories'; jumlah := v_n; return next;
  delete from public.store_settings where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'store_settings'; jumlah := v_n; return next;
  delete from public.trial_simulations where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'trial_simulations'; jumlah := v_n; return next;
  delete from public.activity_events where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'activity_events'; jumlah := v_n; return next;
  delete from public.trial_signups where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'trial_signups'; jumlah := v_n; return next;
  delete from public.store_members where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'store_members'; jumlah := v_n; return next;
  delete from public.stores where id = p_store_id;
  get diagnostics v_n = row_count; item := 'stores'; jumlah := v_n; return next;
end;
$$;

revoke execute on function public.admin_delete_store(bigint, text, boolean) from public, anon, authenticated;
