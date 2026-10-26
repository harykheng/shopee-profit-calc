-- =============================================================================
-- Batas akun uji coba (stores.trial = true)
--
--   1. DATA MAKSIMAL 2 BULAN. Yang dihitung adalah bulan laporan penghasilan (tanggal uang cair) dan
--      bulan data iklan (awal & akhir periode), karena itulah yang membuat Rekap dan halaman Iklan
--      sebuah bulan berisi. Export pesanan sengaja TIDAK dibatasi: export memang perlu rentang lebar
--      supaya uang cair bisa dicocokkan dengan pesanannya, dan tanpa laporan penghasilan pesanan saja
--      tidak menghasilkan untung.
--      Dijaga trigger di income, income_adjustments, income_orders, ad_reports: kalau setelah
--      penyimpanan toko uji coba punya lebih dari 2 bulan, SELURUH penyimpanan itu dibatalkan
--      (save_income_report dan save_ad_report satu transaksi). Upload ulang bulan yang sudah ada
--      selalu boleh.
--   2. SIMULASI MAKSIMAL 10 PRODUK PER HARI (WIB). Satu produk / satu grup iklan = 1; mengubah harga,
--      ROAS, atau biaya di produk yang sama tidak menambah hitungan. Hitungan simulasi berjalan di
--      browser, jadi batas ini dicatat di sini (use_trial_simulation) dan ditegakkan di tampilan.
--
-- Toko berbayar (trial = false) tidak terpengaruh sama sekali. Saat pelanggan mulai membayar,
-- ubah trial = false (OPERASI.md); batasnya langsung lepas.
--
-- Butuh 20261026000000_platform_admin.sql (kolom stores.trial). Aman dijalankan lebih dari sekali.
-- Tidak mengubah/menghapus data yang ada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Batas bulan data
-- -----------------------------------------------------------------------------

create or replace function public.trial_month_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2 $$;

create or replace function public.trial_simulation_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;

-- Bulan (tanggal 1) yang sudah berisi laporan penghasilan atau data iklan, urut dari yang lama.
-- security invoker: hanya melihat toko yang boleh dibaca pemanggil (RLS).
create or replace function public.trial_months_used(p_store_id bigint)
returns date[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(m order by m), '{}')
  from (
    select date_trunc('month', released_date)::date as m from public.income where store_id = p_store_id
    union
    select date_trunc('month', released_date)::date from public.income_adjustments where store_id = p_store_id
    union
    select date_trunc('month', released_date)::date from public.income_orders
      where store_id = p_store_id and released_date is not null
    union
    select date_trunc('month', period_start)::date from public.ad_reports where store_id = p_store_id
    union
    select date_trunc('month', period_end)::date from public.ad_reports where store_id = p_store_id
  ) x
$$;

revoke execute on function public.trial_months_used(bigint) from public, anon;
grant execute on function public.trial_months_used(bigint) to authenticated;

create or replace function public.trial_month_label(p_month date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September',
                'Oktober','November','Desember'])[extract(month from p_month)::int]
         || ' ' || extract(year from p_month)::int
$$;

-- Trigger per perintah (bukan per baris): satu upload laporan bisa berisi ribuan baris.
create or replace function public.check_trial_month_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store  bigint;
  v_months date[];
begin
  for v_store in
    select distinct n.store_id from new_rows n
    join public.stores s on s.id = n.store_id
    where s.trial
  loop
    -- Dua upload bersamaan ke toko yang sama tidak boleh sama-sama lolos.
    perform pg_advisory_xact_lock(hashtext('trial_month_limit'), v_store::int);
    v_months := public.trial_months_used(v_store);
    if cardinality(v_months) > public.trial_month_limit() then
      raise exception 'trial_month_limit: Akun uji coba hanya bisa menyimpan data % bulan, sedangkan dengan file ini datanya jadi % bulan (%). File ini tidak disimpan.',
        public.trial_month_limit(), cardinality(v_months),
        (select string_agg(public.trial_month_label(m), ', ' order by m) from unnest(v_months) m)
        using errcode = 'P0001',
              hint = 'Upload ulang bulan yang sudah ada tetap boleh. Untuk bulan lain, berlangganan dulu.';
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists trial_month_limit on public.income;
create trigger trial_month_limit after insert on public.income
  referencing new table as new_rows for each statement execute function public.check_trial_month_limit();
drop trigger if exists trial_month_limit on public.income_adjustments;
create trigger trial_month_limit after insert on public.income_adjustments
  referencing new table as new_rows for each statement execute function public.check_trial_month_limit();
