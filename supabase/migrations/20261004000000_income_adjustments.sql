-- =============================================================================
-- Biaya Penyesuaian dari laporan penghasilan Shopee
--
-- Di PDF "Catatan Transaksi Penghasilan" ada bagian "Rincian Biaya Penyesuaian"
-- (mis. kompensasi barang hilang/retur, atau potongan). Uang ini tercatat
-- terpisah dari tabel harian, jadi disimpan di tabel sendiri dan ikut dihitung
-- sebagai penghasilan di bulan tanggal dana dilepas.
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data yang ada.
-- =============================================================================

create table if not exists public.income_adjustments (
  id            bigint generated always as identity primary key,
  store_id      bigint not null references public.stores (id) on delete restrict,
  released_date date not null,
  description   text not null,
  -- Urutan kalau di tanggal yang sama ada beberapa penyesuaian dengan deskripsi sama.
  seq           integer not null default 1,
  -- Positif = uang masuk (kompensasi), negatif = potongan.
  amount        bigint not null,
  uploaded_by   uuid default auth.uid() references auth.users (id) on delete set null,
  uploaded_at   timestamptz not null default now(),
  unique (store_id, released_date, description, seq)
);

alter table public.income_adjustments enable row level security;

drop policy if exists "login: akses penuh" on public.income_adjustments;
create policy "login: akses penuh" on public.income_adjustments
  for all to authenticated using (true) with check (true);

revoke all on public.income_adjustments from anon;
grant select, insert, update, delete on public.income_adjustments to authenticated;

-- p_rows: array JSON berisi { released_date, description, amount }, urut seperti di PDF.
-- Upload ulang PDF yang sama tidak menggandakan data.
create or replace function public.upsert_income_adjustments(p_store_id bigint, p_rows jsonb)
returns table (inserted integer, updated integer, unchanged integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ins integer;
  v_upd integer;
  v_rows integer;
begin
  select count(*) into v_rows from jsonb_array_elements(p_rows);

  with src as (
    select x.released_date,
           x.description,
           x.amount,
           row_number() over (partition by x.released_date, x.description order by e.ord)::integer as seq
    from jsonb_array_elements(p_rows) with ordinality as e (elem, ord),
         jsonb_to_record(e.elem) as x (released_date date, description text, amount bigint)
  ), up as (
    insert into public.income_adjustments as a (store_id, released_date, description, seq, amount)
    select p_store_id, s.released_date, s.description, s.seq, s.amount
    from src s
    on conflict (store_id, released_date, description, seq) do update set
      amount      = excluded.amount,
      uploaded_by = auth.uid(),
      uploaded_at = now()
    where a.amount is distinct from excluded.amount
    returning (xmax = 0) as is_insert
  )
  select count(*) filter (where is_insert), count(*) filter (where not is_insert)
  into v_ins, v_upd
  from up;

  return query select v_ins, v_upd, v_rows - v_ins - v_upd;
end;
$$;

revoke execute on function public.upsert_income_adjustments(bigint, jsonb) from public, anon;
grant execute on function public.upsert_income_adjustments(bigint, jsonb) to authenticated;

-- Rekap bulanan: total_income sekarang = dana dilepas (tabel harian) + penyesuaian.
-- Kolom lama tetap sama urutannya; kolom baru ditambahkan di akhir.
create or replace view public.monthly_recap
with (security_invoker = true) as
with inc as (
  select store_id,
         date_trunc('month', released_date)::date as month,
         sum(total_income)     as total_income,
         sum(subtotal_pesanan) as subtotal_pesanan
  from public.income
  group by 1, 2
), adj as (
  select store_id,
         date_trunc('month', released_date)::date as month,
         sum(amount) as adjustments
  from public.income_adjustments
  group by 1, 2
), modal as (
  select store_id,
         public.wib_month(completed_at) as month,
         sum((qty - returned_qty) * hpp_snapshot) as total_modal,
         sum(qty - returned_qty) as total_qty,
         count(*) filter (where hpp_snapshot is null and qty - returned_qty > 0)
           as items_missing_hpp
  from public.order_items
  where status = 'Selesai' and completed_at is not null
  group by 1, 2
), exp as (
  select store_id, month,
         sum(amount) as total_expenses,
         sum(amount) filter (where category = 'iklan_shopee') as iklan_shopee,
         sum(amount) filter (where category = 'meta_ads')     as meta_ads,
         sum(amount) filter (where category = 'packaging')    as packaging,
         sum(amount) filter (where category = 'lain_lain')    as lain_lain,
         -- > 0 berarti biaya bulan ini sudah pernah disimpan (walau nominalnya 0).
         count(*)                                              as expense_entries
  from public.expenses
  group by 1, 2
), months as (
  select store_id, month from inc
  union
  select store_id, month from adj
  union
  select store_id, month from modal
  union
  select store_id, month from exp
), totals as (
  select m.store_id, m.month,
         coalesce(inc.total_income, 0)     as income_released,
         coalesce(adj.adjustments, 0)      as adjustments,
         coalesce(inc.total_income, 0) + coalesce(adj.adjustments, 0) as total_income,
         coalesce(inc.subtotal_pesanan, 0) as subtotal_pesanan,
         coalesce(modal.total_modal, 0)    as total_modal,
         coalesce(modal.total_qty, 0)      as total_qty,
         coalesce(modal.items_missing_hpp, 0) as items_missing_hpp,
         coalesce(exp.total_expenses, 0)   as total_expenses,
         coalesce(exp.iklan_shopee, 0)     as iklan_shopee,
         coalesce(exp.meta_ads, 0)         as meta_ads,
         coalesce(exp.packaging, 0)        as packaging,
         coalesce(exp.lain_lain, 0)        as lain_lain,
         coalesce(exp.expense_entries, 0)  as expense_entries
  from months m
  left join inc   using (store_id, month)
  left join adj   using (store_id, month)
  left join modal using (store_id, month)
  left join exp   using (store_id, month)
)
select t.store_id,
       s.name as store_name,
       t.month,
       t.total_income,
       t.subtotal_pesanan,
       t.total_modal,
       t.total_expenses,
       t.iklan_shopee,
       t.meta_ads,
       t.packaging,
       t.lain_lain,
       t.total_income - t.total_modal - t.total_expenses as net_profit,
       case when t.total_income > 0
            then round((t.total_income - t.total_modal - t.total_expenses) * 100.0
                       / t.total_income, 2)
       end as margin_pct,
       t.total_qty,
       t.items_missing_hpp,
       t.expense_entries,
       t.income_released,
       t.adjustments
from totals t
join public.stores s on s.id = t.store_id;

revoke all on public.monthly_recap from anon;
grant select on public.monthly_recap to authenticated;
