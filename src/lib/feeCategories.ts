// Biaya admin per produk: dari kategori toko, atau isian manual. Fungsi murni (tanpa Supabase).
import { XTRA_FEE_RATE, productKey } from './adsMath'
import type { FeeCategory, Product } from './types'

/** Nilai bawaan kalau produk belum pernah diisi (sama dengan bawaan halaman Simulasi). */
export const DEFAULT_ADMIN_PCT = 8.25
export const DEFAULT_XTRA = true

type ProductFees = Pick<Product, 'admin_pct' | 'fee_category_id' | 'xtra'>

/**
 * Persen admin yang berlaku untuk produk ini, atau null kalau belum pernah diisi.
 * Kategori menang atas isian manual; kategori yang sudah dihapus jatuh kembali ke isian manual.
 */
export function effectiveAdminPct(p: ProductFees, categories: FeeCategory[]): number | null {
  if (p.fee_category_id !== null && p.fee_category_id !== undefined) {
    const cat = categories.find((c) => c.id === p.fee_category_id)
    if (cat) return Number(cat.admin_pct)
  }
  return p.admin_pct !== null && p.admin_pct !== undefined ? Number(p.admin_pct) : null
}

/**
 * Porsi potongan yang berbeda antar produk (admin + XTRA, 0–1) per nama produk.
 * Hanya produk yang admin-nya sudah diketahui; sisanya tidak ada di hasil.
 * Variasi satu produk bisa berbeda catatan, jadi diambil variasi pertama yang punya data.
 */
export function productFeeComponents(products: Product[], categories: FeeCategory[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of products) {
    const key = productKey(p.product_name)
    if (out.has(key)) continue
    const pct = effectiveAdminPct(p, categories)
    if (pct === null) continue
    out.set(key, pct / 100 + ((p.xtra ?? DEFAULT_XTRA) ? XTRA_FEE_RATE : 0))
  }
  return out
}
