export interface Store {
  id: number
  name: string
}

export interface Product {
  id: number
  store_id: number
  sku: string
  sku_source: 'sku' | 'sku_induk' | 'nama'
  product_name: string
  variant_name: string
  hpp: number | null
  /** % biaya admin untuk Simulasi Harga (null = belum diisi). Ada setelah SQL 20261007 dijalankan. */
  admin_pct?: number | null
  /** Ikut Gratis Ongkir XTRA (null = belum diisi). */
  xtra?: boolean | null
  updated_at: string
}

export type ExpenseCategory = 'iklan_shopee' | 'meta_ads' | 'packaging' | 'lain_lain'

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: 'iklan_shopee', label: 'Iklan Shopee' },
  { key: 'meta_ads', label: 'Meta Ads' },
  { key: 'packaging', label: 'Packaging' },
  { key: 'lain_lain', label: 'Lain-lain' },
]

export interface Expense {
  id: number
  store_id: number
  month: string
  category: ExpenseCategory
  amount: number
  note: string
}

export interface MonthlyRecap {
  store_id: number
  store_name: string
  month: string
  total_income: number
  subtotal_pesanan: number
  total_modal: number
  total_expenses: number
  iklan_shopee: number
  meta_ads: number
  packaging: number
  lain_lain: number
  net_profit: number
  margin_pct: number | null
  total_qty: number
  items_missing_hpp: number
  expense_entries: number
  /** Dana dilepas dari tabel harian (tanpa penyesuaian). Kosong kalau SQL ke-2 belum dijalankan. */
  income_released?: number
  /** Total biaya penyesuaian bulan itu (sudah termasuk di total_income). */
  adjustments?: number
}

export interface ProductRecap {
  store_id: number
  month: string
  sku: string
  product_name: string
  variant_name: string
  qty_sold: number
  qty_returned: number
  total_modal: number | null
  missing_hpp: boolean
}

export interface DailyReconciliation {
  store_id: number
  day: string
  month: string
  income_subtotal: number
  total_income: number
  orders_subtotal: number
  order_count: number
  difference: number
  has_income: boolean
  has_orders: boolean
}

export interface ReturnedItem {
  order_no: string
  sku: string
  product_name: string
  variant_name: string
  qty: number
  returned_qty: number
  return_status: string
  completed_at: string
}

/** Pesanan masuk per bulan pesanan dibuat & kelompok status (view orders_by_created). */
export interface OrdersByCreated {
  store_id: number
  month: string
  status_group: 'selesai' | 'proses' | 'batal'
  order_count: number
  qty: number
  qty_returned: number
  subtotal: number
  /** Perkiraan modal: HPP terkunci kalau ada, kalau belum pakai HPP saat ini. */
  modal: number | null
  modal_returned: number | null
  items_missing_hpp: number
}

export interface UpsertCounts {
  inserted: number
  updated: number
  unchanged: number
}

/** Satu file iklan yang sudah di-upload (tabel ad_reports). */
export interface AdReport {
  id: number
  store_id: number
  period_start: string
  period_end: string
  source: 'keseluruhan' | 'otomatis' | 'grup'
  shop_name: string
  uploaded_at: string
}
