-- =============================================================================
-- Halaman Pengelola (#/pengelola): pengelola membuat akun uji coba dari aplikasi
--
-- Sebelumnya akun dibuat dua langkah (Authentication → Add user, lalu admin_add_customer di SQL
-- Editor). Migration ini menambah:
--
--   1. platform_admins           : daftar akun pengelola. Tidak bisa dibaca/diubah dari aplikasi;
--                                  diisi lewat SQL Editor dengan admin_set_platform_admin.
--   2. stores.trial              : penanda toko uji coba (dibuat dari halaman Pengelola).
--   3. is_platform_admin()       : aplikasi memakai ini untuk menampilkan ikon Pengelola.
--   4. platform_create_trial()   : membuat akun login (langsung aktif, tanpa verifikasi email),
--                                  toko, masa aktif, dan keanggotaan pemilik, dalam satu transaksi.
--   5. platform_list_customers() : daftar toko + email pemilik + tanggal berakhir + terakhir login.
--                                  TIDAK memuat isi toko (pesanan, penghasilan, HPP, dst.).
--   6. admin_set_platform_admin(): (SQL Editor saja) menjadikan / mencabut akun sebagai pengelola.
--
-- Fungsi 3–5 `security definer` (perlu menulis auth.users dan membaca semua toko) dan bisa dipanggil
-- akun yang login, tapi 4 dan 5 MENOLAK semua akun yang tidak ada di platform_admins. Diuji di
-- supabase/uji-pemisahan-toko.sql dan scripts/check-tenant-isolation.mjs.
--
-- Setelah menjalankan file ini, jadikan akunmu pengelola (sekali saja):
--   select public.admin_set_platform_admin('email-kamu@contoh.com');
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data yang ada.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Daftar pengelola
-- -----------------------------------------------------------------------------

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS hidup tanpa policy, dan tanpa hak untuk aplikasi: tidak ada yang bisa membaca daftar ini dari
-- aplikasi. Pengecekan dilakukan is_platform_admin() (security definer).
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Penanda toko uji coba
-- -----------------------------------------------------------------------------

alter table public.stores add column if not exists trial boolean not null default false;
-- Kapan toko dibuat (toko lama: waktu migration ini dijalankan).
alter table public.stores add column if not exists created_at timestamptz not null default now();

-- -----------------------------------------------------------------------------
-- 3. Apakah akun yang login seorang pengelola?
-- -----------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Buat akun uji coba
--   select public.platform_create_trial('calon@contoh.com', 'Password123', 'Toko Calon', '2026-11-09');
-- -----------------------------------------------------------------------------

create or replace function public.platform_create_trial(
  p_email        text,
  p_password     text,
  p_store_name   text,
  p_active_until date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_name    text := trim(coalesce(p_store_name, ''));
  v_today   date := (now() at time zone 'Asia/Jakarta')::date;
  v_user    uuid := gen_random_uuid();
  v_store   bigint;
  v_col     text;
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa membuat akun.' using errcode = '42501';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Email "%" tidak valid.', p_email using errcode = '22023';
  end if;
  -- bcrypt hanya memakai 72 byte pertama.
  if p_password is null or length(p_password) < 8 or octet_length(p_password) > 72 then
    raise exception 'Password minimal 8 karakter (maksimal 72).' using errcode = '22023';
  end if;
  if v_name = '' or length(v_name) > 100 then
    raise exception 'Nama toko wajib diisi (maksimal 100 karakter).' using errcode = '22023';
  end if;
  if p_active_until is null or p_active_until < v_today then
    raise exception 'Tanggal berakhir tidak boleh sebelum hari ini.' using errcode = '22023';
  end if;

  -- Satu pembuatan akun pada satu waktu, supaya dua klik bersamaan untuk email yang sama tidak
  -- sama-sama lolos pengecekan di bawah.
  perform pg_advisory_xact_lock(hashtext('platform_create_trial'));

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Email % sudah terdaftar. Pakai email lain, atau perpanjang tokonya lewat SQL Editor.', v_email
      using errcode = '23505';
  end if;

  -- Akun login, sama seperti yang dibuat Supabase saat "Add user" dengan "Auto confirm user".
  -- raw_user_meta_data sengaja tanpa password_changed: banner "ganti password" muncul sampai pemiliknya
  -- mengganti password sendiri di halaman Akun.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

  -- Server login Supabase menolak kolom token yang null ("converting NULL to string"). Kolomnya
  -- berbeda antar versi, jadi diisi '' untuk yang ada saja.
  for v_col in
    select c.column_name::text
    from information_schema.columns c
    where c.table_schema = 'auth' and c.table_name = 'users'
      and c.column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                            'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format('update auth.users set %1$I = coalesce(%1$I, '''') where id = $1', v_col) using v_user;
  end loop;

  -- Identitas login email. Versi lama Supabase belum punya kolom provider_id (id = user id).
  if exists (select 1 from information_schema.columns c
             where c.table_schema = 'auth' and c.table_name = 'identities' and c.column_name = 'provider_id') then
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_user::text, v_user,
            jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  else
    execute 'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             values ($1::text, $1, $2, ''email'', now(), now(), now())'
      using v_user, jsonb_build_object('sub', v_user::text, 'email', v_email);
  end if;

  insert into public.stores (name, active_until, trial)
  values (v_name, p_active_until, true)
  returning id into v_store;

  insert into public.store_members (store_id, user_id, role)
  values (v_store, v_user, 'owner');

  return jsonb_build_object('user_id', v_user, 'store_id', v_store, 'email', v_email,
                            'store_name', v_name, 'active_until', p_active_until);
end;
$$;

revoke execute on function public.platform_create_trial(text, text, text, date) from public, anon;
grant execute on function public.platform_create_trial(text, text, text, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Daftar pelanggan (tanpa isi toko)
-- -----------------------------------------------------------------------------

create or replace function public.platform_list_customers()
returns table (
  store_id        bigint,
  store_name      text,
  active_until    date,
  trial           boolean,
  created_at      timestamptz,
  owner_emails    text[],
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa melihat daftar pelanggan.' using errcode = '42501';
  end if;

  return query
  select s.id,
         s.name,
         s.active_until,
         s.trial,
         s.created_at,
         coalesce(array_agg(u.email::text order by u.email) filter (where u.email is not null), '{}'),
         max(u.last_sign_in_at)
  from public.stores s
  left join public.store_members m on m.store_id = s.id
  left join auth.users u on u.id = m.user_id
  group by s.id
  order by s.created_at desc, s.id desc;
end;
$$;

revoke execute on function public.platform_list_customers() from public, anon;
grant execute on function public.platform_list_customers() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Jadikan / cabut pengelola (SQL Editor saja)
--   select public.admin_set_platform_admin('email-kamu@contoh.com');          -- jadikan pengelola
--   select public.admin_set_platform_admin('email-kamu@contoh.com', false);   -- cabut
-- -----------------------------------------------------------------------------

create or replace function public.admin_set_platform_admin(p_email text, p_admin boolean default true)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid;
  v_email text;
begin
  select u.id, u.email into v_user, v_email
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user is null then
    raise exception 'User dengan email "%" tidak ditemukan. Cek ejaannya di Authentication → Users.', p_email;
  end if;

  if p_admin then
    insert into public.platform_admins (user_id) values (v_user) on conflict (user_id) do nothing;
    return format('%s sekarang pengelola. Muat ulang aplikasi; ikon Pengelola muncul di kanan atas.', v_email);
  end if;
  delete from public.platform_admins where user_id = v_user;
  return format('%s bukan pengelola lagi.', v_email);
end;
$$;

revoke execute on function public.admin_set_platform_admin(text, boolean) from public, anon, authenticated;
