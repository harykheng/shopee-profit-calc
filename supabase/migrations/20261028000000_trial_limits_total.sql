-- =============================================================================
-- Batas akun uji coba, versi 2 (menggantikan angka di 20261027000000_trial_limits.sql)
--
--   1. DATA MAKSIMAL 1 BULAN (sebelumnya 2). Cara hitungnya tetap: bulan laporan penghasilan
--      (tanggal uang cair) dan bulan data iklan. Export pesanan tidak dibatasi; upload ulang bulan
--      yang sama selalu boleh. Trigger dari migration sebelumnya tidak diubah, hanya angkanya.
--   2. SIMULASI MAKSIMAL 50 PRODUK SELAMA UJI COBA (sebelumnya 10 per hari). Satu produk tetap
--      dihitung sekali, sekarang untuk seluruh masa uji coba (bukan per hari). Catatan lama tidak
--      dihapus lagi, karena itulah hitungannya.
--
-- Butuh 20261027000000_trial_limits.sql. Aman dijalankan lebih dari sekali. Tidak menghapus data.
-- Catatan simulasi dari migration sebelumnya ikut dihitung (paling banyak beberapa hari terakhir).
-- =============================================================================

create or replace function public.trial_month_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 1 $$;

create or replace function public.trial_simulation_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 50 $$;

-- Hasil: {"trial": bool, "allowed": bool, "used": n, "limit": n}; p_key null = hanya melihat sisa jatah.
create or replace function public.use_trial_simulation(p_store_id bigint, p_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial boolean;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_key   text;
  v_used  integer;
  v_limit integer := public.trial_simulation_limit();
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'permission denied: toko % bukan milik akun ini', p_store_id using errcode = '42501';
  end if;
  select s.trial into v_trial from public.stores s where s.id = p_store_id;
  if not coalesce(v_trial, false) then
    return jsonb_build_object('trial', false, 'allowed', true, 'used', 0, 'limit', v_limit);
  end if;

  perform pg_advisory_xact_lock(hashtext('trial_simulation'), p_store_id::int);
  -- Produk berbeda selama uji coba (produk yang sama di hari lain tetap 1).
  select count(distinct item_key) into v_used from public.trial_simulations where store_id = p_store_id;

  if p_key is null or length(trim(p_key)) = 0 then
    return jsonb_build_object('trial', true, 'allowed', v_used < v_limit, 'used', v_used, 'limit', v_limit);
  end if;

  v_key := md5(trim(p_key));
  if exists (select 1 from public.trial_simulations where store_id = p_store_id and item_key = v_key) then
    return jsonb_build_object('trial', true, 'allowed', true, 'used', v_used, 'limit', v_limit);
  end if;
  if v_used >= v_limit or not public.is_store_active(p_store_id) then
    return jsonb_build_object('trial', true, 'allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  insert into public.trial_simulations (store_id, day, item_key) values (p_store_id, v_today, v_key);
  return jsonb_build_object('trial', true, 'allowed', true, 'used', v_used + 1, 'limit', v_limit);
end;
$$;

revoke execute on function public.use_trial_simulation(bigint, text) from public, anon;
grant execute on function public.use_trial_simulation(bigint, text) to authenticated;
