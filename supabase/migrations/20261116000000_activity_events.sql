-- =============================================================================
-- Catatan aktivitas: apakah akun uji coba benar-benar mencoba aplikasinya?
--
-- Yang dicatat hanya NAMA aktivitas, toko, akun, dan waktunya. Tidak ada isi laporan, angka, nama produk,
-- atau data pembeli.
--
--   trial_registered      daftar lewat link uji coba          (otomatis di database, trigger stores)
--   trial_logged_in       masuk / membuka aplikasi            (aplikasi, maks. 1x per 30 menit per akun)
--   report_uploaded       berhasil menyimpan file di Upload   (aplikasi, maks. 1x per menit)
--   profit_report_viewed  membuka Rekap yang ada datanya      (aplikasi, maks. 1x per 10 menit)
--   subscription_paid     pengelola menandai sudah bayar      (otomatis di database: uji coba → berlangganan,
--                         atau langganan diperpanjang; termasuk lewat SQL Editor)
--
-- Sumber pengguna: kolom baru trial_links.source ("Instagram", "Grup FB", …) diisi pengelola saat membuat
-- link. Toko yang daftar lewat link itu ikut sumber tersebut (lewat stores.trial_link_id).
--
--   1. activity_events                : tabel catatan. Tanpa hak baca/tulis untuk aplikasi.
--   2. trial_links.source             : sumber link; platform_create_trial_link(jumlah, hari, sumber) (versi 3
--                                       parameter, pengelola) dan platform_list_trial_links() ikut menampilkan sumber.
--   3. Trigger di stores              : trial_registered & subscription_paid.
--   4. log_activity(toko, aktivitas)  : untuk aplikasi; hanya anggota toko, hanya 3 aktivitas di atas.
--   5. platform_activity_summary()    : hanya pengelola; ringkasan per toko untuk daftar Pelanggan.
--   6. admin_export_store / admin_delete_store ikut menyertakan activity_events.
--
-- Butuh 20261111000000_trial_links.sql. Aman dijalankan lebih dari sekali. Tidak mengubah data yang ada
-- (hanya menambah catatan "daftar" untuk toko yang dulu dibuat lewat link).
-- Boleh sebelum/sesudah deploy: tanpa SQL ini aplikasi diam saja (catatan tidak terkirim), daftar Pelanggan
-- tampil tanpa aktivitas, dan isian Sumber di Buat link ditolak dengan pesan gangguan sistem.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabel catatan aktivitas
-- -----------------------------------------------------------------------------

create table if not exists public.activity_events (
  id         bigint generated always as identity primary key,
  store_id   bigint not null references public.stores (id) on delete cascade,
  -- Akun yang melakukannya (pemilik toko, atau pengelola untuk subscription_paid). null = SQL Editor.
  user_id    uuid references auth.users (id) on delete set null,
  event      text not null check (event in ('trial_registered', 'trial_logged_in', 'report_uploaded',
                                            'profit_report_viewed', 'subscription_paid')),
  created_at timestamptz not null default now()
);

create index if not exists activity_events_store_event_idx on public.activity_events (store_id, event, created_at desc);

-- Aplikasi tidak bisa membaca/mengubah tabel ini; menulis lewat log_activity, membaca lewat
-- platform_activity_summary (pengelola).
alter table public.activity_events enable row level security;
revoke all on public.activity_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Sumber link uji coba
-- -----------------------------------------------------------------------------

alter table public.trial_links add column if not exists source text;
alter table public.trial_links drop constraint if exists trial_links_source_check;
alter table public.trial_links add constraint trial_links_source_check check (source is null or length(source) between 1 and 40);

