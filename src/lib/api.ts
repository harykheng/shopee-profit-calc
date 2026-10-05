// Semua akses ke Supabase ada di sini.
import type { IncomeAdjustment, IncomeDayRow } from './parsers/income'
import type { OrderItemRow } from './parsers/orders'
import { supabase } from './supabase'
import { addMonths, monthEnd } from './format'
import type {
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

export async function fetchReconciliation(storeId: number, from: string, to: string) {
  return check(
    await supabase
      .from('daily_reconciliation')
      .select('*')
      .eq('store_id', storeId)
      .gte('day', from)
      .lte('day', monthEnd(to))
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

/** Penghasilan per tanggal dana dilepas, mulai `fromDay` (YYYY-MM-DD). */
export async function fetchIncomeDays(storeId: number, fromDay: string) {
  return fetchAllPages<{ released_date: string; total_income: number; subtotal_pesanan: number }>((a, b) =>
    supabase
      .from('income')
      .select('released_date, total_income, subtotal_pesanan')
      .eq('store_id', storeId)
      .gte('released_date', fromDay)
      .order('released_date')
      .range(a, b),
  )
}

export async function recalcHpp(storeId: number, month: string, onlyMissing: boolean) {
  return check(
    await supabase.rpc('recalc_hpp', { p_store_id: storeId, p_month: month, p_only_missing: onlyMissing }),
  ) as number
}
