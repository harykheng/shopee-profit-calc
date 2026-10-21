-- =============================================================================
-- Penghasilan per pesanan (file Excel "Sudah Dilepas")
--
-- Export Keuangan → Penghasilan Saya → Sudah Dilepas (.xlsx) berisi angka yang sama dengan PDF
-- bulanan (uang cair per tanggal + biaya penyesuaian), ditambah rincian per pesanan & produk.
-- File ini menambah:
--
--   * income_orders : satu baris per produk per pesanan yang dananya sudah dilepas. Belum dipakai
--                     hitungan Rekap; uang cair per tanggal tetap disimpan di tabel income seperti
--                     dari PDF, jadi angka untung TIDAK berubah.
--   * income_adjustments.order_no : nomor pesanan yang terhubung ke penyesuaian (hanya dari Excel).
--   * save_income_report : simpan satu laporan penghasilan (PDF atau Excel) dalam satu transaksi.
--     Biaya penyesuaian di periode laporan DIGANTI (bukan ditambah), karena PDF dan Excel bisa
--     mencatat penyesuaian yang sama dengan tanggal berbeda (mis. 30 vs 31 Juli). Laporan yang
--     disimpan terakhir menjadi acuan periode itu.
--   * admin_export_store / admin_delete_store ikut menyertakan income_orders.
--
-- Tidak menyimpan data pembeli. Aturan akses sama dengan tabel data lain (20261012, 20261013):
-- anggota toko boleh MEMBACA kapan saja, MENULIS hanya kalau langganan aktif.
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data yang ada.
-- Jalankan SETELAH 20261016000000_operations.sql.
-- =============================================================================

create table if not exists public.income_orders (
  id                  bigint generated always as identity primary key,
  store_id            bigint not null references public.stores (id) on delete restrict,
  order_no            text not null,
  -- Urutan produk di pesanan itu (1, 2, ...).
  line_no             integer not null check (line_no >= 1),
  -- No. Pengajuan retur/refund; '' kalau tidak ada.
  return_no           text not null default '',
  -- ID Produk Shopee; '' kalau tidak tercantum.
  product_id          text not null default '',
  product_name        text not null default '',
  created_date        date,
  released_date       date not null,
  harga_produk        bigint not null default 0,
  pengembalian_dana   bigint not null default 0,
  subtotal_ongkir     bigint not null default 0,
  voucher_subsidi     bigint not null default 0,
  biaya_admin         bigint not null default 0,
  biaya_proses        bigint not null default 0,
  biaya_gratis_ongkir bigint not null default 0,
  -- Kampanye, AMS, premi, pajak, dan kolom biaya baru dari Shopee yang belum dikenal.
  biaya_lain          bigint not null default 0,
  total_income        bigint not null,
  uploaded_by         uuid default auth.uid() references auth.users (id) on delete set null,
  uploaded_at         timestamptz not null default now(),
  unique (store_id, order_no, line_no)
);

create index if not exists income_orders_store_released_idx on public.income_orders (store_id, released_date);

alter table public.income_orders enable row level security;

revoke all on public.income_orders from anon;
grant select, insert, update, delete on public.income_orders to authenticated;

drop policy if exists "anggota: baca" on public.income_orders;
create policy "anggota: baca" on public.income_orders
  for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "anggota aktif: akses penuh" on public.income_orders;
create policy "anggota aktif: akses penuh" on public.income_orders
  for all to authenticated
  using (public.is_store_active(store_id)) with check (public.is_store_active(store_id));

alter table public.income_adjustments add column if not exists order_no text;

-- -----------------------------------------------------------------------------
-- Simpan satu laporan penghasilan
--   p_days        : sama dengan upsert_income (satu objek per tanggal dana dilepas)
--   p_adjustments : [{ released_date, description, amount, order_no? }] urut seperti di laporan,
--                   atau null = jangan sentuh penyesuaian (bagian penyesuaian di PDF tidak terbaca)
--   p_orders      : baris income_orders (tanpa store_id), atau null (PDF)
--   p_period_*    : periode laporan. Kalau kosong (periode di PDF tidak terbaca), penyesuaian
--                   ditambah/diperbarui seperti dulu (upsert_income_adjustments), tidak diganti.
-- Hak akses lewat RLS (security invoker): tanpa langganan aktif / bukan anggota → gagal, tidak ada
-- yang berubah karena semua langkah satu transaksi.
-- -----------------------------------------------------------------------------

