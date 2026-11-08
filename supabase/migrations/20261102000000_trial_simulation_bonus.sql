-- =============================================================================
-- Jatah simulasi tambahan per toko uji coba (diberi pengelola)
--
--   1. stores.trial_sim_bonus                 : tambahan di atas trial_simulation_limit() (50).
--   2. use_trial_simulation                   : batasnya kini 50 + trial_sim_bonus toko itu.
--   3. platform_add_trial_simulations(id, n)  : hanya pengelola; menambah jatah toko itu n produk (1–1000).
--   4. platform_trial_simulation_usage()      : hanya pengelola; pemakaian & batas simulasi tiap toko uji coba,
--                                               untuk daftar Pelanggan.
--
-- Butuh 20261028000000_trial_limits_total.sql. Aman dijalankan lebih dari sekali. Tidak mengubah data.
-- Boleh sebelum/sesudah deploy: tanpa SQL ini daftar Pelanggan tidak menampilkan pemakaian simulasi dan
-- tombol tambah jatah menampilkan pesan gangguan sistem.
-- =============================================================================

alter table public.stores add column if not exists trial_sim_bonus integer not null default 0;
alter table public.stores drop constraint if exists stores_trial_sim_bonus_check;
alter table public.stores add constraint stores_trial_sim_bonus_check check (trial_sim_bonus >= 0);

-- 2. Batas simulasi per toko
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
  v_limit integer;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'permission denied: toko % bukan milik akun ini', p_store_id using errcode = '42501';
  end if;
  -- Batas toko ini = batas umum + jatah tambahan dari pengelola.
  select s.trial, public.trial_simulation_limit() + coalesce(s.trial_sim_bonus, 0)
  into v_trial, v_limit
  from public.stores s where s.id = p_store_id;
  v_limit := coalesce(v_limit, public.trial_simulation_limit());
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

-- -----------------------------------------------------------------------------
-- 3. Pengelola menambah jatah simulasi satu toko
--   select public.platform_add_trial_simulations(5, 25);
-- -----------------------------------------------------------------------------

create or replace function public.platform_add_trial_simulations(p_store_id bigint, p_amount integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bonus integer;
  v_used  integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa menambah jatah simulasi.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000 then
    raise exception 'Tambahan jatah 1 sampai 1000 produk.' using errcode = '22023';
  end if;
  update public.stores set trial_sim_bonus = trial_sim_bonus + p_amount
  where id = p_store_id
  returning trial_sim_bonus into v_bonus;
  if v_bonus is null then
    raise exception 'Toko % tidak ditemukan.', p_store_id using errcode = '22023';
  end if;
  select count(distinct item_key) into v_used from public.trial_simulations where store_id = p_store_id;
  return jsonb_build_object('store_id', p_store_id, 'used', v_used,
                            'limit', public.trial_simulation_limit() + v_bonus, 'bonus', v_bonus);
end;
$$;

revoke execute on function public.platform_add_trial_simulations(bigint, integer) from public, anon;
grant execute on function public.platform_add_trial_simulations(bigint, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Pemakaian simulasi tiap toko uji coba (daftar Pelanggan)
-- -----------------------------------------------------------------------------

create or replace function public.platform_trial_simulation_usage()
returns table (store_id bigint, used integer, sim_limit integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa melihat pemakaian simulasi.' using errcode = '42501';
  end if;
  return query
  select s.id,
         (select count(distinct t.item_key)::integer from public.trial_simulations t where t.store_id = s.id),
         public.trial_simulation_limit() + s.trial_sim_bonus
  from public.stores s
  where s.trial
  order by s.id;
end;
$$;

revoke execute on function public.platform_trial_simulation_usage() from public, anon;
grant execute on function public.platform_trial_simulation_usage() to authenticated;
