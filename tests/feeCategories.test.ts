import { describe, expect, it } from 'vitest'
import { analyzeAds, referenceFeeComponent, XTRA_FEE_RATE, type AdOrderLine } from '../src/lib/adsMath'
import { effectiveAdminPct, productFeeComponents } from '../src/lib/feeCategories'
import type { AdRow } from '../src/lib/parsers/ads'
import type { FeeCategory, Product } from '../src/lib/types'

const cats: FeeCategory[] = [
  { id: 1, store_id: 1, name: 'Skincare', admin_pct: 10 },
  { id: 2, store_id: 1, name: 'Aksesori', admin_pct: 4 },
]

const product = (name: string, p: Partial<Product> = {}): Product => ({
  id: 1,
  store_id: 1,
  sku: name,
  sku_source: 'sku',
  product_name: name,
  variant_name: '',
  hpp: null,
  updated_at: '',
  ...p,
})

describe('effectiveAdminPct', () => {
  it('kategori menang atas isian manual', () => {
    expect(effectiveAdminPct({ admin_pct: 6, fee_category_id: 1 }, cats)).toBe(10)
  })
  it('tanpa kategori: isian manual', () => {
    expect(effectiveAdminPct({ admin_pct: 6, fee_category_id: null }, cats)).toBe(6)
    expect(effectiveAdminPct({ admin_pct: 6 }, cats)).toBe(6)
  })
  it('kategori sudah dihapus: kembali ke isian manual', () => {
    expect(effectiveAdminPct({ admin_pct: 6, fee_category_id: 99 }, cats)).toBe(6)
    expect(effectiveAdminPct({ admin_pct: null, fee_category_id: 99 }, cats)).toBeNull()
  })
  it('belum pernah diisi: null', () => {
    expect(effectiveAdminPct({}, cats)).toBeNull()
    expect(effectiveAdminPct({ admin_pct: null, fee_category_id: null }, cats)).toBeNull()
  })
})

describe('productFeeComponents', () => {
  it('admin + XTRA per nama produk; yang belum diisi tidak ikut', () => {
    const m = productFeeComponents(
      [
        product('Serum', { fee_category_id: 1, xtra: true }),
        product('Bando', { admin_pct: 4, xtra: false }),
        product('Baru'),
      ],
      cats,
    )
    expect(m.get('serum')).toBeCloseTo(0.1 + XTRA_FEE_RATE)
    expect(m.get('bando')).toBeCloseTo(0.04)
    expect(m.has('baru')).toBe(false)
  })
  it('XTRA kosong dianggap ikut (sama dengan bawaan Simulasi)', () => {
    expect(productFeeComponents([product('X', { admin_pct: 5 })], cats).get('x')).toBeCloseTo(0.05 + XTRA_FEE_RATE)
  })
})

describe('referenceFeeComponent', () => {
  it('rata-rata tertimbang penjualan', () => {
    const c = new Map([['a', 0.1], ['b', 0.04]])
    const sales = new Map([['a', 300], ['b', 100]])
    expect(referenceFeeComponent(c, sales)).toBeCloseTo((0.1 * 300 + 0.04 * 100) / 400)
  })
  it('tanpa penjualan: rata-rata biasa; tanpa data: null', () => {
    expect(referenceFeeComponent(new Map([['a', 0.1], ['b', 0.04]]), new Map())).toBeCloseTo(0.07)
    expect(referenceFeeComponent(new Map(), new Map())).toBeNull()
  })
})

// Dua produk harga & HPP sama, hanya adminnya yang beda.
const row = (p: Partial<AdRow>): AdRow => ({ ad_name: '', product_code: '', product_name: '', views: 0, clicks: 0, sold: 0, gmv: 0, spend: 0, ...p })
const line = (name: string, qty: number, price: number): AdOrderLine => ({
  product_name: name,
  status_group: 'selesai',
  qty,
  subtotal: qty * price,
  hpp: 50_000,
})
const reports = [
  {
    source: 'otomatis' as const,
    rows: [
      row({ product_code: 'S', product_name: 'Serum', sold: 100, gmv: 100 * 100_000, spend: 100_000 }),
      row({ product_code: 'B', product_name: 'Bando', sold: 100, gmv: 100 * 100_000, spend: 100_000 }),
      row({ product_code: 'N', product_name: 'Baru', sold: 100, gmv: 100 * 100_000, spend: 100_000 }),
    ],
  },
]
const orders = [line('Serum', 100, 100_000), line('Bando', 100, 100_000), line('Baru', 100, 100_000)]
const analyze = (feeComponents?: Map<string, number>) =>
  analyzeAds({ reports, orders, feeRate: 0.15, feeComponents })
const byName = (a: ReturnType<typeof analyze>) => Object.fromEntries(a.products.map((p) => [p.name, p]))

describe('analyzeAds: potongan per produk', () => {
  it('tanpa feeComponents: semua produk memakai rata-rata toko, hasil tidak berubah', () => {
    const p = byName(analyze())
    for (const n of ['Serum', 'Bando', 'Baru']) {
      expect(p[n].feeRate).toBeCloseTo(0.15)
      expect(p[n].feeSource).toBe('rata-rata')
      expect(p[n].unitProfit).toBeCloseTo(100_000 * 0.85 - 50_000)
    }
  })

  it('produk admin tinggi untungnya lebih kecil dari admin rendah, selisihnya sesuai selisih admin', () => {
    const p = byName(analyze(new Map([['serum', 0.14], ['bando', 0.04]])))
    expect(p.Serum.feeSource).toBe('produk')
    expect(p.Bando.feeSource).toBe('produk')
    // Selisih potongan = selisih admin (14% − 4% = 10 poin).
    expect(p.Serum.feeRate - p.Bando.feeRate).toBeCloseTo(0.1)
    expect((p.Bando.unitProfit as number) - (p.Serum.unitProfit as number)).toBeCloseTo(100_000 * 0.1)
  })

  it('kalau semua produk diketahui, rata-rata potongan tertimbang tetap sama dengan rata-rata toko', () => {
    const p = byName(analyze(new Map([['serum', 0.14], ['bando', 0.04], ['baru', 0.09]])))
    const avg = (p.Serum.feeRate + p.Bando.feeRate + p.Baru.feeRate) / 3 // penjualan sama besar
    expect(avg).toBeCloseTo(0.15)
  })

  it('produk yang belum diisi tetap memakai rata-rata toko', () => {
    const p = byName(analyze(new Map([['serum', 0.14], ['bando', 0.04]])))
    expect(p.Baru.feeSource).toBe('rata-rata')
    expect(p.Baru.feeRate).toBeCloseTo(0.15)
  })

  it('hanya satu produk yang diketahui: tidak ada pembanding, jadi tidak ada pergeseran', () => {
    const p = byName(analyze(new Map([['serum', 0.14]])))
    expect(p.Serum.feeRate).toBeCloseTo(0.15)
  })
})
