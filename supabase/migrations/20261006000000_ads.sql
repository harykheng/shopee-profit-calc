-- =============================================================================
-- Data iklan Shopee (Iklan Saya → Download Data, file .csv)
--
-- Satu "laporan" = satu file untuk satu toko + periode + jenis file:
--   keseluruhan  "Semua Laporan Iklan CPC"           (total per iklan)
--   otomatis     "Rincian Data Iklan Produk Otomatis" (per produk)
--   grup         "Semua Data Grup Iklan"              (per grup + produknya)
-- Upload ulang file yang sama (toko + periode + jenis sama) MENGGANTI isinya,
-- jadi tidak pernah dobel.
--
-- Tidak ada data pembeli di file iklan.
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data yang ada.
-- =============================================================================

create table if not exists public.ad_reports (
  id           bigint generated always as identity primary key,
  store_id     bigint not null references public.stores (id) on delete restrict,
  period_start date not null,
  period_end   date not null,
  source       text not null check (source in ('keseluruhan', 'otomatis', 'grup')),
  -- "Nama Toko" di file, untuk memperingatkan kalau salah pilih toko.
  shop_name    text not null default '',
  uploaded_by  uuid default auth.uid() references auth.users (id) on delete set null,
  uploaded_at  timestamptz not null default now(),
  check (period_end >= period_start),
  unique (store_id, period_start, period_end, source)
);

create table if not exists public.ad_rows (
  id           bigint generated always as identity primary key,
  report_id    bigint not null references public.ad_reports (id) on delete cascade,
  -- Urutan baris di file.
  seq          integer not null,
  -- Nama iklan / grup. Untuk baris produk di file otomatis/grup: nama iklan/grup induknya.
  ad_name      text not null,
  -- Kode Produk Shopee; '' untuk baris total iklan/grup (bukan satu produk).
  product_code text not null default '',
  product_name text not null default '',
  views        bigint not null default 0,
  clicks       bigint not null default 0,
  -- "Produk Terjual" versi Shopee (termasuk pesanan yang kemudian batal).
  sold         bigint not null default 0,
  gmv          bigint not null default 0,
  spend        bigint not null default 0,
  unique (report_id, seq)
);

create index if not exists ad_rows_report_idx on public.ad_rows (report_id);

alter table public.ad_reports enable row level security;
alter table public.ad_rows    enable row level security;

drop policy if exists "login: akses penuh" on public.ad_reports;
create policy "login: akses penuh" on public.ad_reports
  for all to authenticated using (true) with check (true);

drop policy if exists "login: akses penuh" on public.ad_rows;
create policy "login: akses penuh" on public.ad_rows
  for all to authenticated using (true) with check (true);

revoke all on public.ad_reports, public.ad_rows from anon;
grant select, insert, update, delete on public.ad_reports, public.ad_rows to authenticated;

-- p_rows: array JSON berisi { ad_name, product_code, product_name, views, clicks,
-- sold, gmv, spend }, urut seperti di file. Mengembalikan true kalau laporan
-- yang sama sudah pernah di-upload (isinya diganti).
create or replace function public.save_ad_report(
  p_store_id     bigint,
  p_period_start date,
  p_period_end   date,
  p_source       text,
  p_shop_name    text,
  p_rows         jsonb
)
returns table (report_id bigint, replaced boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id       bigint;
  v_replaced boolean;
begin
  select r.id into v_id
  from public.ad_reports r
  where r.store_id = p_store_id
    and r.period_start = p_period_start
    and r.period_end = p_period_end
    and r.source = p_source;

  v_replaced := v_id is not null;

  if v_replaced then
    update public.ad_reports
    set shop_name = p_shop_name, uploaded_by = auth.uid(), uploaded_at = now()
    where id = v_id;
    delete from public.ad_rows where ad_rows.report_id = v_id;
  else
    insert into public.ad_reports (store_id, period_start, period_end, source, shop_name)
    values (p_store_id, p_period_start, p_period_end, p_source, p_shop_name)
    returning id into v_id;
  end if;

  insert into public.ad_rows
    (report_id, seq, ad_name, product_code, product_name, views, clicks, sold, gmv, spend)
  select v_id, e.ord::integer, x.ad_name, coalesce(x.product_code, ''), coalesce(x.product_name, ''),
         coalesce(x.views, 0), coalesce(x.clicks, 0), coalesce(x.sold, 0),
         coalesce(x.gmv, 0), coalesce(x.spend, 0)
  from jsonb_array_elements(p_rows) with ordinality as e (elem, ord),
       jsonb_to_record(e.elem) as x (
         ad_name text, product_code text, product_name text,
         views bigint, clicks bigint, sold bigint, gmv bigint, spend bigint
       );

  return query select v_id, v_replaced;
end;
$$;

revoke execute on function public.save_ad_report(bigint, date, date, text, text, jsonb) from public, anon;
grant execute on function public.save_ad_report(bigint, date, date, text, text, jsonb) to authenticated;
