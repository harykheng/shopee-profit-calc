// Semua akses ke Supabase ada di sini.
import type { AdRow, AdsParseResult } from './parsers/ads'
import type { SettingsPercent, StoreSettingsRow } from './storeSettings'
import type { IncomeParseResult } from './parsers/income'
import type { IncomeBreakdownRow } from './recapMath'
import type { OrderItemRow } from './parsers/orders'
import { supabase } from './supabase'
import { addMonths, monthEnd, wibDay } from './format'
import { MAX_SHIFT_DAYS } from './monthStatus'
import type { AdSource } from './shopeeColumns'
import type {
  AdReport,
  DailyReconciliation,
  OrdersByCreated,
  Expense,
  ExpenseCategory,
  FeeCategory,
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
  return check(await supabase.from('stores').select('id, name, active_until').order('id'))
}

/** Sudah sampai mana toko ini mengisi data. Dipakai untuk panduan awal di halaman Rekap. */
export interface SetupProgress {
  hasOrders: boolean
  hasIncome: boolean
  hasProducts: boolean
  /** Ada produk yang HPP-nya masih kosong. */
  hasMissingHpp: boolean
}

export async function fetchSetupProgress(storeId: number): Promise<SetupProgress> {
  const any = async (table: 'order_items' | 'income' | 'products', missingHpp = false) => {
    let q = supabase.from(table).select('id').eq('store_id', storeId)
    if (missingHpp) q = q.is('hpp', null)
    return check(await q.limit(1)).length > 0
  }
  const [hasOrders, hasIncome, hasProducts, hasMissingHpp] = await Promise.all([
    any('order_items'),
    any('income'),
    any('products'),
    any('products', true),
  ])
  return { hasOrders, hasIncome, hasProducts, hasMissingHpp }
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

export interface IncomeReportCounts extends UpsertCounts {
  /** Jumlah biaya penyesuaian yang tersimpan. */
  adjustments: number
  /** Jumlah baris rincian per pesanan & produk yang tersimpan (0 untuk PDF). */
  orders: number
}

/**
 * Simpan satu laporan penghasilan (PDF bulanan atau Excel "Sudah Dilepas") dalam satu transaksi.
 * Penyesuaian di periode laporan diganti, bukan ditambah (lihat 20261020000000_income_orders.sql).
 */
export async function saveIncomeReport(storeId: number, r: IncomeParseResult): Promise<IncomeReportCounts> {
  const rows = check(
    await supabase.rpc('save_income_report', {
      p_store_id: storeId,
      p_period_start: r.periodStart,
      p_period_end: r.periodEnd,
      p_days: r.days,
      p_adjustments: r.adjustmentsComplete
        ? r.adjustments.map((a) => ({
            released_date: a.date,
            description: a.description,
            amount: a.amount,
            order_no: a.orderNo ?? null,
          }))
        : null,
      p_orders: r.source === 'xlsx' ? r.orders : null,
    }),
  ) as IncomeReportCounts[]
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

/** Harga jual per barang dari pesanan terakhir (tidak batal) untuk SKU ini. */
export async function fetchLastSalePrice(storeId: number, sku: string) {
  const rows = check(
    await supabase
      .from('order_items')
      .select('qty, subtotal, created_at')
      .eq('store_id', storeId)
      .eq('sku', sku)
      .neq('status_group', 'batal')
      .gt('qty', 0)
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(1),
  ) as { qty: number; subtotal: number; created_at: string | null }[]
  const r = rows[0]
  return r ? { price: Math.round(Number(r.subtotal) / Number(r.qty)), date: r.created_at } : null
}

/** Tanggal pesanan terbaru toko ini (null kalau belum ada pesanan). Dipakai untuk porsi penjualan grup iklan. */
export async function fetchLatestOrderDate(storeId: number): Promise<string | null> {
  const rows = check(
    await supabase
      .from('order_items')
      .select('created_at')
      .eq('store_id', storeId)
      .not('created_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ) as { created_at: string }[]
  return rows[0]?.created_at ?? null
}

/**
 * Simpan % admin & XTRA untuk semua variasi dengan nama produk ini (Simulasi Harga).
 * `categoryId` ikut disimpan kalau diberikan (null = isian manual); undefined = jangan sentuh kolom itu.
 * admin_pct selalu diisi persen yang berlaku, sebagai cadangan kalau kategorinya nanti dihapus.
 */
export async function saveProductFees(
  storeId: number,
  productName: string,
  adminPct: number,
  xtra: boolean,
  categoryId?: number | null,
) {
  check(
    await supabase
      .from('products')
      .update({ admin_pct: adminPct, xtra, ...(categoryId !== undefined ? { fee_category_id: categoryId } : {}) })
      .eq('store_id', storeId)
      .eq('product_name', productName),
  )
}

/** Apakah toko ini pernah punya rekap (penghasilan, pesanan, atau biaya) di bulan sebelum `month`. */
export async function hasRecapBefore(storeId: number, month: string): Promise<boolean> {
  const rows = check(
    await supabase.from('monthly_recap').select('month').eq('store_id', storeId).lt('month', month).limit(1),
  ) as { month: string }[]
  return rows.length > 0
}

// --- Pengaturan hitungan per toko -------------------------------------------

/** Baris pengaturan toko; null kalau toko belum pernah menyimpan (artinya semua nilai bawaan). */
export async function fetchStoreSettings(storeId: number): Promise<StoreSettingsRow | null> {
  return check(
    await supabase.from('store_settings').select('*').eq('store_id', storeId).maybeSingle(),
  ) as StoreSettingsRow | null
}

export async function saveStoreSettings(storeId: number, v: SettingsPercent) {
  check(
    await supabase.from('store_settings').upsert(
      {
        store_id: storeId,
        ads_target_profit_pct: v.adsTargetProfitPct,
        price_target_margin_pct: v.priceTargetMarginPct,
        return_recovery_pct: v.returnRecoveryPct,
      },
      { onConflict: 'store_id' },
    ),
  )
}

// --- Kategori biaya admin ---------------------------------------------------

export async function fetchFeeCategories(storeId: number): Promise<FeeCategory[]> {
  const rows = check(
    await supabase.from('fee_categories').select('id, store_id, name, admin_pct').eq('store_id', storeId).order('name'),
  ) as FeeCategory[]
  return rows.map((r) => ({ ...r, admin_pct: Number(r.admin_pct) }))
}

/** Tambah kategori baru (tanpa id) atau ubah yang ada (dengan id). */
export async function saveFeeCategory(
  storeId: number,
  input: { id?: number; name: string; adminPct: number },
): Promise<FeeCategory> {
  const values = { name: input.name.trim(), admin_pct: input.adminPct }
  const q =
    input.id === undefined
      ? supabase.from('fee_categories').insert({ store_id: storeId, ...values })
      : supabase.from('fee_categories').update(values).eq('id', input.id).eq('store_id', storeId)
  const row = check(await q.select('id, store_id, name, admin_pct').single()) as FeeCategory
  return { ...row, admin_pct: Number(row.admin_pct) }
}

/** Hapus kategori. Produk yang memakainya otomatis kembali ke isian manual (fee_category_id dikosongkan). */
export async function deleteFeeCategory(storeId: number, id: number) {
  check(await supabase.from('fee_categories').delete().eq('id', id).eq('store_id', storeId))
}

/**
 * Pasang kategori (atau null = isian manual) ke semua variasi dengan nama produk ini.
 * `adminPctSnapshot`: persen kategori saat ini, disimpan di admin_pct sebagai cadangan kalau kategori dihapus.
 */
export async function saveProductCategory(
  storeId: number,
  productName: string,
  categoryId: number | null,
  adminPctSnapshot?: number,
) {
  check(
    await supabase
      .from('products')
      .update({ fee_category_id: categoryId, ...(adminPctSnapshot !== undefined ? { admin_pct: adminPctSnapshot } : {}) })
      .eq('store_id', storeId)
      .eq('product_name', productName),
  )
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
  // Dipaging: Supabase membatasi 1.000 baris per permintaan (mengalahkan .limit), jadi toko dengan
  // banyak produk × bulan terpotong diam-diam kalau tidak.
  return fetchAllPages<ProductRecap>((a, b) =>
    supabase
      .from('product_monthly_recap')
      .select('*')
      .eq('store_id', storeId)
      .gte('month', from)
      .lte('month', to)
      .order('month')
      .order('sku')
      .range(a, b),
  )
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
  // Batas bulan menurut WIB. Dipaging agar tidak terpotong di 1.000 baris.
  return fetchAllPages<ReturnedItem>((a, b) =>
    supabase
      .from('order_items')
      .select('order_no, sku, product_name, variant_name, qty, returned_qty, return_status, completed_at')
      .eq('store_id', storeId)
      .gt('returned_qty', 0)
      .gte('completed_at', `${from}T00:00:00+07:00`)
      .lte('completed_at', `${monthEnd(to)}T23:59:59.999+07:00`)
      .order('completed_at')
      .order('id')
      .range(a, b),
  )
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
  id: number
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
      .select('id, sku, status_group, qty, returned_qty, subtotal, completed_at, hpp_snapshot')
      .eq('store_id', storeId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('id')
      .range(a, b),
  )
}

/**
 * Uang masuk ASLI per item (view order_item_income) untuk pesanan yang DIBUAT di rentang ini.
 * Kosong kalau Excel "Sudah Dilepas" belum pernah di-upload atau SQL 20261021 belum dijalankan.
 */
export async function fetchCreatedItemIncome(storeId: number, from: string, to: string): Promise<Map<number, number>> {
  const { start, end } = wibRange(from, to)
  try {
    const rows = await fetchAllPages<{ order_item_id: number; income: number }>((a, b) =>
      supabase
        .from('order_item_income')
        .select('order_item_id, income')
        .eq('store_id', storeId)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('order_item_id')
        .range(a, b),
    )
    return new Map(rows.map((r) => [Number(r.order_item_id), Number(r.income)]))
  } catch {
    return new Map()
  }
}

/**
 * Rincian penghasilan per bulan cair (view income_monthly_breakdown) untuk Bab 2 Rekap.
 * Kosong kalau SQL 20261022 belum dijalankan: Bab 2 lalu memakai tampilan lama.
 */
export async function fetchIncomeBreakdown(storeId: number, from: string, to: string): Promise<IncomeBreakdownRow[]> {
  try {
    return check(
      await supabase
        .from('income_monthly_breakdown')
        .select('*')
        .eq('store_id', storeId)
        .gte('month', from)
        .lte('month', to)
        .order('month'),
    ) as IncomeBreakdownRow[]
  } catch {
    return []
  }
}

export interface UnmatchedIncomeOrder {
  order_no: string
  month: string
  released_date: string
  total_income: number
  /** tidak_ada = pesanan tidak ada di export; belum_selesai = ada, tapi statusnya belum Selesai (export lama). */
  match: 'tidak_ada' | 'belum_selesai'
}

/** Pesanan yang uangnya sudah cair (Excel "Sudah Dilepas") tapi belum cocok dengan export pesanan. */
export async function fetchUnmatchedIncomeOrders(storeId: number, from: string, to: string): Promise<UnmatchedIncomeOrder[]> {
  try {
    return await fetchAllPages<UnmatchedIncomeOrder>((a, b) =>
      supabase
        .from('income_order_match')
        .select('order_no, month, released_date, total_income, match')
        .eq('store_id', storeId)
        .neq('match', 'cocok')
        .gte('month', from)
        .lte('month', to)
        .order('released_date')
        .order('order_no')
        .range(a, b),
    )
  } catch {
    // View belum ada (SQL 20261021 belum dijalankan): tanpa daftar nomor pesanan, status bulan tetap jalan.
    return []
  }
}

export interface IncomeProductMonth {
  month: string
  product_id: string
  product_name: string
  lines: number
  harga_produk: number
  total_income: number
}

/** Potongan asli per ID Produk per bulan cair (tanpa pesanan refund). Kosong kalau belum ada data. */
export async function fetchIncomeProductMonthly(storeId: number, fromMonth: string, toMonth: string): Promise<IncomeProductMonth[]> {
  try {
    return await fetchAllPages<IncomeProductMonth>((a, b) =>
      supabase
        .from('income_product_monthly')
        .select('month, product_id, product_name, lines, harga_produk, total_income')
        .eq('store_id', storeId)
        .gte('month', fromMonth)
        .lte('month', toMonth)
        .order('month')
        .order('product_id')
        .range(a, b),
    )
  } catch {
    return []
  }
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

/**
 * Isi HPP pesanan selesai yang masih kosong dengan HPP produk saat ini (sama dengan "Hitung ulang HPP →
 * yang kosong saja"), supaya Rekap langsung memakai HPP yang baru diisi. HPP yang sudah terkunci tidak diubah.
 * Mengembalikan jumlah barang yang diperbarui.
 */
export async function fillMissingHpp(storeId: number, months: string[]): Promise<number> {
  const counts = await Promise.all([...new Set(months)].map((m) => recalcHpp(storeId, m, true)))
  return counts.reduce((s, n) => s + n, 0)
}

/** Seperti `fillMissingHpp`, untuk semua bulan yang punya pesanan selesai SKU ini dengan HPP kosong. */
export async function fillMissingHppForSku(storeId: number, sku: string): Promise<number> {
  const rows = await fetchAllPages<{ completed_at: string }>((a, b) =>
    supabase
      .from('order_items')
      .select('completed_at')
      .eq('store_id', storeId)
      .eq('sku', sku)
      .eq('status_group', 'selesai')
      .is('hpp_snapshot', null)
      .not('completed_at', 'is', null)
      .order('id')
      .range(a, b),
  )
  if (rows.length === 0) return 0
  return fillMissingHpp(storeId, rows.map((r) => `${wibDay(r.completed_at).slice(0, 7)}-01`))
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
  returned_qty: number
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
      .select('sku, product_name, status_group, qty, returned_qty, subtotal, hpp_snapshot, created_at')
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
