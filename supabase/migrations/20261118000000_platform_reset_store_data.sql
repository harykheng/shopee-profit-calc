-- =============================================================================
-- Halaman Pengelola: tombol "Reset data" di daftar Pelanggan
--
-- platform_reset_store_data(store_id, nama_toko)
--   Hanya pengelola (is_platform_admin). Mengosongkan isi toko supaya bisa dicoba dari awal (panduan
--   3 langkah muncul lagi):
--     DIHAPUS  : export pesanan (order_items), penghasilan (income, income_adjustments, income_orders),
--                produk + HPP (products), biaya bulanan (expenses), data iklan (ad_reports, ad_rows ikut
--                lewat cascade), jatah simulasi uji coba yang sudah terpakai (trial_simulations).
--                Rekap tidak disimpan sendiri; ia dihitung dari tabel di atas, jadi ikut kosong.
--     DISIMPAN : toko (nama, uji coba/langganan, tanggal berakhir, jatah simulasi tambahan), akun &
--                pemilik (store_members), pengaturan hitungan (store_settings), kategori biaya admin
--                (fee_categories), catatan aktivitas (activity_events), catatan error (client_errors).
--   Nama toko harus ditulis ulang persis (huruf besar/kecil boleh beda) supaya tidak salah toko.
--   Tidak bisa dibatalkan. Untuk cadangan, jalankan dulu admin_export_store di SQL Editor (OPERASI.md).
--
-- Butuh 20261026000000_platform_admin.sql dan 20261027000000_trial_limits.sql (dan migration sebelumnya).
-- Aman dijalankan lebih dari sekali. Tidak mengubah data saat dijalankan. Boleh sebelum/sesudah deploy:
-- tanpa SQL ini tombolnya menampilkan pesan gangguan sistem.
-- =============================================================================

create or replace function public.platform_reset_store_data(p_store_id bigint, p_confirm_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_out  jsonb := '{}';
  v_n    bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa mereset data toko.' using errcode = '42501';
  end if;

  -- Kunci baris toko: dua reset bersamaan untuk toko yang sama berjalan satu per satu.
  select s.name into v_name from public.stores s where s.id = p_store_id for update;
  if v_name is null then
    raise exception 'Toko % tidak ditemukan.', p_store_id using errcode = '22023';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) is distinct from lower(trim(v_name)) then
    raise exception 'Nama toko tidak cocok. Tulis persis: "%"', v_name using errcode = '22023';
  end if;

  select count(*) into v_n from public.ad_rows x join public.ad_reports r on r.id = x.report_id where r.store_id = p_store_id;
  v_out := v_out || jsonb_build_object('ad_rows', v_n);
  delete from public.ad_reports where store_id = p_store_id;   -- ad_rows ikut terhapus (cascade)
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('ad_reports', v_n);
  delete from public.order_items where store_id = p_store_id;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('order_items', v_n);
  delete from public.products where store_id = p_store_id;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('products', v_n);
  delete from public.income where store_id = p_store_id;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('income', v_n);
  delete from public.income_adjustments where store_id = p_store_id;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('income_adjustments', v_n);
  delete from public.income_orders where store_id = p_store_id;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('income_orders', v_n);
  delete from public.expenses where store_id = p_store_id;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('expenses', v_n);
  delete from public.trial_simulations where store_id = p_store_id;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('trial_simulations', v_n);

  return v_out || jsonb_build_object('store_id', p_store_id, 'store_name', v_name);
end;
$$;

revoke execute on function public.platform_reset_store_data(bigint, text) from public, anon;
grant execute on function public.platform_reset_store_data(bigint, text) to authenticated;
