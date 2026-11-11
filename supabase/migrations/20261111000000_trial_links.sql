-- =============================================================================
-- Link uji coba: calon pelanggan membuat akun uji cobanya sendiri
--
-- Sebelumnya pengelola mengetik email calon pelanggan di halaman Pengelola, membuat password, lalu
-- mengirim teks login lewat WhatsApp. Sekarang pengelola cukup menekan "Buat link" dan mengirim
-- link-nya. Orang yang membuka link mengisi email + password sendiri; akun uji coba 7 hari, toko, dan
-- keanggotaan pemilik langsung dibuat, lalu ia langsung masuk ke aplikasi.
--
--   1. trial_links                 : link yang dibuat pengelola. Yang disimpan hanya hash SHA-256 dari
--                                    kodenya; kode aslinya hanya tampil sekali saat link dibuat.
--   2. create_store_account()      : (internal, tidak bisa dipanggil aplikasi) isi lama
--                                    platform_create_trial: akun login + toko + pemilik.
--   3. platform_create_trial()     : versi 4 parameter ditulis ulang: cek pengelola, lalu memanggil (2).
--                                    Perilakunya sama persis seperti sebelumnya.
--   4. platform_create_trial_link(), platform_list_trial_links(), platform_revoke_trial_link():
--                                    hanya pengelola.
--   5. trial_link_status(kode)     : TANPA login. Hanya menjawab apakah link masih bisa dipakai.
--   6. claim_trial_link(kode, email, password): TANPA login. Membuat akun uji coba kalau kodenya
--                                    benar, belum kedaluwarsa, belum dimatikan, dan jatahnya masih ada.
--
-- Pengaman: kode acak 144 bit (tidak bisa ditebak), jatah pemakaian per link (1–1000 orang), masa
-- berlaku (1–90 hari), bisa dimatikan kapan saja. Toko yang dibuat selalu uji coba (batas uji coba
-- berlaku) dan nama tokonya diisi pemilik saat pertama login. Email tidak diverifikasi (sama seperti
-- akun buatan pengelola).
--
-- Butuh 20261026000000_platform_admin.sql dan 20261029000000_store_name_by_customer.sql.
-- Aman dijalankan lebih dari sekali. Tidak mengubah data yang ada.
-- Jalankan SEBELUM deploy: halaman Buat akun versi baru memakai fungsi di sini.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Link uji coba
-- -----------------------------------------------------------------------------