create or replace function public.save_income_report(
  p_store_id     bigint,
  p_period_start date,
  p_period_end   date,
  p_days         jsonb,
  p_adjustments  jsonb,
  p_orders       jsonb default null
)
returns table (inserted integer, updated integer, unchanged integer, adjustments integer, orders integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ins integer;
  v_upd integer;
  v_unch integer;
  v_adj integer := 0;
  v_ord integer := 0;
  v_start date := least(p_period_start, p_period_end);
  v_end date := greatest(p_period_start, p_period_end);
begin
  if not public.is_store_active(p_store_id) then
    raise exception 'permission denied: toko % tidak aktif atau bukan milik akun ini', p_store_id using errcode = '42501';
  end if;

  select u.inserted, u.updated, u.unchanged into v_ins, v_upd, v_unch
  from public.upsert_income(p_store_id, coalesce(p_days, '[]'::jsonb)) u;

  if p_adjustments is not null then
    if v_start is null then
      select a.inserted + a.updated + a.unchanged into v_adj
      from public.upsert_income_adjustments(p_store_id, p_adjustments) a;
    else
      delete from public.income_adjustments
      where store_id = p_store_id and released_date between v_start and v_end;

      insert into public.income_adjustments (store_id, released_date, description, seq, amount, order_no)
      select p_store_id, x.released_date, x.description,
             row_number() over (partition by x.released_date, x.description order by e.ord)::integer,
             x.amount, nullif(x.order_no, '')
      from jsonb_array_elements(p_adjustments) with ordinality as e (elem, ord),
           jsonb_to_record(e.elem) as x (released_date date, description text, amount bigint, order_no text)
      on conflict (store_id, released_date, description, seq) do update set
        amount      = excluded.amount,
        order_no    = excluded.order_no,
        uploaded_by = auth.uid(),
        uploaded_at = now();
      get diagnostics v_adj = row_count;
    end if;
  end if;

  if p_orders is not null then
    -- Ganti rincian periode ini, plus pesanan yang sama yang dulu tercatat di tanggal lain.
    delete from public.income_orders o
    where o.store_id = p_store_id
      and ((v_start is not null and o.released_date between v_start and v_end)
           or o.order_no in (select x.order_no from jsonb_to_recordset(p_orders) as x (order_no text)));

    insert into public.income_orders (
      store_id, order_no, line_no, return_no, product_id, product_name, created_date, released_date,
      harga_produk, pengembalian_dana, subtotal_ongkir, voucher_subsidi, biaya_admin, biaya_proses,
      biaya_gratis_ongkir, biaya_lain, total_income
    )
    select p_store_id, x.order_no, x.line_no, coalesce(x.return_no, ''), coalesce(x.product_id, ''),
           coalesce(x.product_name, ''), x.created_date, x.released_date,
           coalesce(x.harga_produk, 0), coalesce(x.pengembalian_dana, 0), coalesce(x.subtotal_ongkir, 0),
           coalesce(x.voucher_subsidi, 0), coalesce(x.biaya_admin, 0), coalesce(x.biaya_proses, 0),
           coalesce(x.biaya_gratis_ongkir, 0), coalesce(x.biaya_lain, 0), x.total_income
    from jsonb_to_recordset(p_orders) as x (
      order_no text, line_no integer, return_no text, product_id text, product_name text,
      created_date date, released_date date, harga_produk bigint, pengembalian_dana bigint,
      subtotal_ongkir bigint, voucher_subsidi bigint, biaya_admin bigint, biaya_proses bigint,
      biaya_gratis_ongkir bigint, biaya_lain bigint, total_income bigint
    );
    get diagnostics v_ord = row_count;
  end if;

  return query select v_ins, v_upd, v_unch, v_adj, v_ord;
end;
$$;

revoke execute on function public.save_income_report(bigint, date, date, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_income_report(bigint, date, date, jsonb, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Prosedur admin (turunan dari 20261016000000_operations.sql): ikut menyertakan income_orders.
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
      from public.ad_reports r where r.store_id = p_store_id)
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
  delete from public.store_members where store_id = p_store_id;
  get diagnostics v_n = row_count; item := 'store_members'; jumlah := v_n; return next;
  delete from public.stores where id = p_store_id;
  get diagnostics v_n = row_count; item := 'stores'; jumlah := v_n; return next;
end;
$$;

revoke execute on function public.admin_delete_store(bigint, text, boolean) from public, anon, authenticated;
