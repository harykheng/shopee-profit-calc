-- =============================================================================
-- Uji pemisahan data antar-toko, langsung di database (tanpa Node, tanpa akun tes)
--
-- Cara pakai: Supabase → SQL Editor → New query → tempel SELURUH isi file ini → Run.
-- Hasilnya satu tabel. Baris pertama adalah ringkasan; semua uji harus LULUS.
--
-- Yang dilakukan, di dalam SATU transaksi yang selalu DIBATALKAN di akhir:
--   1. Membuat dua toko uji ("UJI-PEMISAHAN A" dan "UJI-PEMISAHAN B") dan mengisi toko B
--      dengan satu baris di setiap tabel.
--   2. Berpura-pura menjadi satu akun yang login, dengan cara yang sama seperti API Supabase
--      (role `authenticated` + identitas akun di request.jwt.claims). Akun itu dijadikan anggota
--      toko A saja, lalu mencoba membaca, mengubah, menghapus, dan menulis data toko B DAN data
--      semua toko pelanggan lain, lewat tabel, view, dan fungsi upload. Juga mencoba
--      memperpanjang langganannya sendiri dan mendaftarkan diri ke toko B. Lalu, sebagai akun
--      biasa, mencoba fungsi halaman Pengelola (membuat akun, melihat daftar pelanggan) dan
--      menjadikan dirinya pengelola; terakhir, sebagai pengelola, membuat satu akun uji coba
--      (kontrol: harus berhasil dan lengkap, lalu ikut dibatalkan).
--   3. Mencoba membaca dan meng-upload tanpa login (role `anon`).
--   4. Memeriksa struktur: semua tabel di schema public memakai RLS, semua view memakai
--      security_invoker, dan fungsi admin_* tidak bisa dipanggil dari aplikasi.
--   5. Membatalkan semuanya. Toko uji, data uji, dan setiap percobaan yang ternyata tembus
--      tidak tersimpan. Yang tersisa hanya fungsi sementara (pg_temp) yang hilang sendiri
--      saat koneksi SQL Editor ditutup.
--
-- Akun yang dipakai untuk berpura-pura: akun paling lama di Authentication → Users (biasanya
-- akunmu sendiri). Keanggotaannya di toko asli tidak diubah. Untuk memakai akun lain, ganti
-- baris paling bawah menjadi:  select * from pg_temp.uji_pemisahan_toko('email@akun.id');
--
-- Hasil hanya berisi nama tabel, jumlah baris, dan pesan error; tidak ada isi data pelanggan.
-- Kalau SQL Editor memperingatkan "destructive operation": skrip memang MENCOBA mengubah dan
-- menghapus data toko lain sebagai pelanggan (itu ujinya), dan semuanya dibatalkan. Lanjutkan.
-- Biarkan pilihan role di SQL Editor pada `postgres` (bawaan).
-- Pelengkap scripts/check-tenant-isolation.mjs (yang menguji lewat API). Lihat README bagian 8.
-- =============================================================================

create or replace function pg_temp.uji_pemisahan_toko(p_email text default null)
returns table (no integer, status text, uji text, keterangan text)
language plpgsql
as $fn$
declare
  -- Hasil. Variabel plpgsql tidak ikut dibatalkan bersama transaksi, tabel sementara ikut.
  v_status text[] := '{}';
  v_uji    text[] := '{}';
  v_ket    text[] := '{}';

  a_user   uuid;
  a_email  text;
  a_stores bigint[];
  other    uuid;
  sa bigint; sb bigint;   -- toko uji A (milik akun) dan B (bukan milik akun)
  ra bigint; rb bigint;   -- laporan iklan di toko A dan B
  bulan date := date_trunc('month', now() at time zone 'Asia/Jakarta')::date;

  r     record;
  n     bigint;
  n2    bigint;
  m     bigint;
  sisa  jsonb := '{}';
  daftar text;
  kueri  text;
  ok_kontrol boolean;
