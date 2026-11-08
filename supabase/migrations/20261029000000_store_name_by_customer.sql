-- =============================================================================
-- Nama toko diisi pelanggan sendiri saat login pertama
--
-- Kalau pengelola mengosongkan "Nama toko" di halaman Pengelola, toko tetap dibuat dengan nama
-- sementara dari email ("Toko budi") dan ditandai stores.name_pending = true. Saat pemiliknya login,
-- aplikasi menampilkan jendela "Nama tokomu di Shopee?" yang tidak bisa dilewati; jawabannya disimpan
-- lewat set_store_name() dan tandanya hilang. Setelah itu nama hanya bisa diubah pengelola (SQL Editor),
-- sama seperti sebelumnya.
--
--   1. stores.name_pending                       : penanda "nama belum diisi pelanggan".
--   2. platform_create_trial(..., p_ask_name)    : versi 5 parameter. Memanggil versi 4 parameter
--                                                  (yang tetap ada dan tetap memeriksa pengelola), lalu
--                                                  memasang tanda kalau p_ask_name = true.
--   3. set_store_name(store_id, nama)            : anggota toko mengisi nama SEKALI (hanya kalau
--                                                  name_pending). security definer karena stores tidak
--                                                  boleh diubah langsung dari aplikasi.
--
-- Butuh 20261026000000_platform_admin.sql. Aman dijalankan lebih dari sekali. Tidak mengubah data.
-- Boleh sebelum atau sesudah deploy: tanpa SQL ini, form Pengelola memakai nama dari email seperti dulu.
-- =============================================================================

alter table public.stores add column if not exists name_pending boolean not null default false;

-- -----------------------------------------------------------------------------
-- 2. Buat akun uji coba, nama toko diisi pelanggan
--   select public.platform_create_trial('calon@contoh.com', 'Password123', 'Toko calon', '2026-11-09', true);
-- -----------------------------------------------------------------------------

create or replace function public.platform_create_trial(
  p_email        text,
  p_password     text,
  p_store_name   text,
  p_active_until date,
  p_ask_name     boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  -- Semua pemeriksaan (pengelola, email, password, nama, tanggal) ada di versi 4 parameter.
  v_out := public.platform_create_trial(p_email, p_password, p_store_name, p_active_until);
  if coalesce(p_ask_name, false) then
    update public.stores set name_pending = true where id = (v_out ->> 'store_id')::bigint;
  end if;
  return v_out || jsonb_build_object('name_pending', coalesce(p_ask_name, false));
end;
$$;

revoke execute on function public.platform_create_trial(text, text, text, date, boolean) from public, anon;
grant execute on function public.platform_create_trial(text, text, text, date, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Pelanggan mengisi nama tokonya (sekali)
--   Mengembalikan jumlah toko yang namanya berubah: 1, atau 0 kalau namanya sudah pernah diisi.
-- -----------------------------------------------------------------------------

create or replace function public.set_store_name(p_store_id bigint, p_name text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_n    integer;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'permission denied: toko % bukan milik akun ini', p_store_id using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 100 then
    raise exception 'Nama toko wajib diisi (maksimal 100 karakter).' using errcode = '22023';
  end if;
  update public.stores set name = v_name, name_pending = false
  where id = p_store_id and name_pending;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.set_store_name(bigint, text) from public, anon;
grant execute on function public.set_store_name(bigint, text) to authenticated;