drop trigger if exists trial_month_limit on public.income_orders;
create trigger trial_month_limit after insert on public.income_orders
  referencing new table as new_rows for each statement execute function public.check_trial_month_limit();
drop trigger if exists trial_month_limit on public.ad_reports;
create trigger trial_month_limit after insert on public.ad_reports
  referencing new table as new_rows for each statement execute function public.check_trial_month_limit();

-- -----------------------------------------------------------------------------
-- 2. Jatah simulasi harian
-- -----------------------------------------------------------------------------

-- Satu baris = satu produk/grup yang disimulasikan toko uji coba pada satu hari (WIB). item_key
-- disimpan sebagai md5 (bukan nama produk). Tidak bisa dibaca/diubah langsung dari aplikasi; hanya
-- lewat use_trial_simulation (supaya pelanggan tidak bisa menghapus hitungannya sendiri).
create table if not exists public.trial_simulations (
  store_id   bigint not null references public.stores (id) on delete cascade,
  day        date not null,
  item_key   text not null,
  created_at timestamptz not null default now(),
  primary key (store_id, day, item_key)
);
alter table public.trial_simulations enable row level security;
revoke all on public.trial_simulations from anon, authenticated;

-- Catat (kalau perlu) satu simulasi dan kembalikan apakah hasilnya boleh ditampilkan.
--   p_key null = hanya melihat sisa jatah, tidak mencatat.
-- Hasil: {"trial": bool, "allowed": bool, "used": n, "limit": n}
-- security definer karena tabelnya tertutup; keanggotaan toko diperiksa sendiri di sini.
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
  delete from public.trial_simulations where store_id = p_store_id and day < v_today - 1;
  select count(*) into v_used from public.trial_simulations where store_id = p_store_id and day = v_today;

  if p_key is null or length(trim(p_key)) = 0 then
    return jsonb_build_object('trial', true, 'allowed', v_used < v_limit, 'used', v_used, 'limit', v_limit);
  end if;

  v_key := md5(trim(p_key));
  if exists (select 1 from public.trial_simulations
             where store_id = p_store_id and day = v_today and item_key = v_key) then
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
-- 3. Prosedur admin (turunan dari 20261020000000_income_orders.sql): ikut menyertakan trial_simulations.
-- -----------------------------------------------------------------------------

create or replace function public.admin_export_store(p_store_id bigint)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_store jsonb;
begin
  select to_jsonb(s) into v_store from public.stores s where s.id = p_store_id;
  if v_store is null then
    raise exception 'Toko % tidak ditemukan.', p_store_id;
  end if;

  return jsonb_build_object(
    'diekspor_pada', now(),
    'toko', v_store,
    'anggota', (
      select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'peran', m.role)), '[]'::jsonb)
      from public.store_members m join auth.users u on u.id = m.user_id
      where m.store_id = p_store_id),
    'pengaturan', (select to_jsonb(ss) - 'store_id' from public.store_settings ss where ss.store_id = p_store_id),
    'kategori_biaya_admin', (
      select coalesce(jsonb_agg(to_jsonb(c) - 'store_id' order by c.name), '[]'::jsonb)
      from public.fee_categories c where c.store_id = p_store_id),
    'produk', (
      select coalesce(jsonb_agg(to_jsonb(p) - 'store_id' order by p.product_name, p.variant_name), '[]'::jsonb)
      from public.products p where p.store_id = p_store_id),
    'pesanan', (
      select coalesce(jsonb_agg((to_jsonb(o) - 'store_id') - 'uploaded_by' order by o.id), '[]'::jsonb)
      from public.order_items o where o.store_id = p_store_id),
    'penghasilan_harian', (
      select coalesce(jsonb_agg((to_jsonb(i) - 'store_id') - 'uploaded_by' order by i.released_date), '[]'::jsonb)
      from public.income i where i.store_id = p_store_id),
    'penyesuaian_penghasilan', (
      select coalesce(jsonb_agg((to_jsonb(a) - 'store_id') - 'uploaded_by' order by a.id), '[]'::jsonb)
      from public.income_adjustments a where a.store_id = p_store_id),
    'penghasilan_per_pesanan', (
      select coalesce(jsonb_agg((to_jsonb(o) - 'store_id') - 'uploaded_by' order by o.released_date, o.order_no, o.line_no), '[]'::jsonb)
      from public.income_orders o where o.store_id = p_store_id),
    'biaya_bulanan', (
      select coalesce(jsonb_agg(to_jsonb(e) - 'store_id' order by e.month, e.category), '[]'::jsonb)
      from public.expenses e where e.store_id = p_store_id),
    'iklan', (
      select coalesce(jsonb_agg(
        (to_jsonb(r) - 'store_id' - 'uploaded_by') || jsonb_build_object('baris', (
          select coalesce(jsonb_agg(to_jsonb(x) - 'report_id' order by x.seq), '[]'::jsonb)
          from public.ad_rows x where x.report_id = r.id))
        order by r.period_start, r.id), '[]'::jsonb)
      from public.ad_reports r where r.store_id = p_store_id),
    'simulasi_uji_coba', (
      select coalesce(jsonb_agg(jsonb_build_object('hari', t.day, 'jumlah', t.n) order by t.day), '[]'::jsonb)
      from (select day, count(*) as n from public.trial_simulations where store_id = p_store_id group by day) t)
  );
