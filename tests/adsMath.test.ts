import { describe, expect, it } from 'vitest'
import { analyzeAds, feeRateFromIncome, fullMonthOf, productKey, verdictFor, type AdOrderLine } from '../src/lib/adsMath'
import type { AdRow } from '../src/lib/parsers/ads'

const row = (p: Partial<AdRow>): AdRow => ({
  ad_name: '',
  product_code: '',
  product_name: '',
  views: 0,
  clicks: 0,
  sold: 0,
  gmv: 0,
  spend: 0,
  ...p,
})

const orders = (name: string, kept: number, batal: number, price: number, hpp: number | null): AdOrderLine[] => [
  { product_name: name, status_group: 'selesai', qty: kept, subtotal: kept * price, hpp },
  ...(batal > 0 ? [{ product_name: name, status_group: 'batal' as const, qty: batal, subtotal: batal * price, hpp }] : []),
]

describe('analyzeAds', () => {
  // Data mirip Juli (angka dibulatkan, nama dummy), potongan Shopee 15%.
  const reports = [
    {
      source: 'keseluruhan' as const,
      rows: [
        row({ ad_name: 'Iklan Produk Otomatis', spend: 300_000 }),
        row({ ad_name: 'Dot [2]', product_code: 'D', product_name: 'Dot', spend: 20_000 }),
        row({ ad_name: 'Grup Iklan 1', spend: 5_000 }),
      ],
    },
    {
      source: 'otomatis' as const,
      rows: [
        row({ ad_name: 'Iklan Produk Otomatis', spend: 300_000 }),
        row({ ad_name: 'Iklan Produk Otomatis', product_code: 'D', product_name: 'Dot', sold: 27, gmv: 27 * 200_000, spend: 200_000 }),
        row({ ad_name: 'Iklan Produk Otomatis', product_code: 'B', product_name: 'Bedak', sold: 48, gmv: 48 * 30_000, spend: 150_000 }),
        row({ ad_name: 'Iklan Produk Otomatis', product_code: 'T', product_name: 'Tabur', sold: 10, gmv: 10 * 25_000, spend: 10_000 }),
        row({ ad_name: 'Iklan Produk Otomatis', product_code: 'S', product_name: 'Sabun', clicks: 4, spend: 2_000 }),
        row({ ad_name: 'Iklan Produk Otomatis', product_code: 'Z', product_name: 'Nol', spend: 0 }),
      ],
    },
  ]
  const a = analyzeAds({
    reports,
    orders: [
      ...orders('Dot', 23, 4, 200_000, 165_000),
      ...orders('BEDAK', 42, 6, 30_000, 21_000),
      ...orders('Tabur', 10, 0, 25_000, 15_000),
    ],
    feeRate: 0.15,
  })
  const byCode = Object.fromEntries(a.products.map((p) => [p.code, p]))

  it('total biaya dari Data Keseluruhan; grup tanpa rincian dilaporkan', () => {
    expect(a.totalSpend).toBe(325_000)
    expect(a.spendFrom).toBe('keseluruhan')
    expect(a.unallocated).toEqual([{ adName: 'Grup Iklan 1', spend: 5_000, need: 'grup' }])
  })

  it('menggabungkan iklan produk + otomatis untuk produk yang sama, dan melewati biaya 0', () => {
    expect(byCode.D.spend).toBe(220_000)
    expect(byCode.Z).toBeUndefined()
  })

  it('mengurangi pesanan batal (Shopee ikut menghitungnya)', () => {
    expect(byCode.D.batalQty).toBe(4)
    expect(byCode.D.netSold).toBeCloseTo(23)
    expect(byCode.D.netGmv).toBeCloseTo(23 * 200_000)
    expect(byCode.D.realRoas).toBeCloseTo((23 * 200_000) / 220_000)
  })

  it('margin tipis → takedown, ROAS saran tidak mungkin, harga ideal 20%', () => {
    // 200.000 × 0,85 − 165.000 = 5.000 (2,5%)
    expect(byCode.D.unitProfit).toBeCloseTo(5_000)
    expect(byCode.D.bepRoas).toBeCloseTo(40)
    expect(byCode.D.targetRoas).toBeNull()
    expect(byCode.D.verdict).toBe('takedown')
    expect(byCode.D.idealPrice).toBeCloseTo(165_000 / 0.65)
    expect(byCode.D.profitAfterAds).toBeCloseTo(23 * 5_000 - 220_000)
  })

  it('di atas balik modal tapi di bawah target 5% → ROAS terlalu kecil', () => {
    const b = byCode.B
    // 30.000 × 0,85 − 21.000 = 4.500 (15%): BEP 6,67, target 10
    expect(b.bepRoas).toBeCloseTo(1 / 0.15)
    expect(b.targetRoas).toBeCloseTo(10)
    // ROAS nyata 42 × 30.000 / 150.000 = 8,4
    expect(b.realRoas).toBeCloseTo(8.4)
    expect(b.verdict).toBe('kurang')
    // target untuk Shopee memperhitungkan batal 6/48
    expect(b.shopeeTargetRoas).toBeCloseTo(10 / (42 / 48))
  })

  it('label untuk tiap kasus', () => {
    expect(byCode.T.verdict).toBe('hero')
    expect(byCode.S.verdict).toBe('belum_cukup')
    // urutan: takedown dulu
    expect(a.products[0].code).toBe('D')
  })

  it('total untung setelah iklan = untung produk − semua biaya iklan', () => {
    const before = 23 * 5_000 + 42 * 4_500 + 10 * (25_000 * 0.85 - 15_000)
    expect(a.profitBeforeAds).toBeCloseTo(before)
    expect(a.profitAfterAds).toBeCloseTo(before - 325_000)
  })

  it('tanpa Data Keseluruhan: total dari baris total file rincian', () => {
    const r = analyzeAds({ reports: [reports[1]], orders: [], feeRate: 0.15 })
    expect(r.totalSpend).toBe(300_000)
    expect(r.spendFrom).toBe('rincian')
    // tanpa pesanan: harga dari data iklan, HPP tidak diketahui
    expect(r.products.find((p) => p.code === 'D')?.verdict).toBe('hpp_kosong')
  })

  it('HPP cadangan dipakai untuk produk tanpa pesanan', () => {
    const r = analyzeAds({ reports: [reports[1]], orders: [], feeRate: 0.15, fallbackHpp: new Map([['tabur', 15_000]]) })
    expect(r.products.find((p) => p.code === 'T')?.hpp).toBe(15_000)
  })
})

