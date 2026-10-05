// Semua akses ke Supabase ada di sini.
import type { AdRow, AdsParseResult } from './parsers/ads'
import type { IncomeAdjustment, IncomeDayRow } from './parsers/income'
import type { OrderItemRow } from './parsers/orders'
import { supabase } from './supabase'
import { addMonths, monthEnd } from './format'
import { MAX_SHIFT_DAYS } from './monthStatus'
import type { AdSource } from './shopeeColumns'
import type {
  AdReport,
  DailyReconciliation,
  OrdersByCreated,
  Expense,
  ExpenseCategory,
  MonthlyRecap,
  Product,
  ProductRecap,
  ReturnedItem,
  Store,
  UpsertCounts,
} from './types'

/** Ukuran potongan data per request supaya tidak melebihi batas ukuran request. */
const CHUNK = 500

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function fetchStores(): Promise<Store[]> {
  return check(await supabase.from('stores').select('id, name').order('id'))
}

// --- Upload -----------------------------------------------------------------

export async function saveOrderItems(storeId: number, items: OrderItemRow[]) {
  const total = { inserted: 0, updated: 0, unchanged: 0, newProducts: 0 }
  for (const part of chunks(items)) {
    const rows = check(
      await supabase.rpc('upsert_order_items', { p_store_id: storeId, p_items: part }),
    ) as { inserted: number; updated: number; unchanged: number; new_products: number }[]
    const r = rows[0]
    total.inserted += r.inserted
    total.updated += r.updated
    total.unchanged += r.unchanged
    total.newProducts += r.new_products
  }
  return total
}

export async function saveIncome(storeId: number, days: IncomeDayRow[]): Promise<UpsertCounts> {
  const rows = check(
    await supabase.rpc('upsert_income', { p_store_id: storeId, p_rows: days }),
  ) as UpsertCounts[]
  return rows[0]
}

export async function saveAdjustments(storeId: number, adjustments: IncomeAdjustment[]): Promise<UpsertCounts> {
  const rows = check(
    await supabase.rpc('upsert_income_adjustments', {
      p_store_id: storeId,
      p_rows: adjustments.map((a) => ({ released_date: a.date, description: a.description, amount: a.amount })),
    }),
  ) as UpsertCounts[]
  return rows[0]
}

// --- Produk / HPP -----------------------------------------------------------

export async function fetchProducts(storeId: number): Promise<Product[]> {
  const all: Product[] = []
  // Ambil per 1000 baris (batas default Supabase).
  for (let from = 0; ; from += 1000) {
    const page = check(
      await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .order('product_name')
        .order('variant_name')
        .range(from, from + 999),
    ) as Product[]
    all.push(...page)
    if (page.length < 1000) return all
  }
}

export async function updateHpp(productId: number, hpp: number | null): Promise<Product> {
  return check(
    await supabase.from('products').update({ hpp }).eq('id', productId).select('*').single(),
  ) as Product
}

// --- Biaya ------------------------------------------------------------------

export async function fetchExpenses(storeId: number, month: string): Promise<Expense[]> {
  return check(
    await supabase.from('expenses').select('*').eq('store_id', storeId).eq('month', month),
  ) as Expense[]
}

export async function saveExpenses(
  storeId: number,
  month: string,
  values: { category: ExpenseCategory; amount: number; note: string }[],
) {
  check(
    await supabase
      .from('expenses')
      .upsert(
        values.map((v) => ({ store_id: storeId, month, ...v })),
        { onConflict: 'store_id,month,category' },
      ),
  )
}

// --- Rekap ------------------------------------------------------------------

export async function fetchMonthlyRecap(storeId: number, from: string, to: string) {
  return check(
    await supabase
      .from('monthly_recap')
      .select('*')
      .eq('store_id', storeId)
      .gte('month', from)
      .lte('month', to)
      .order('month'),
  ) as MonthlyRecap[]
}

export async function fetchProductRecap(storeId: number, from: string, to: string) {
  return check(
    await supabase
      .from('product_monthly_recap')
      .select('*')
      .eq('store_id', storeId)
      .gte('month', from)
      .lte('month', to)
      .order('product_name')
      .limit(5000),
  ) as ProductRecap[]
}

