// Reset data toko (halaman Pengelola → Pelanggan → Reset data). Database: platform_reset_store_data (SQL 20261118).
// Yang dihapus: pesanan, penghasilan, produk & HPP, biaya bulanan, data iklan, jatah simulasi uji coba yang terpakai.
// Yang tetap: nama toko, akun, langganan, pengaturan hitungan, kategori biaya admin, catatan aktivitas.

/** Jumlah baris yang dihapus per tabel, seperti dikembalikan database. */
export interface StoreResetCounts {
  order_items: number
  income: number
  income_adjustments: number
  income_orders: number
  products: number
  expenses: number
  ad_reports: number
  ad_rows: number
  trial_simulations: number
}

const KEYS: (keyof StoreResetCounts)[] = [
  'order_items',
  'income',
  'income_adjustments',
  'income_orders',
  'products',
  'expenses',
  'ad_reports',
  'ad_rows',
  'trial_simulations',
]

export function toResetCounts(raw: Record<string, unknown>): StoreResetCounts {
  const out = {} as StoreResetCounts
  for (const k of KEYS) {
    const n = Number(raw[k])
    out[k] = Number.isFinite(n) && n > 0 ? n : 0
  }
  return out
}

/** Nama yang diketik cocok dengan nama toko? Sama seperti database: spasi di ujung & huruf besar/kecil diabaikan. */
export function confirmNameMatches(typed: string, storeName: string): boolean {
  const a = typed.trim().toLowerCase()
  return a.length > 0 && a === storeName.trim().toLowerCase()
}

const num = (n: number) => n.toLocaleString('id-ID')

/** Kalimat hasil untuk pengelola: apa saja yang terhapus (yang 0 tidak disebut). */
export function resetSummary(storeName: string, c: StoreResetCounts): string {
  const parts = [
    c.order_items > 0 ? `${num(c.order_items)} baris pesanan` : null,
    c.income > 0 ? `${num(c.income)} hari uang cair` : null,
    c.income_orders > 0 && c.income === 0 ? `${num(c.income_orders)} baris penghasilan` : null,
    c.products > 0 ? `${num(c.products)} produk beserta HPP-nya` : null,
    c.expenses > 0 ? `${num(c.expenses)} isian biaya` : null,
    c.ad_reports > 0 ? `${num(c.ad_reports)} laporan iklan` : null,
    c.trial_simulations > 0 ? `${num(c.trial_simulations)} catatan simulasi` : null,
  ].filter((p): p is string => p !== null)
  const total = KEYS.reduce((sum, k) => sum + c[k], 0)
  if (total === 0) return `${storeName} memang sudah kosong. Nama toko, akun, dan langganan tidak berubah.`
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, dan ${parts[parts.length - 1]}` : (parts[0] ?? 'datanya')
  return `Data ${storeName} sudah dikosongkan: ${list} terhapus. Nama toko, akun, dan langganan tidak berubah; panduan 3 langkah akan muncul lagi saat pemiliknya membuka Rekap.`
}