end;
$$;

revoke execute on function public.admin_export_store(bigint) from public, anon, authenticated;

create or replace function public.admin_delete_store(
  p_store_id     bigint,
  p_confirm_name text,
  p_dry_run      boolean default true
)
returns table (item text, jumlah bigint)
language plpgsql
set search_path = public
as $$
declare
  v_name text;
  v_n    bigint;
begin
  select s.name into v_name from public.stores s where s.id = p_store_id;
  if v_name is null then
    raise exception 'Toko % tidak ditemukan.', p_store_id;
  end if;
  if p_confirm_name is distinct from v_name then
    raise exception 'Nama toko tidak cocok. Tulis persis: "%"', v_name;
  end if;

  if p_dry_run then
    item := 'MODE HITUNG SAJA (tidak ada yang dihapus)'; jumlah := 0; return next;
    select count(*) into v_n from public.ad_rows x join public.ad_reports r on r.id = x.report_id where r.store_id = p_store_id;
    item := 'ad_rows'; jumlah := v_n; return next;
    select count(*) into v_n from public.ad_reports where store_id = p_store_id;
    item := 'ad_reports'; jumlah := v_n; return next;
    select count(*) into v_n from public.order_items where store_id = p_store_id;
    item := 'order_items'; jumlah := v_n; return next;
    select count(*) into v_n from public.products where store_id = p_store_id;
    item := 'products'; jumlah := v_n; return next;
    select count(*) into v_n from public.income where store_id = p_store_id;
    item := 'income'; jumlah := v_n; return next;
    select count(*) into v_n from public.income_adjustments where store_id = p_store_id;
    item := 'income_adjustments'; jumlah := v_n; return next;
    select count(*) into v_n from public.income_orders where store_id = p_store_id;
    item := 'income_orders'; jumlah := v_n; return next;
    select count(*) into v_n from public.expenses where store_id = p_store_id;
    item := 'expenses'; jumlah := v_n; return next;
    select count(*) into v_n from public.fee_categories where store_id = p_store_id;
    item := 'fee_categories'; jumlah := v_n; return next;
    select count(*) into v_n from public.store_settings where store_id = p_store_id;
    item := 'store_settings'; jumlah := v_n; return next;
    select count(*) into v_n from public.trial_simulations where store_id = p_store_id;
    item := 'trial_simulations'; jumlah := v_n; return next;
    select count(*) into v_n from public.store_members where store_id = p_store_id;
    item := 'store_members'; jumlah := v_n; return next;
    return;
  end if;

  -- Urutan penting: tabel yang menunjuk ke toko memakai ON DELETE RESTRICT.
  select count(*) into v_n from public.ad_rows x join public.ad_reports r on r.id = x.report_id where r.store_id = p_store_id;
  item := 'ad_rows'; jumlah := v_n; return next;   -- terhapus lewat cascade dari ad_reports
  delete from public.ad_reports where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'ad_reports'; jumlah := v_n; return next;
  delete from public.order_items where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'order_items'; jumlah := v_n; return next;
  delete from public.products where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'products'; jumlah := v_n; return next;
  delete from public.income where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'income'; jumlah := v_n; return next;
  delete from public.income_adjustments where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'income_adjustments'; jumlah := v_n; return next;
  delete from public.income_orders where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'income_orders'; jumlah := v_n; return next;
  delete from public.expenses where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'expenses'; jumlah := v_n; return next;
  delete from public.fee_categories where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'fee_categories'; jumlah := v_n; return next;
  delete from public.store_settings where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'store_settings'; jumlah := v_n; return next;
  delete from public.trial_simulations where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'trial_simulations'; jumlah := v_n; return next;
  delete from public.store_members where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'store_members'; jumlah := v_n; return next;
  delete from public.stores where id = p_store_id;
  get diagnostics v_n = row_count; item := 'stores'; jumlah := v_n; return next;
end;
$$;

revoke execute on function public.admin_delete_store(bigint, text, boolean) from public, anon, authenticated;