--   select public.platform_create_trial_link(10, 7, 'Instagram');
-- Tanpa nilai bawaan untuk p_source: versi 2 parameter tetap ada, dan panggilan 2 argumen harus jelas versinya.
create or replace function public.platform_create_trial_link(p_max_uses integer, p_valid_days integer, p_source text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_source text := nullif(trim(coalesce(p_source, '')), '');
  v_out    jsonb;
begin
  -- Pemeriksaan pengelola, jumlah orang, dan masa berlaku ada di versi 2 parameter.
  if v_source is not null and length(v_source) > 40 then
    raise exception 'Sumber maksimal 40 karakter.' using errcode = '22023';
  end if;
  v_out := public.platform_create_trial_link(p_max_uses, p_valid_days);
  update public.trial_links set source = v_source where id = (v_out ->> 'id')::bigint;
  return v_out || jsonb_build_object('source', v_source);
end;
$$;

revoke execute on function public.platform_create_trial_link(integer, integer, text) from public, anon;
grant execute on function public.platform_create_trial_link(integer, integer, text) to authenticated;

-- Kolom hasilnya bertambah (source), jadi fungsinya dibuat ulang.
drop function if exists public.platform_list_trial_links();
create function public.platform_list_trial_links()
returns table (
  id          bigint,
  max_uses    integer,
  used_count  integer,
  expires_at  timestamptz,
  created_at  timestamptz,
  source      text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa melihat link uji coba.' using errcode = '42501';
  end if;

  return query
  select l.id, l.max_uses, l.used_count, l.expires_at, l.created_at, l.source
  from public.trial_links l
  where l.revoked_at is null and l.expires_at > now() and l.used_count < l.max_uses
  order by l.created_at desc, l.id desc;
end;
$$;

revoke execute on function public.platform_list_trial_links() from public, anon;
grant execute on function public.platform_list_trial_links() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Otomatis dari perubahan toko
--    - trial_link_id baru terisi (claim_trial_link)         → trial_registered (atas nama pemilik toko)
--    - uji coba → berlangganan, atau tanggal berakhir maju   → subscription_paid (atas nama pengubahnya)
--      pada toko yang berlangganan
-- -----------------------------------------------------------------------------

create or replace function public.activity_from_store_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.trial_link_id is not null and old.trial_link_id is null then
    insert into public.activity_events (store_id, user_id, event)
    select new.id,
           (select m.user_id from public.store_members m where m.store_id = new.id and m.role = 'owner'
            order by m.user_id limit 1),
           'trial_registered';
  end if;

  if not new.trial and new.active_until is not null
     and (old.trial or old.active_until is null or new.active_until > old.active_until) then
    insert into public.activity_events (store_id, user_id, event)
    values (new.id, (select auth.uid()), 'subscription_paid');
  end if;
  return null;
end;
$$;

revoke execute on function public.activity_from_store_change() from public, anon, authenticated;

drop trigger if exists stores_activity on public.stores;
create trigger stores_activity
  after update of trial, active_until, trial_link_id on public.stores
  for each row execute function public.activity_from_store_change();

-- Toko yang sudah daftar lewat link sebelum SQL ini: catat tanggal daftarnya (sekali saja).
insert into public.activity_events (store_id, user_id, event, created_at)
select s.id,
       (select m.user_id from public.store_members m where m.store_id = s.id and m.role = 'owner' order by m.user_id limit 1),
       'trial_registered',
       s.created_at
from public.stores s
where s.trial_link_id is not null
  and not exists (select 1 from public.activity_events e where e.store_id = s.id and e.event = 'trial_registered');

-- -----------------------------------------------------------------------------
-- 4. Dari aplikasi: catat satu aktivitas
--   Mengembalikan 1 kalau dicatat, 0 kalau dilewati (baru saja dicatat, atau sudah 500 catatan hari ini).
-- -----------------------------------------------------------------------------

create or replace function public.log_activity(p_store_id bigint, p_event text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (select auth.uid());
  v_window interval := case p_event
    when 'trial_logged_in'      then interval '30 minutes'
    when 'profit_report_viewed' then interval '10 minutes'
    when 'report_uploaded'      then interval '1 minute'
  end;
begin
  if v_user is null or not public.is_store_member(p_store_id) then
    raise exception 'permission denied: toko % bukan milik akun ini', p_store_id using errcode = '42501';
  end if;
  -- "daftar" dan "sudah bayar" hanya dicatat database sendiri, tidak bisa dikirim aplikasi.
  if v_window is null then
    raise exception 'permission denied: aktivitas "%" tidak bisa dicatat dari aplikasi', p_event using errcode = '42501';
  end if;

  if exists (select 1 from public.activity_events e
             where e.store_id = p_store_id and e.user_id = v_user and e.event = p_event
               and e.created_at > now() - v_window) then
    return 0;
  end if;
  -- Rem darurat supaya satu akun tidak bisa memenuhi tabel.
  if (select count(*) from public.activity_events e
      where e.store_id = p_store_id and e.created_at > now() - interval '1 day') >= 500 then
    return 0;
  end if;

  insert into public.activity_events (store_id, user_id, event) values (p_store_id, v_user, p_event);
  return 1;
end;
$$;

revoke execute on function public.log_activity(bigint, text) from public, anon;
grant execute on function public.log_activity(bigint, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Pengelola: ringkasan aktivitas per toko (tanpa isi toko)
--   Hari aktif = tanggal (WIB) berbeda yang punya login / upload / buka Rekap.
-- -----------------------------------------------------------------------------

create or replace function public.platform_activity_summary()
returns table (
  store_id        bigint,
  source          text,
  registered_at   timestamptz,
  logins          integer,
  active_days     integer,
  last_active_at  timestamptz,
  uploads         integer,
  first_upload_at timestamptz,
  report_views    integer,
  first_view_at   timestamptz,
  payments        integer,
  first_paid_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya pengelola yang bisa melihat aktivitas pelanggan.' using errcode = '42501';
  end if;

  return query
  select s.id,
         l.source,
         min(e.created_at) filter (where e.event = 'trial_registered'),
         (count(*) filter (where e.event = 'trial_logged_in'))::integer,
         (count(distinct (e.created_at at time zone 'Asia/Jakarta')::date)
            filter (where e.event in ('trial_logged_in', 'report_uploaded', 'profit_report_viewed')))::integer,
         max(e.created_at) filter (where e.event in ('trial_logged_in', 'report_uploaded', 'profit_report_viewed')),
         (count(*) filter (where e.event = 'report_uploaded'))::integer,
         min(e.created_at) filter (where e.event = 'report_uploaded'),
         (count(*) filter (where e.event = 'profit_report_viewed'))::integer,
         min(e.created_at) filter (where e.event = 'profit_report_viewed'),
         (count(*) filter (where e.event = 'subscription_paid'))::integer,
         min(e.created_at) filter (where e.event = 'subscription_paid')
  from public.stores s
  left join public.trial_links l on l.id = s.trial_link_id
  left join public.activity_events e on e.store_id = s.id
  group by s.id, l.source
  order by s.id;
end;
$$;

revoke execute on function public.platform_activity_summary() from public, anon;
grant execute on function public.platform_activity_summary() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Prosedur admin (turunan dari 20261027000000_trial_limits.sql): ikut menyertakan activity_events.
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
      from (select day, count(*) as n from public.trial_simulations where store_id = p_store_id group by day) t),
    'aktivitas', (
      select coalesce(jsonb_agg(jsonb_build_object('aktivitas', a.event, 'waktu', a.created_at) order by a.created_at, a.id), '[]'::jsonb)
      from public.activity_events a where a.store_id = p_store_id)
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
    select count(*) into v_n from public.activity_events where store_id = p_store_id;
    item := 'activity_events'; jumlah := v_n; return next;
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
  delete from public.activity_events where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'activity_events'; jumlah := v_n; return next;
  delete from public.store_members where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'store_members'; jumlah := v_n; return next;
  delete from public.stores where id = p_store_id;
  get diagnostics v_n = row_count; item := 'stores'; jumlah := v_n; return next;
end;
$$;

revoke execute on function public.admin_delete_store(bigint, text, boolean) from public, anon, authenticated;
