-- =============================================================================
-- Reset password pengguna dari SQL Editor (pengelola)
--
--   select public.admin_reset_password('pelanggan@email.com', 'PasswordBaru123');
--
-- Satu perintah untuk:
--   1. mengganti password (disimpan sebagai hash bcrypt, sama seperti Supabase; password asli
--      memang tidak pernah bisa dibaca, jadi yang bisa dilakukan hanya membuat yang baru),
--   2. menghapus penanda `password_changed`, supaya banner kuning "Kamu masih memakai password dari
--      pengelola. Ganti sekarang" muncul lagi sampai pengguna menggantinya sendiri,
--   3. mengeluarkan akun itu dari semua perangkat (sesi lama tidak bisa diperpanjang lagi).
--
-- Hanya untuk SQL Editor (role postgres); TIDAK bisa dipanggil dari aplikasi (anon/authenticated),
-- sama seperti admin_add_customer dan fungsi admin_* lainnya.
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah data selain akun yang disebut.
-- =============================================================================

-- pgcrypto (crypt/gen_salt) sudah terpasang di Supabase, di schema "extensions".
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_reset_password(p_email text, p_new_password text)
returns text
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_user     uuid;
  v_email    text;
  v_sessions integer := 0;
begin
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'Password baru minimal 8 karakter.';
  end if;

  select u.id, u.email into v_user, v_email
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user is null then
    raise exception 'User dengan email "%" tidak ditemukan. Cek ejaannya di Authentication → Users.', p_email;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'password_changed',
      updated_at         = now()
  where id = v_user;

  -- Keluarkan dari semua perangkat. Tabelnya berbeda antar versi Supabase, jadi dilewati kalau tidak ada.
  begin
    delete from auth.sessions where user_id = v_user;
    get diagnostics v_sessions = row_count;
  exception when undefined_table then null;
  end;
  begin
    delete from auth.refresh_tokens where user_id = v_user::text;
  exception when undefined_table or undefined_column then null;
  end;

  return format(
    'Password %s sudah diganti, %s sesi lama dikeluarkan. Kirim password baru ke pemiliknya; '
      || 'banner "ganti password" akan muncul sampai ia menggantinya sendiri di halaman Akun.',
    v_email, v_sessions
  );
end;
$$;

revoke execute on function public.admin_reset_password(text, text) from public, anon, authenticated;