begin
  select u.id, u.email into a_user, a_email
  from auth.users u
  where p_email is null or lower(u.email) = lower(trim(p_email))
  order by u.created_at
  limit 1;
  if a_user is null then
    return query select 1, 'CEK'::text, 'Memilih akun'::text,
      coalesce('Akun ' || p_email || ' tidak ditemukan.', 'Belum ada akun di Authentication → Users.');
    return;
  end if;
  select u.id into other from auth.users u where u.id <> a_user order by u.created_at limit 1;
  other := coalesce(other, gen_random_uuid());

  -- Migration yang belum dijalankan (dicek dari satu objek penanda per file migration).
  select string_agg(x.berkas, ', ' order by x.berkas) into daftar
  from (values
    ('20260930000000_init.sql',                    to_regclass('public.products') is not null),
    ('20261004000000_income_adjustments.sql',      to_regclass('public.income_adjustments') is not null),
    ('20261005000000_all_order_statuses.sql',      to_regclass('public.orders_by_created') is not null),
    ('20261006000000_ads.sql',                     to_regclass('public.ad_reports') is not null),
    ('20261007000000_product_fee_settings.sql',    exists (select 1 from information_schema.columns
                                                     where table_schema = 'public' and table_name = 'products' and column_name = 'admin_pct')),
    ('20261012000000_multi_tenant.sql',            to_regclass('public.store_members') is not null),
    ('20261013000000_read_only_when_expired.sql',  exists (select 1 from pg_policies
                                                     where schemaname = 'public' and tablename = 'products' and policyname = 'anggota: baca')),
    ('20261014000000_fee_categories.sql',          to_regclass('public.fee_categories') is not null),
    ('20261015000000_store_settings.sql',          to_regclass('public.store_settings') is not null),
    ('20261016000000_operations.sql',              to_regclass('public.client_errors') is not null),
    ('20261020000000_income_orders.sql',           to_regclass('public.income_orders') is not null),
    ('20261021000000_income_per_order_views.sql',  to_regclass('public.order_item_income') is not null),
    ('20261022000000_income_monthly_breakdown.sql', to_regclass('public.income_monthly_breakdown') is not null),
    ('20261023000000_admin_reset_password.sql',    to_regprocedure('public.admin_reset_password(text, text)') is not null),
    ('20261026000000_platform_admin.sql',          to_regprocedure('public.platform_create_trial(text, text, text, date)') is not null),
    ('20261027000000_trial_limits.sql',            to_regclass('public.trial_simulations') is not null),
    ('20261028000000_trial_limits_total.sql',      exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                                                     where s.nspname = 'public' and p.proname = 'use_trial_simulation'
                                                       and p.prosrc like '%count(distinct item_key)%'))
  ) as x (berkas, ada)
  where not x.ada;
  v_status := v_status || case when daftar is null then 'LULUS' else 'CEK' end;
  v_uji := v_uji || 'Struktur: semua migration sudah dijalankan'::text;
  v_ket := v_ket || coalesce('Belum dijalankan: ' || daftar || '. Jalankan berurutan di SQL Editor, lalu ulangi uji ini.', 'ya, sampai 20261028000000_trial_limits_total.sql');

  begin  -- Semua di blok ini dibatalkan oleh raise 'UJ000' di akhir.

    -- -------------------------------------------------------------------------
    -- 1. Toko uji dan data toko B (sebagai pemilik tabel, seperti SQL Editor biasa)
    -- -------------------------------------------------------------------------
    insert into public.stores (name, active_until) values ('UJI-PEMISAHAN A', null) returning id into sa;
    insert into public.stores (name, active_until) values ('UJI-PEMISAHAN B', null) returning id into sb;
    insert into public.store_members (store_id, user_id, role) values (sa, a_user, 'owner');
    -- Akun uji diperlakukan sebagai pelanggan biasa, walau aslinya pengelola (dikembalikan di akhir).
    begin
      execute 'delete from public.platform_admins where user_id = $1' using a_user;
    exception when undefined_table then null;
    end;
    a_stores := array(select m2.store_id from public.store_members m2 where m2.user_id = a_user);

    -- Tiap tabel dilindungi sendiri: tabel yang belum ada (migration terlewat) tidak menghentikan uji.
    begin
      execute 'insert into public.ad_reports (store_id, period_start, period_end, source) values ($1, $2, $2 + 6, ''keseluruhan'') returning id'
        into rb using sb, bulan;
      execute 'insert into public.ad_reports (store_id, period_start, period_end, source) values ($1, $2, $2 + 6, ''keseluruhan'') returning id'
        into ra using sa, bulan;
    exception when undefined_table or undefined_column then null;
    end;
    for r in
      select x.nama, x.kueri from (values
        ('products',           'insert into public.products (store_id, sku, product_name, hpp) values ($1, ''UJI-B'', ''Produk uji B'', 1000)'),
        ('order_items',        'insert into public.order_items (store_id, order_no, sku, product_name, qty, status, status_group, completed_at, created_at, subtotal) values ($1, ''UJI-B'', ''UJI-B'', ''Produk uji B'', 1, ''Selesai'', ''selesai'', now(), now(), 5000)'),
        -- HPP diubah setelah pesanan tersimpan: hpp_snapshot pesanan tetap 1000, jadi recalc_hpp
        -- punya satu baris untuk diubah kalau RLS-nya bocor.
        ('products (HPP baru)', 'update public.products set hpp = 2000 where store_id = $1'),
        ('income',             'insert into public.income (store_id, released_date, subtotal_pesanan, total_income) values ($1, $2, 5000, 4000)'),
        ('income_adjustments', 'insert into public.income_adjustments (store_id, released_date, description, amount) values ($1, $2, ''uji'', 100)'),
        ('income_orders',      'insert into public.income_orders (store_id, order_no, line_no, product_id, released_date, harga_produk, total_income) values ($1, ''UJI-B'', 1, ''UJI-B'', $2, 5000, 4000)'),
        ('expenses',           'insert into public.expenses (store_id, month, category, amount, note) values ($1, $2, ''packaging'', 100, ''uji'')'),
        ('ad_rows',            'insert into public.ad_rows (report_id, seq, ad_name, spend) values ($3, 1, ''uji'', 100)'),
        ('fee_categories',     'insert into public.fee_categories (store_id, name, admin_pct) values ($1, ''UJI kategori'', 5)'),
        ('store_settings',     'insert into public.store_settings (store_id, ads_target_profit_pct) values ($1, 10)'),
        ('client_errors',      'insert into public.client_errors (store_id, kind, message, fingerprint) values ($1, ''handled'', ''uji'', ''uji'')'),
        ('trial_simulations',  'insert into public.trial_simulations (store_id, day, item_key) values ($1, $2, ''uji'')')
      ) as x (nama, kueri)
    loop
      begin
        execute r.kueri using sb, bulan, rb;
      exception when undefined_table or undefined_column or not_null_violation then null;
      end;
    end loop;

    -- Jumlah baris yang SEHARUSNYA tidak terlihat oleh akun, per tabel/view (dihitung sebagai pemilik).
    for r in
      select c.relname,
             exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'store_id'
                     and not a.attisdropped) as punya_store_id
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      order by c.relname
    loop
      kueri := case
        when r.relname = 'stores'  then 'select count(*) from public.stores where not (id = any($1))'
        when r.relname = 'ad_rows' then 'select count(*) from public.ad_rows x join public.ad_reports y on y.id = x.report_id where not (y.store_id = any($1))'
        when r.relname = 'store_members' then 'select count(*) from public.store_members where user_id <> $2'
        when r.punya_store_id      then format('select count(*) from public.%I where store_id is not null and not (store_id = any($1))', r.relname)
        else format('select count(*) from public.%I', r.relname) end;
      execute kueri into n using a_stores, a_user;
      sisa := sisa || jsonb_build_object(r.relname, n);
    end loop;

    -- -------------------------------------------------------------------------
    -- 4. Struktur (sebagai pemilik, sebelum berpura-pura menjadi akun)
    -- -------------------------------------------------------------------------
    select string_agg(c.relname, ', ' order by c.relname) into daftar
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      and (has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
           or has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE'));
    v_status := v_status || case when daftar is null then 'LULUS' else 'GAGAL' end;
    v_uji := v_uji || 'Struktur: semua tabel public memakai RLS'::text;
    v_ket := v_ket || coalesce('RLS mati di: ' || daftar, 'ya');

    select string_agg(c.relname, ', ' order by c.relname) into daftar
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind in ('v', 'm')
      and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'SELECT'))
      and not (c.relkind = 'v' and coalesce(c.reloptions, '{}') && array['security_invoker=true', 'security_invoker=on', 'security_invoker=1']);
    v_status := v_status || case when daftar is null then 'LULUS' else 'GAGAL' end;
    v_uji := v_uji || 'Struktur: semua view ikut RLS pembacanya (security_invoker)'::text;
    v_ket := v_ket || coalesce('Bisa dibaca aplikasi tanpa RLS: ' || daftar, 'ya');

    select string_agg(p.proname, ', ' order by p.proname) into daftar
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname like 'admin\_%'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'));
    v_status := v_status || case when daftar is null then 'LULUS' else 'GAGAL' end;
    v_uji := v_uji || 'Struktur: fungsi admin_* tertutup untuk aplikasi'::text;
    v_ket := v_ket || coalesce('Bisa dipanggil dari aplikasi: ' || daftar,
      (select count(*) || ' fungsi admin_*, semuanya hanya untuk SQL Editor'
       from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname like 'admin\_%'));

    select string_agg(p.proname, ', ' order by p.proname) into daftar
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prosecdef
      -- Tiga fungsi halaman Pengelola memeriksa is_platform_admin() sendiri; diuji di bagian 2e.
      and p.proname not in ('is_store_member', 'is_store_active', 'client_errors_rate_limit',
                            'is_platform_admin', 'platform_create_trial', 'platform_list_customers',
                            -- Memeriksa keanggotaan toko sendiri; diuji di bagian 2c.
                            'use_trial_simulation')
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'));
    v_status := v_status || case when daftar is null then 'LULUS' else 'CEK' end;
    v_uji := v_uji || 'Struktur: tidak ada fungsi security definer baru yang terbuka'::text;
    v_ket := v_ket || coalesce('Periksa apakah fungsi ini memeriksa keanggotaan toko: ' || daftar, 'ya');

    -- -------------------------------------------------------------------------
    -- 2. Sebagai akun yang login (anggota toko A saja)
    -- -------------------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', a_user::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', a_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;

    -- 2a. Membaca: toko B, lalu semua toko yang bukan miliknya (termasuk pelanggan sungguhan).
    for r in
      select c.relname,
             exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'store_id'
                     and not a.attisdropped) as punya_store_id
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      order by c.relname
    loop
      begin
        kueri := case
          when r.relname = 'stores'  then 'select count(*) from public.stores where id = $1'
          when r.relname = 'ad_rows' then 'select count(*) from public.ad_rows where report_id = $2'
          when r.punya_store_id      then format('select count(*) from public.%I where store_id = $1', r.relname)
          else format('select count(*) from public.%I', r.relname) end;
        execute kueri into n using sb, rb;
        kueri := case
          when r.relname = 'stores'  then 'select count(*) from public.stores where not (id = any($1))'
          when r.relname = 'ad_rows' then 'select count(*) from public.ad_rows x where not exists (select 1 from public.ad_reports y where y.id = x.report_id and y.store_id = any($1))'
          when r.relname = 'store_members' then 'select count(*) from public.store_members where user_id <> $2'
          when r.punya_store_id      then format('select count(*) from public.%I where store_id is not null and not (store_id = any($1))', r.relname)
          else format('select count(*) from public.%I', r.relname) end;
        execute kueri into n2 using a_stores, a_user;
        m := (sisa ->> r.relname)::bigint;
        v_status := v_status || case
          when n > 0 or n2 > 0 then 'GAGAL'
          when m = 0 then 'DILEWATI'
          else 'LULUS' end;
        v_ket := v_ket || case
          when n > 0 or n2 > 0 then format('terbaca %s baris toko B dan %s baris toko lain', n, n2)
          when m = 0 then 'tidak ada data toko lain di tabel ini untuk dicoba'
          else format('0 baris terlihat (dari %s baris milik toko lain)', m) end;
      exception
        when insufficient_privilege then
          v_status := v_status || 'LULUS'::text;
          v_ket := v_ket || ('ditolak: ' || sqlerrm);
        when others then
          v_status := v_status || 'CEK'::text;
          v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): ' else sqlstate || ' ' end || sqlerrm);
      end;
      v_uji := v_uji || ('Baca ' || r.relname || ' milik toko lain');
    end loop;

    -- 2b. Mengubah dan menghapus data toko lain. Setiap percobaan dibatalkan sendiri ('UJ001')
    --     supaya satu celah tidak mempengaruhi uji berikutnya.
    for r in
      select x.nama, x.kueri from (values
        ('Ubah data toko lain: products',           'update public.products set product_name = product_name where not (store_id = any($1))'),
        ('Ubah data toko lain: order_items',        'update public.order_items set qty = qty where not (store_id = any($1))'),
        ('Ubah data toko lain: income',             'update public.income set total_income = total_income where not (store_id = any($1))'),
        ('Ubah data toko lain: income_adjustments', 'update public.income_adjustments set amount = amount where not (store_id = any($1))'),
        ('Ubah data toko lain: income_orders',      'update public.income_orders set total_income = total_income where not (store_id = any($1))'),
        ('Ubah data toko lain: expenses',           'update public.expenses set note = note where not (store_id = any($1))'),
        ('Ubah data toko lain: ad_reports',         'update public.ad_reports set shop_name = shop_name where not (store_id = any($1))'),
        ('Ubah data toko lain: ad_rows',            'update public.ad_rows set spend = spend where report_id not in (select id from public.ad_reports where store_id = any($1))'),
        ('Ubah data toko lain: fee_categories',     'update public.fee_categories set admin_pct = admin_pct where not (store_id = any($1))'),
        ('Ubah data toko lain: store_settings',     'update public.store_settings set ads_target_profit_pct = ads_target_profit_pct where not (store_id = any($1))'),
        ('Hapus data toko lain: products',           'delete from public.products where not (store_id = any($1))'),
        ('Hapus data toko lain: order_items',        'delete from public.order_items where not (store_id = any($1))'),
        ('Hapus data toko lain: income',             'delete from public.income where not (store_id = any($1))'),
        ('Hapus data toko lain: income_adjustments', 'delete from public.income_adjustments where not (store_id = any($1))'),
        ('Hapus data toko lain: income_orders',      'delete from public.income_orders where not (store_id = any($1))'),
        ('Hapus data toko lain: expenses',           'delete from public.expenses where not (store_id = any($1))'),
        ('Hapus data toko lain: ad_reports',         'delete from public.ad_reports where not (store_id = any($1))'),
        ('Hapus data toko lain: ad_rows',            'delete from public.ad_rows where report_id not in (select id from public.ad_reports where store_id = any($1))'),
        ('Hapus data toko lain: fee_categories',     'delete from public.fee_categories where not (store_id = any($1))'),
        ('Hapus data toko lain: store_settings',     'delete from public.store_settings where not (store_id = any($1))'),
        ('Hapus laporan error',                      'delete from public.client_errors'),
        ('Perpanjang langganan toko sendiri',        'update public.stores set active_until = date ''2099-12-31'' where id = any($1)'),
        ('Ubah nama toko lain',                      'update public.stores set name = name where not (id = any($1))'),
        ('Pindahkan keanggotaan ke toko lain',       'update public.store_members set store_id = $2 where user_id = $3'),
        ('Hapus keanggotaan pelanggan lain',         'delete from public.store_members where user_id <> $3')
      ) as x (nama, kueri)
    loop
      begin
        execute r.kueri using a_stores, sb, a_user;
        get diagnostics n = row_count;
        v_status := v_status || case when n = 0 then 'LULUS' else 'GAGAL' end;
        v_ket := v_ket || case when n = 0 then '0 baris berubah' else n || ' baris berhasil diubah/dihapus' end;
        raise exception using errcode = 'UJ001';
      exception
        when sqlstate 'UJ001' then null;
        when insufficient_privilege then
          v_status := v_status || 'LULUS'::text;
          v_ket := v_ket || ('ditolak: ' || sqlerrm);
        when others then
          v_status := v_status || 'CEK'::text;
          v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): ' else sqlstate || ' ' end || sqlerrm);
      end;
      v_uji := v_uji || r.nama;
    end loop;

    -- 2c. Menulis ke toko B. Kontrol dulu ke toko A (harus berhasil), supaya penolakan di toko B
    --     memang karena bukan anggota, bukan karena perintahnya salah.
    for r in
      select x.nama, x.kueri from (values
        ('Tulis ke toko lain: products',
         'insert into public.products (store_id, sku, product_name) values ($1, ''UJI-TULIS'', ''uji'')'),
        ('Tulis ke toko lain: order_items',
         'insert into public.order_items (store_id, order_no, sku, product_name, qty, status) values ($1, ''UJI-TULIS'', ''UJI-TULIS'', ''uji'', 1, ''Selesai'')'),
        ('Tulis ke toko lain: income',
         'insert into public.income (store_id, released_date, total_income) values ($1, date ''2000-01-01'', 1)'),
        ('Tulis ke toko lain: income_adjustments',
         'insert into public.income_adjustments (store_id, released_date, description, amount) values ($1, date ''2000-01-01'', ''uji'', 1)'),
        ('Tulis ke toko lain: income_orders',
         'insert into public.income_orders (store_id, order_no, line_no, released_date, total_income) values ($1, ''UJI-TULIS'', 1, date ''2000-01-01'', 1)'),
        ('Tulis ke toko lain: expenses',
         'insert into public.expenses (store_id, month, category, amount) values ($1, date ''2000-01-01'', ''meta_ads'', 1)'),
        ('Tulis ke toko lain: ad_reports',
         'insert into public.ad_reports (store_id, period_start, period_end, source) values ($1, date ''2000-01-01'', date ''2000-01-07'', ''otomatis'')'),
        ('Tulis ke toko lain: ad_rows',
         'insert into public.ad_rows (report_id, seq, ad_name) values ($2, 99, ''uji'')'),
        ('Tulis ke toko lain: fee_categories',
         'insert into public.fee_categories (store_id, name, admin_pct) values ($1, ''UJI tulis'', 1)'),
        ('Tulis ke toko lain: store_settings',
         'insert into public.store_settings (store_id, return_recovery_pct) values ($1, 5)'),
        ('Laporan error atas nama toko lain',
         'insert into public.client_errors (user_id, store_id, kind, message, fingerprint) values ($3, $1, ''handled'', ''uji'', ''uji'')'),
        ('Laporan error atas nama akun lain',
         'insert into public.client_errors (user_id, store_id, kind, message, fingerprint) values ($4, null, ''handled'', ''uji'', ''uji'')'),
        ('Upload pesanan ke toko lain (upsert_order_items)',
         'select inserted + updated from public.upsert_order_items($1, ''[{"order_no":"UJI-RPC","sku":"UJI-RPC","sku_source":"sku","product_name":"uji","variant_name":"","qty":1,"returned_qty":0,"status":"Selesai","status_group":"selesai","return_status":"","completed_at":"2000-01-02T00:00:00+07:00","created_at":"2000-01-01T00:00:00+07:00","subtotal":1}]''::jsonb)'),
        ('Upload penghasilan ke toko lain (upsert_income)',
         'select inserted + updated from public.upsert_income($1, ''[{"released_date":"2000-01-01","total_income":1}]''::jsonb)'),
        ('Upload penyesuaian ke toko lain (upsert_income_adjustments)',
         'select inserted + updated from public.upsert_income_adjustments($1, ''[{"released_date":"2000-01-01","description":"uji","amount":1}]''::jsonb)'),
        ('Upload laporan penghasilan Excel ke toko lain (save_income_report)',
         'select inserted + updated + adjustments + orders from public.save_income_report($1, date ''2000-01-01'', date ''2000-01-31'', ''[{"released_date":"2000-01-01","total_income":1}]''::jsonb, ''[{"released_date":"2000-01-01","description":"uji","amount":1}]''::jsonb, ''[{"order_no":"UJI-RPC","line_no":1,"released_date":"2000-01-01","total_income":1}]''::jsonb)'),
        ('Upload iklan ke toko lain (save_ad_report)',
         'select 1 from public.save_ad_report($1, date ''2000-02-01'', date ''2000-02-07'', ''otomatis'', ''uji'', ''[{"ad_name":"uji"}]''::jsonb)'),
        ('Hitung ulang HPP toko lain (recalc_hpp)',
         'select public.recalc_hpp($1, $5, false)'),
        ('Pakai jatah simulasi toko lain (use_trial_simulation)',
         'select (public.use_trial_simulation($1, ''uji'') ->> ''used'')::bigint')
      ) as x (nama, kueri)
    loop
      -- Kontrol ke toko A: $1 = toko A, $2 = laporan iklan A, $3 dan $4 = akun sendiri.
      ok_kontrol := true;
      begin
        if r.kueri like 'select%' then
          execute r.kueri into n using sa, ra, a_user, a_user, bulan;
        else
          execute r.kueri using sa, ra, a_user, a_user, bulan;
        end if;
        raise exception using errcode = 'UJ001';
      exception
        when sqlstate 'UJ001' then null;
        when others then
          ok_kontrol := false;
          v_status := v_status || 'CEK'::text;
          v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): '
                                  else 'kontrol ke toko sendiri gagal, jadi uji ini belum bermakna: ' || sqlstate || ' ' end || sqlerrm);
      end;
      if ok_kontrol then
        -- Uji ke toko B: $1 = toko B, $2 = laporan iklan B, $3 = akun sendiri, $4 = akun lain.
        begin
          if r.kueri like 'select%' then
            execute r.kueri into n using sb, rb, a_user, other, bulan;
          else
            execute r.kueri using sb, rb, a_user, other, bulan;
            get diagnostics n = row_count;
          end if;
          v_status := v_status || case when coalesce(n, 0) = 0 then 'LULUS' else 'GAGAL' end;
          v_ket := v_ket || case when coalesce(n, 0) = 0 then '0 baris tertulis' else n || ' baris berhasil ditulis' end;
          raise exception using errcode = 'UJ001';
        exception
          when sqlstate 'UJ001' then null;
          when insufficient_privilege then
            v_status := v_status || 'LULUS'::text;
            v_ket := v_ket || ('ditolak: ' || sqlerrm);
          when others then
            v_status := v_status || 'CEK'::text;
            v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): ' else sqlstate || ' ' end || sqlerrm);
        end;
      end if;
      v_uji := v_uji || r.nama;
    end loop;

    -- 2d. Mendaftarkan diri ke toko lain dan membuat toko sendiri.
    for r in
      select x.nama, x.kueri from (values
        ('Daftarkan diri ke toko lain', 'insert into public.store_members (store_id, user_id, role) values ($1, $2, ''owner'')'),
        ('Buat toko sendiri',           'insert into public.stores (name) values (''UJI-PEMISAHAN C'')'),
        ('Jadikan diri sendiri pengelola', 'insert into public.platform_admins (user_id) values ($2)')
      ) as x (nama, kueri)
    loop
      begin
        execute r.kueri using sb, a_user;
        get diagnostics n = row_count;
        v_status := v_status || case when n = 0 then 'LULUS' else 'GAGAL' end;
        v_ket := v_ket || case when n = 0 then '0 baris tertulis' else 'berhasil' end;
        raise exception using errcode = 'UJ001';
      exception
        when sqlstate 'UJ001' then null;
        when insufficient_privilege then
          v_status := v_status || 'LULUS'::text;
          v_ket := v_ket || ('ditolak: ' || sqlerrm);
        when others then
          v_status := v_status || 'CEK'::text;
          v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): ' else sqlstate || ' ' end || sqlerrm);
      end;
      v_uji := v_uji || r.nama;
    end loop;

    -- 2e. Halaman Pengelola: pelanggan biasa tidak boleh membuat akun atau melihat daftar pelanggan.
    begin
      execute 'select public.is_platform_admin()' into ok_kontrol;
      v_status := v_status || case when ok_kontrol then 'GAGAL' else 'LULUS' end;
      v_ket := v_ket || case when ok_kontrol then 'akun biasa dianggap pengelola' else 'tidak (benar)' end;
    exception when others then
      v_status := v_status || 'CEK'::text;
      v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): ' else sqlstate || ' ' end || sqlerrm);
    end;
    v_uji := v_uji || 'Bukan pengelola: dianggap pengelola?'::text;

    for r in
      select x.nama, x.kueri from (values
        ('Bukan pengelola: buat akun uji coba (platform_create_trial)',
         'select count(*) from (select public.platform_create_trial(''uji-pemisahan-tolak@contoh.invalid'', ''UjiPemisahan123'', ''UJI-PEMISAHAN D'', current_date + 7)) x'),
        ('Bukan pengelola: lihat daftar pelanggan (platform_list_customers)',
         'select count(*) from public.platform_list_customers()')
      ) as x (nama, kueri)
    loop
      begin
        execute r.kueri into n;
        v_status := v_status || 'GAGAL'::text;
        v_ket := v_ket || 'berhasil dipanggil oleh akun biasa'::text;
        raise exception using errcode = 'UJ001';
      exception
        when sqlstate 'UJ001' then null;
        when insufficient_privilege then
          v_status := v_status || 'LULUS'::text;
          v_ket := v_ket || ('ditolak: ' || sqlerrm);
        when others then
          v_status := v_status || 'CEK'::text;
          v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): ' else sqlstate || ' ' end || sqlerrm);
      end;
      v_uji := v_uji || r.nama;
    end loop;

    -- Kontrol: sebagai pengelola, membuat akun uji coba harus berhasil dan lengkap (akun login, identitas
    -- email, toko uji coba, pemilik). Kalau gagal, kemungkinan format tabel login Supabase berubah.
    begin
      reset role;
      execute 'insert into public.platform_admins (user_id) values ($1) on conflict do nothing' using a_user;
      set local role authenticated;
      execute 'select public.platform_create_trial($1, ''UjiPemisahan123'', ''UJI-PEMISAHAN D'', current_date + 7)'
        into sisa using 'uji-pemisahan-' || substr(md5(random()::text), 1, 8) || '@contoh.invalid';
      reset role;
      select count(*) into n from auth.users u
        where u.id = (sisa ->> 'user_id')::uuid and u.encrypted_password like '$2%' and u.email_confirmed_at is not null;
      select count(*) into n2 from auth.identities i where i.user_id = (sisa ->> 'user_id')::uuid and i.provider = 'email';
      select count(*) into m from public.stores s
        join public.store_members sm on sm.store_id = s.id and sm.user_id = (sisa ->> 'user_id')::uuid and sm.role = 'owner'
        where s.id = (sisa ->> 'store_id')::bigint and s.trial and s.active_until = current_date + 7;
      v_status := v_status || case when n = 1 and n2 = 1 and m = 1 then 'LULUS' else 'GAGAL' end;
      v_ket := v_ket || case when n = 1 and n2 = 1 and m = 1 then 'akun, identitas email, toko, dan pemilik terbentuk'
                             else format('tidak lengkap: akun %s, identitas %s, toko+pemilik %s', n, n2, m) end;
    exception when others then
      reset role;
      v_status := v_status || 'CEK'::text;
      v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): '
                              else 'gagal membuat akun, halaman Pengelola perlu diperbaiki: ' || sqlstate || ' ' end || sqlerrm);
    end;
    v_uji := v_uji || 'Pengelola: buat akun uji coba (kontrol)'::text;

    -- 2f. Akun uji coba: bulan di atas batas ditolak, bulan yang sudah ada tetap boleh. Mengikuti
    --     angka di trial_month_limit(), jadi tidak perlu diubah kalau batasnya diganti.
    begin
      reset role;
      execute 'update public.stores set trial = true where id = $1' using sa;
      set local role authenticated;
      -- Isi bulan ini, bulan lalu, ... sampai jatah bulan toko A penuh (toko A sudah punya iklan bulan ini).
      execute 'select public.trial_month_limit()' into m;
      n := 0;
      loop
        execute 'select cardinality(public.trial_months_used($1))' into n2 using sa;
        exit when n2 >= m;
        execute 'select inserted from public.upsert_income($1, jsonb_build_array(jsonb_build_object(''released_date'', $2 - make_interval(months => $3::int), ''total_income'', 1)))'
          into r using sa, bulan, n;
        n := n + 1;
      end loop;
      begin
        -- Bulan berikutnya di luar jatah.
        execute 'select inserted from public.upsert_income($1, jsonb_build_array(jsonb_build_object(''released_date'', $2 - make_interval(months => $3::int + 12), ''total_income'', 1)))'
          into n2 using sa, bulan, n;
        v_status := v_status || 'GAGAL'::text;
        v_ket := v_ket || format('bulan ke-%s tersimpan di toko uji coba', m + 1);
      exception when others then
        if sqlerrm like 'trial_month_limit:%' then
          execute 'select inserted + updated from public.upsert_income($1, jsonb_build_array(jsonb_build_object(''released_date'', $2 + 1, ''total_income'', 1)))'
            into n2 using sa, bulan;
          v_status := v_status || case when n2 = 1 then 'LULUS' else 'GAGAL' end;
          v_ket := v_ket || case when n2 = 1 then format('bulan ke-%s ditolak; bulan yang sudah ada tetap tersimpan', m + 1)
                                 else 'bulan yang sudah ada ikut ditolak' end;
        else
          v_status := v_status || 'CEK'::text;
          v_ket := v_ket || (sqlstate || ' ' || sqlerrm);
        end if;
      end;
      reset role;
      execute 'update public.stores set trial = false where id = $1' using sa;
    exception when others then
      reset role;
      v_status := v_status || 'CEK'::text;
      v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): ' else sqlstate || ' ' end || sqlerrm);
    end;
    v_uji := v_uji || 'Uji coba: data maksimal sesuai trial_month_limit()'::text;

    -- -------------------------------------------------------------------------
    -- 3. Tanpa login (anon)
    -- -------------------------------------------------------------------------
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.role', 'anon', true);
    set local role anon;

    daftar := null;
    m := 0;
    for r in
      select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      order by c.relname
    loop
      m := m + 1;
      begin
        execute format('select count(*) from public.%I', r.relname) into n;
        if n > 0 then daftar := concat_ws(', ', daftar, r.relname || ' (' || n || ' baris)'); end if;
      exception
        when insufficient_privilege then null;
        when others then daftar := concat_ws(', ', daftar, r.relname || ' (error ' || sqlstate || ')');
      end;
    end loop;
    v_status := v_status || case when daftar is null then 'LULUS' else 'GAGAL' end;
    v_uji := v_uji || 'Tanpa login: baca semua tabel dan view'::text;
    v_ket := v_ket || coalesce('Terbaca: ' || daftar, m || ' tabel/view, semuanya ditolak atau kosong');

    begin
      execute 'select inserted from public.upsert_income($1, ''[{"released_date":"2000-01-01","total_income":1}]''::jsonb)' into n using sb;
      v_status := v_status || 'GAGAL'::text;
      v_ket := v_ket || 'upload diterima tanpa login'::text;
      raise exception using errcode = 'UJ001';
    exception
      when sqlstate 'UJ001' then null;
      when insufficient_privilege then
        v_status := v_status || 'LULUS'::text;
        v_ket := v_ket || ('ditolak: ' || sqlerrm);
      when others then
        v_status := v_status || 'CEK'::text;
        v_ket := v_ket || (case when sqlstate in ('42P01', '42703', '42883') then 'belum ada di database (migration belum dijalankan): ' else sqlstate || ' ' end || sqlerrm);
    end;
    v_uji := v_uji || 'Tanpa login: upload penghasilan'::text;

    reset role;
    raise exception using errcode = 'UJ000';
  exception
    when sqlstate 'UJ000' then null;  -- selesai: semua perubahan di atas dibatalkan
    when others then
      v_status := v_status || 'CEK'::text;
      v_uji := v_uji || 'Uji berhenti di tengah jalan'::text;
      v_ket := v_ket || (sqlstate || ' ' || sqlerrm || ' (semua perubahan tetap dibatalkan)');
  end;

  return query
  select 0,
         case when 'GAGAL' = any(v_status) then 'GAGAL'
              when 'CEK' = any(v_status) then 'CEK'
              else 'LULUS' end,
         'RINGKASAN (akun uji: ' || coalesce(a_email, a_user::text) || ')',
         format('%s lulus, %s gagal, %s perlu dicek, %s dilewati. Tidak ada data yang diubah.',
                (select count(*) from unnest(v_status) s where s = 'LULUS'),
                (select count(*) from unnest(v_status) s where s = 'GAGAL'),
                (select count(*) from unnest(v_status) s where s = 'CEK'),
                (select count(*) from unnest(v_status) s where s = 'DILEWATI'))
  union all
  select t.i::integer, t.s, t.u, t.k
  from unnest(v_status, v_uji, v_ket) with ordinality as t (s, u, k, i)
  order by 1;
end;
$fn$;

select * from pg_temp.uji_pemisahan_toko();
