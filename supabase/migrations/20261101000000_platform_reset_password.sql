-- =============================================================================
-- Halaman Pengelola: tombol "Reset password" di daftar Pelanggan
--
-- platform_reset_password(email, password_baru)
--   Hanya pengelola (is_platform_admin). Memanggil admin_reset_password (20261023): ganti password,
--   munculkan lagi banner "ganti password", keluarkan akun itu dari semua perangkat.
--
--   Pengaman tambahan dibanding admin_reset_password (yang hanya untuk SQL Editor):
--     * akun tujuan harus pemilik/anggota sebuah toko (pelanggan), bukan akun sembarang;
--     * akun pengelola (platform_admins), termasuk akun sendiri, TIDAK bisa direset dari aplikasi,
--       supaya satu pengelola tidak bisa mengambil alih akun pengelola lain. Untuk itu tetap pakai
--       admin_reset_password di SQL Editor.
--
-- Butuh 20261023000000_admin_reset_password.sql dan 20261026000000_platform_admin.sql.
-- Aman dijalankan lebih dari sekali. Tidak mengubah data. Boleh sebelum/sesudah deploy: tanpa SQL ini
-- tombolnya menampilkan pesan gangguan sistem.
-- =============================================================================

create or replace function public.platform_reset_password(p_email text, p_new_password text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa mereset password.' using errcode = '42501';
  end if;
  -- bcrypt hanya memakai 72 byte pertama.
  if p_new_password is null or length(p_new_password) < 8 or octet_length(p_new_password) > 72 then
    raise exception 'Password minimal 8 karakter (maksimal 72).' using errcode = '22023';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_user is null or not exists (select 1 from public.store_members m where m.user_id = v_user) then
    raise exception 'Akun % bukan pemilik toko mana pun.', p_email using errcode = '22023';
  end if;
  if exists (select 1 from public.platform_admins a where a.user_id = v_user) then
    raise exception 'Password akun pengelola tidak bisa direset dari aplikasi. Pakai admin_reset_password di SQL Editor.'
      using errcode = '42501';
  end if;

  return public.admin_reset_password(p_email, p_new_password);
end;
$$;

revoke execute on function public.platform_reset_password(text, text) from public, anon;
grant execute on function public.platform_reset_password(text, text) to authenticated;