/** Tambah/kurangi hari: ("2026-08-01", -3) → "2026-07-29". */
function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/**
 * Cocokkan uang cair vs pesanan selesai per hari. Ikut mengambil beberapa hari di luar
 * rentang supaya pesanan yang cair 1–2 hari kemudian (melewati pergantian bulan) tetap cocok;
 * saring dengan `month` kalau hanya butuh bulan di rentang.
 */
export async function fetchReconciliation(storeId: number, from: string, to: string) {
  return check(
    await supabase
      .from('daily_reconciliation')
      .select('*')
      .eq('store_id', storeId)
      .gte('day', shiftDay(from, -MAX_SHIFT_DAYS))
      .lte('day', shiftDay(monthEnd(to), MAX_SHIFT_DAYS))
      .order('day'),
  ) as DailyReconciliation[]
}

export async function fetchReturnedItems(storeId: number, from: string, to: string) {
  // Batas bulan menurut WIB.
  return check(
    await supabase
      .from('order_items')
      .select('order_no, sku, product_name, variant_name, qty, returned_qty, return_status, completed_at')
      .eq('store_id', storeId)
      .gt('returned_qty', 0)
      .gte('completed_at', `${from}T00:00:00+07:00`)
      .lte('completed_at', `${monthEnd(to)}T23:59:59.999+07:00`)
      .order('completed_at'),
  ) as ReturnedItem[]
}

export async function fetchOrdersByCreated(storeId: number, from: string, to: string) {
  return check(
    await supabase
      .from('orders_by_created')
      .select('*')
      .eq('store_id', storeId)
      .gte('month', from)
      .lte('month', to),
  ) as OrdersByCreated[]
}

/** Jumlah item yang belum punya tanggal pesanan dibuat (di-upload sebelum fitur ini ada). */
export async function countItemsWithoutCreatedAt(storeId: number): Promise<number> {
  const res = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .is('created_at', null)
  if (res.error) throw res.error
  return res.count ?? 0
}

/** Ambil semua baris (Supabase membatasi 1000 baris per request). */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += 1000) {
    const rows = check(await page(from, from + 999)) as T[]
    all.push(...rows)
    if (rows.length < 1000) return all
  }
}

/** Awal bulan `from` dan awal bulan sesudah `to`, dalam WIB. */
function wibRange(from: string, to: string) {
  return { start: `${from}T00:00:00+07:00`, end: `${addMonths(to, 1)}T00:00:00+07:00` }
}

export interface CreatedItem {
  sku: string
  status_group: 'selesai' | 'proses' | 'batal'
  qty: number
  returned_qty: number
  subtotal: number
  completed_at: string | null
  hpp_snapshot: number | null
}