describe('verdictFor', () => {
  const base = { spend: 50_000, netSold: 10, unitProfit: 5_000, realRoas: 8, bepRoas: 6, targetRoas: 10 }
  it('tanpa penjualan: takedown kalau biaya ≥ untung 1 barang', () => {
    expect(verdictFor({ ...base, netSold: 0, spend: 5_000 })).toBe('takedown')
    expect(verdictFor({ ...base, netSold: 0, spend: 4_999 })).toBe('belum_cukup')
    expect(verdictFor({ ...base, netSold: 0, unitProfit: null, spend: 9_999 })).toBe('belum_cukup')
    expect(verdictFor({ ...base, netSold: 0, unitProfit: null, spend: 10_000 })).toBe('takedown')
  })
  it('penjualan sedikit → belum cukup, kecuali jelas rugi', () => {
    expect(verdictFor({ ...base, netSold: 2 })).toBe('belum_cukup')
    expect(verdictFor({ ...base, netSold: 2, realRoas: 3, spend: 10_000 })).toBe('takedown')
  })
  it('urutan ambang', () => {
    expect(verdictFor({ ...base, realRoas: 5 })).toBe('takedown')
    expect(verdictFor({ ...base, realRoas: 8 })).toBe('kurang')
    expect(verdictFor({ ...base, realRoas: 11 })).toBe('aman')
    expect(verdictFor({ ...base, realRoas: 12 })).toBe('hero')
    expect(verdictFor({ ...base, targetRoas: null, realRoas: 50 })).toBe('kurang')
    expect(verdictFor({ ...base, unitProfit: -1, bepRoas: null })).toBe('takedown')
    expect(verdictFor({ ...base, unitProfit: null })).toBe('hpp_kosong')
  })
})

describe('helper', () => {
  it('productKey menyamakan nama iklan dan nama di pesanan', () => {
    expect(productKey('[BARU]  Lavojoy Mask [2]')).toBe(productKey('[baru] lavojoy mask'))
  })
  it('feeRateFromIncome', () => {
    expect(feeRateFromIncome([{ total_income: 85, subtotal_pesanan: 100 }])).toBeCloseTo(0.15)
    expect(feeRateFromIncome([])).toBeNull()
  })
  it('fullMonthOf', () => {
    expect(fullMonthOf('2026-07-01', '2026-07-31')).toBe('2026-07-01')
    expect(fullMonthOf('2026-02-01', '2026-02-28')).toBe('2026-02-01')
    expect(fullMonthOf('2026-07-01', '2026-07-30')).toBeNull()
    expect(fullMonthOf('2026-07-02', '2026-07-31')).toBeNull()
    expect(fullMonthOf('2026-07-01', '2026-08-31')).toBeNull()
  })
})