create table if not exists public.trial_links (
  id          bigint generated always as identity primary key,
  token_hash  text not null unique,
  max_uses    integer not null check (max_uses between 1 and 1000),
  used_count  integer not null default 0 check (used_count >= 0),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Tidak ada yang bisa membaca/mengubah tabel ini dari aplikasi; semua lewat fungsi di bawah.
alter table public.trial_links enable row level security;
revoke all on public.trial_links from anon, authenticated;

-- Toko mana yang dibuat lewat link (untuk pengelola; null = dibuat pengelola / SQL Editor).
alter table public.stores add column if not exists trial_link_id bigint references public.trial_links (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 2. Buat akun login + toko + pemilik (internal)
--    p_own_password = true: password dipilih pemiliknya sendiri, jadi banner "ganti password" tidak muncul.
-- -----------------------------------------------------------------------------

create or replace function public.create_store_account(
  p_email        text,
  p_password     text,
  p_store_name   text,
  p_active_until date,
  p_own_password boolean
)
returns jsonb
language plpgsql
volatile
security invoker
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
  -- Tanpa password_changed, banner "ganti password" muncul sampai pemiliknya mengganti password sendiri.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    case when coalesce(p_own_password, false) then '{"password_changed":true}'::jsonb else '{}'::jsonb end,
    now(), now()
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

-- Hanya dipanggil fungsi lain (yang sudah memeriksa siapa pemanggilnya).
revoke execute on function public.create_store_account(text, text, text, date, boolean) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. platform_create_trial versi 4 parameter: sama seperti sebelumnya, isinya kini di (2)
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
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa membuat akun.' using errcode = '42501';
  end if;
  return public.create_store_account(p_email, p_password, p_store_name, p_active_until, false);
end;
$$;

revoke execute on function public.platform_create_trial(text, text, text, date) from public, anon;
grant execute on function public.platform_create_trial(text, text, text, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Pengelola: buat, lihat, matikan link
-- -----------------------------------------------------------------------------

create or replace function public.trial_link_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

revoke execute on function public.trial_link_hash(text) from public, anon, authenticated;

--   select public.platform_create_trial_link(10, 7);   -- untuk 10 orang, berlaku 7 hari
create or replace function public.platform_create_trial_link(p_max_uses integer, p_valid_days integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- 18 byte acak = 24 karakter, aman untuk alamat web (tanpa + / =).
  v_token   text := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  v_expires timestamptz;
  v_id      bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa membuat link uji coba.' using errcode = '42501';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 1000 then
    raise exception 'Jumlah orang 1 sampai 1000.' using errcode = '22023';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 90 then
    raise exception 'Masa berlaku link 1 sampai 90 hari.' using errcode = '22023';
  end if;

  v_expires := now() + make_interval(days => p_valid_days);
  insert into public.trial_links (token_hash, max_uses, expires_at, created_by)
  values (public.trial_link_hash(v_token), p_max_uses, v_expires, (select auth.uid()))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'token', v_token, 'max_uses', p_max_uses, 'expires_at', v_expires);
end;
$$;

revoke execute on function public.platform_create_trial_link(integer, integer) from public, anon;
grant execute on function public.platform_create_trial_link(integer, integer) to authenticated;

-- Link yang masih bisa dipakai (belum dimatikan, belum kedaluwarsa, jatah masih ada). Tanpa kodenya.
create or replace function public.platform_list_trial_links()
returns table (
  id          bigint,
  max_uses    integer,
  used_count  integer,
  expires_at  timestamptz,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa melihat link uji coba.' using errcode = '42501';
  end if;

  return query
  select l.id, l.max_uses, l.used_count, l.expires_at, l.created_at
  from public.trial_links l
  where l.revoked_at is null and l.expires_at > now() and l.used_count < l.max_uses
  order by l.created_at desc, l.id desc;
end;
$$;

revoke execute on function public.platform_list_trial_links() from public, anon;
grant execute on function public.platform_list_trial_links() to authenticated;

-- Mengembalikan 1 kalau link dimatikan, 0 kalau sudah mati / tidak ada.
create or replace function public.platform_revoke_trial_link(p_id bigint)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa mematikan link uji coba.' using errcode = '42501';
  end if;
  update public.trial_links set revoked_at = now() where id = p_id and revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.platform_revoke_trial_link(bigint) from public, anon;
grant execute on function public.platform_revoke_trial_link(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Tanpa login: link masih bisa dipakai?
--    'ok' | 'expired' (kedaluwarsa atau dimatikan) | 'used_up' (jatah habis) | 'invalid' (kode salah)
-- -----------------------------------------------------------------------------

create or replace function public.trial_link_status(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when l.revoked_at is not null or l.expires_at <= now() then 'expired'
                 when l.used_count >= l.max_uses then 'used_up'
                 else 'ok' end
     from public.trial_links l
     where l.token_hash = public.trial_link_hash(p_token)),
    'invalid');
$$;

revoke execute on function public.trial_link_status(text) from public;
grant execute on function public.trial_link_status(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Tanpa login: buat akun uji coba dari link
--   select public.claim_trial_link('kode-dari-link', 'calon@contoh.com', 'PasswordSendiri1');
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

  return jsonb_build_object('email', v_out ->> 'email', 'active_until', v_until);
end;
$$;

revoke execute on function public.claim_trial_link(text, text, text) from public;
grant execute on function public.claim_trial_link(text, text, text) to anon, authenticated;