/** Item dari pesanan yang DIBUAT di rentang bulan ini (semua status). */
export async function fetchCreatedItems(storeId: number, from: string, to: string) {
  const { start, end } = wibRange(from, to)
  return fetchAllPages<CreatedItem>((a, b) =>
    supabase
      .from('order_items')
      .select('sku, status_group, qty, returned_qty, subtotal, completed_at, hpp_snapshot')
      .eq('store_id', storeId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('id')
      .range(a, b),
  )
}

/** Item selesai di rentang ini yang pesanannya dibuat SEBELUM rentang ini. */
export async function fetchEarlierOrdersCompleted(storeId: number, from: string, to: string) {
  const { start, end } = wibRange(from, to)
  return fetchAllPages<{ qty: number; returned_qty: number }>((a, b) =>
    supabase
      .from('order_items')
      .select('qty, returned_qty')
      .eq('store_id', storeId)
      .eq('status_group', 'selesai')
      .gte('completed_at', start)
      .lt('completed_at', end)
      .lt('created_at', start)
      .order('id')
      .range(a, b),
  )
}

/** Penghasilan per tanggal dana dilepas, mulai `fromDay` (YYYY-MM-DD), opsional sampai `toDay`. */
export async function fetchIncomeDays(storeId: number, fromDay: string, toDay?: string) {
  return fetchAllPages<{ released_date: string; total_income: number; subtotal_pesanan: number }>((a, b) => {
    let q = supabase
      .from('income')
      .select('released_date, total_income, subtotal_pesanan')
      .eq('store_id', storeId)
      .gte('released_date', fromDay)
    if (toDay) q = q.lte('released_date', toDay)
    return q.order('released_date').range(a, b)
  })
}

export async function recalcHpp(storeId: number, month: string, onlyMissing: boolean) {
  return check(
    await supabase.rpc('recalc_hpp', { p_store_id: storeId, p_month: month, p_only_missing: onlyMissing }),
  ) as number
}

// --- Iklan ------------------------------------------------------------------

/** Simpan satu file iklan. Upload ulang (toko + periode + jenis sama) mengganti isinya. */
export async function saveAdReport(storeId: number, r: AdsParseResult) {
  const rows = check(
    await supabase.rpc('save_ad_report', {
      p_store_id: storeId,
      p_period_start: r.periodStart,
      p_period_end: r.periodEnd,
      p_source: r.source,
      p_shop_name: r.shopName,
      p_rows: r.rows,
    }),
  ) as { report_id: number; replaced: boolean }[]
  return rows[0]
}

export async function fetchAdReports(storeId: number) {
  return check(
    await supabase
      .from('ad_reports')
      .select('id, store_id, period_start, period_end, source, shop_name, uploaded_at')
      .eq('store_id', storeId)
      .order('period_end', { ascending: false })
      .order('period_start', { ascending: false }),
  ) as AdReport[]
}

/** Toko lain yang pernah menerima file iklan dengan "Nama Toko" ini (untuk peringatan salah toko). */
export async function findAdShopElsewhere(shopName: string, storeId: number): Promise<number | null> {
  if (!shopName) return null
  const rows = check(
    await supabase
      .from('ad_reports')
      .select('store_id')
      .eq('shop_name', shopName)
      .neq('store_id', storeId)
      .limit(1),
  ) as { store_id: number }[]
  return rows[0]?.store_id ?? null
}

export async function fetchAdRows(
  reports: { id: number; source: AdSource; period_start?: string; period_end?: string }[],
) {
  if (reports.length === 0) return []
  const rows = await fetchAllPages<AdRow & { report_id: number }>((a, b) =>
    supabase
      .from('ad_rows')
      .select('report_id, ad_name, product_code, product_name, views, clicks, sold, gmv, spend')
      .in(
        'report_id',
        reports.map((r) => r.id),
      )
      .order('report_id')
      .order('seq')
      .range(a, b),
  )
  return reports.map((rep) => ({
    source: rep.source,
    period: rep.period_start ? `${rep.period_start}|${rep.period_end}` : undefined,
    rows: rows
      .filter((r) => r.report_id === rep.id)
      .map((r) => ({
        ...r,
        views: Number(r.views),
        clicks: Number(r.clicks),
        sold: Number(r.sold),
        gmv: Number(r.gmv),
        spend: Number(r.spend),
      })),
  }))
}

export interface PeriodItem {
  sku: string
  product_name: string
  status_group: 'selesai' | 'proses' | 'batal'
  qty: number
  subtotal: number
  hpp_snapshot: number | null
  created_at: string | null
}

/** Item dari pesanan yang DIBUAT antara dua tanggal (YYYY-MM-DD, termasuk), semua status. */
export async function fetchItemsCreatedBetween(storeId: number, fromDay: string, toDay: string) {
  const end = new Date(`${toDay}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  return fetchAllPages<PeriodItem>((a, b) =>
    supabase
      .from('order_items')
      .select('sku, product_name, status_group, qty, subtotal, hpp_snapshot, created_at')
      .eq('store_id', storeId)
      .gte('created_at', `${fromDay}T00:00:00+07:00`)
      .lt('created_at', `${end.toISOString().slice(0, 10)}T00:00:00+07:00`)
      .order('id')
      .range(a, b),
  )
}

/** Isi Biaya → Iklan Shopee untuk satu bulan dari total data iklan. */
export async function saveAdsExpense(storeId: number, month: string, amount: number, note: string) {
  check(
    await supabase
      .from('expenses')
      .upsert(
        { store_id: storeId, month, category: 'iklan_shopee', amount, note },
        { onConflict: 'store_id,month,category' },
      ),
  )
}
