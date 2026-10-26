-- =============================================================================
-- Halaman Pengelola: buat akun uji coba ATAU akun yang langsung berlangganan
--
-- platform_create_account(email, password, nama_toko, aktif_sampai, minta_nama, uji_coba)
--   Memanggil platform_create_trial versi 4 parameter (yang memeriksa pengelola, email, password,
--   nama, tanggal, dan membuat akun + toko + pemilik dalam satu transaksi), lalu mengatur:
--     * stores.trial        = p_trial     (false = langsung berlangganan, tanpa batas uji coba)
--     * stores.name_pending = p_ask_name  (true = pemilik mengisi nama toko saat login pertama)
--
-- Butuh 20261026000000_platform_admin.sql dan 20261029000000_store_name_by_customer.sql.
-- Aman dijalankan lebih dari sekali. Tidak mengubah data. Jalankan sebelum/bersamaan deploy: tanpa SQL
-- ini formulir "Akun berlangganan" di halaman Pengelola menampilkan pesan gangguan sistem.
--   select public.platform_create_account('pelanggan@contoh.com', 'Password123', '', '2026-12-31', true, false);
-- =============================================================================

create or replace function public.platform_create_account(
  p_email        text,
  p_password     text,
  p_store_name   text,
  p_active_until date,
  p_ask_name     boolean,
  p_trial        boolean
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
  -- Pemeriksaan pengelola & isian ada di versi 4 parameter (menolak akun yang bukan pengelola).
  v_out := public.platform_create_trial(p_email, p_password, p_store_name, p_active_until);
  update public.stores
  set trial = coalesce(p_trial, true), name_pending = coalesce(p_ask_name, false)
  where id = (v_out ->> 'store_id')::bigint;
  return v_out || jsonb_build_object('trial', coalesce(p_trial, true), 'name_pending', coalesce(p_ask_name, false));
end;
$$;

revoke execute on function public.platform_create_account(text, text, text, date, boolean, boolean) from public, anon;
grant execute on function public.platform_create_account(text, text, text, date, boolean, boolean) to authenticated;
