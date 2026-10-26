-- =============================================================================
-- Halaman Pengelola: "Jadikan berlangganan"
--
-- platform_subscribe_store(store_id, aktif_sampai)
--   Hanya pengelola (is_platform_admin). Menghapus tanda uji coba (stores.trial = false, batas uji coba
--   langsung lepas) dan mengisi tanggal berakhir langganan. Sama dengan perintah SQL lama di OPERASI.md:
--     update public.stores set active_until = '2027-01-31', trial = false where id = 5;
--
-- Butuh 20261026000000_platform_admin.sql. Aman dijalankan lebih dari sekali. Tidak mengubah data.
-- Boleh sebelum/sesudah deploy: tanpa SQL ini tombolnya menampilkan pesan gangguan sistem.
-- =============================================================================

create or replace function public.platform_subscribe_store(p_store_id bigint, p_active_until date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_name  text;
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa mengubah langganan.' using errcode = '42501';
  end if;
  if p_active_until is null or p_active_until < v_today then
    raise exception 'Tanggal berakhir tidak boleh sebelum hari ini.' using errcode = '22023';
  end if;

  update public.stores set trial = false, active_until = p_active_until
  where id = p_store_id
  returning name into v_name;
  if v_name is null then
    raise exception 'Toko % tidak ditemukan.', p_store_id using errcode = '22023';
  end if;

  return jsonb_build_object('store_id', p_store_id, 'store_name', v_name, 'active_until', p_active_until, 'trial', false);
end;
$$;

revoke execute on function public.platform_subscribe_store(bigint, date) from public, anon;
grant execute on function public.platform_subscribe_store(bigint, date) to authenticated;
