import { describe, expect, it } from 'vitest'
import {
  profitAtRoas,
  roundUpToThousand,
  simulateAdGroup,
  simulatePrice,
  targetRoasFromMargin,
  type PriceSimInput,
} from '../src/lib/adsMath'

// Admin 8,25%, XTRA ON, proses 1.250, packaging 0, ROAS realistis 5,5.
const base: Omit<PriceSimInput, 'hpp' | 'price'> = {
  adminRate: 0.0825,
  xtra: true,
  processFee: 1250,
  packaging: 0,
  realisticRoas: 5.5,
}

describe('simulatePrice', () => {
  it('kasus 1: HPP 46.668, harga 65.000', () => {
    const r = simulatePrice({ ...base, hpp: 46_668, price: 65_000, actualRoas: 6.94 })
    expect(Math.abs(r.totalFee - 9_213)).toBeLessThanOrEqual(2)
    expect(Math.abs(r.profit - 9_120)).toBeLessThanOrEqual(2)
    expect(r.bepRoas).toBeCloseTo(7.13, 2)
    expect(Math.abs((r.priceBreakEven?.exact ?? 0) - 68_879)).toBeLessThanOrEqual(2)
    expect(r.priceBreakEven?.rounded).toBe(69_000)
    // ROAS aktual 6,94 → iklan rugi ±246 per order
    expect(r.actual).not.toBeNull()
    expect(Math.abs((r.actual?.profitAfterAds ?? 0) + 246)).toBeLessThanOrEqual(2)
  })

  it('kasus 2: HPP 93.336, harga 128.000', () => {
    const r = simulatePrice({ ...base, hpp: 93_336, price: 128_000 })
    expect(Math.abs(r.profit - 17_734)).toBeLessThanOrEqual(2)
    expect(r.bepRoas).toBeCloseTo(7.22, 2)
    expect(Math.abs((r.priceBreakEven?.exact ?? 0) - 135_961)).toBeLessThanOrEqual(2)
    expect(r.priceBreakEven?.rounded).toBe(136_000)
    expect(r.actual).toBeNull()
  })

  it('kasus 3: HPP 60.000, harga 65.000 → sudah rugi tanpa iklan', () => {
    const r = simulatePrice({ ...base, hpp: 60_000, price: 65_000 })
    expect(r.profitable).toBe(false)
    expect(r.profit).toBeLessThan(0)
    expect(r.bepRoas).toBeNull()
    expect(r.targetRoas).toBeNull()
  })

  it('saran target ROAS memakai rumus yang sama dengan halaman Iklan (tanpa cadangan batal)', () => {
    const r = simulatePrice({ ...base, hpp: 46_668, price: 65_000 })
    expect(r.targetRoas).toBe(targetRoasFromMargin(r.margin, 0).shopeeTargetRoas)
    // margin ±14% → 1 / (0,14 − 0,05)
    expect(r.targetRoas).toBeCloseTo(1 / (r.margin - 0.05), 6)
  })

  it('harga untuk untung 5% setelah iklan dan untuk untung 20%', () => {
    const r = simulatePrice({ ...base, hpp: 46_668, price: 65_000 })
    const fixed = 46_668 + 1_250
    expect(r.priceTargetProfit?.exact).toBeCloseTo(fixed / (1 - 0.1225 - 1 / 5.5 - 0.05), 6)
    expect(r.priceTargetMargin?.exact).toBeCloseTo(fixed / (1 - 0.1225 - 0.2), 6)
    expect(r.priceTargetProfit?.rounded).toBe(roundUpToThousand(r.priceTargetProfit?.exact ?? 0))
  })

  it('penyebut ≤ 0 → tidak mungkin', () => {
    const r = simulatePrice({ ...base, hpp: 10_000, price: 20_000, realisticRoas: 1.2 })
    // 1 − 0,1225 − 1/1,2 = 0,044 → balik modal masih mungkin; dengan 5% tidak
    expect(r.priceBreakEven).not.toBeNull()
    expect(r.priceTargetProfit).toBeNull()
    expect(simulatePrice({ ...base, hpp: 10_000, price: 20_000, realisticRoas: 1 }).priceBreakEven).toBeNull()
  })

  it('tanpa Gratis Ongkir XTRA, potongan hanya admin + proses', () => {
    const r = simulatePrice({ ...base, xtra: false, hpp: 46_668, price: 65_000 })
    expect(r.xtraFee).toBe(0)
    expect(r.totalFee).toBeCloseTo(65_000 * 0.0825 + 1_250, 6)
  })
})

describe('roundUpToThousand', () => {
  it('membulatkan ke atas ke Rp1.000', () => {
    expect(roundUpToThousand(68_879.3)).toBe(69_000)
    expect(roundUpToThousand(69_000)).toBe(69_000)
    expect(roundUpToThousand(69_000.4)).toBe(70_000)
  })
})

describe('simulateAdGroup', () => {
  const fees = { adminRate: 0.0825, xtra: true }
  // Untung per order sebelum iklan (proses 1.250, packaging 0):
  // A: harga 65.000, HPP 46.668 → ±9.120 (margin 14,0%)  → target sendiri 1/(0,140−0,05) ≈ 11,1
  // B: harga 50.000, HPP 25.000 → ±19.163 (margin 38,3%) → target sendiri ≈ 3,0
  const A = { ...fees, price: 65_000, hpp: 46_668 }
  const B = { ...fees, price: 50_000, hpp: 25_000 }

  it('target sesuai porsi memakai margin gabungan; target aman = target tertinggi', () => {
    const g = simulateAdGroup({ rows: [{ ...A, qty: 10 }, { ...B, qty: 30 }], processFee: 1250, packaging: 0 })
    const a = g.rows[0]
    const b = g.rows[1]
    expect(a.targetRoas).toBeCloseTo(1 / (a.margin - 0.05), 6)
    expect(b.targetRoas).toBeCloseTo(1 / (b.margin - 0.05), 6)
    const gmv = 65_000 * 10 + 50_000 * 30
    const profit = a.profit * 10 + b.profit * 30
    expect(g.gmv).toBeCloseTo(gmv, 6)
    expect(g.mixBepRoas).toBeCloseTo(gmv / profit, 6)
    expect(g.mixTargetRoas).toBeCloseTo(1 / (profit / gmv - 0.05), 6)
    expect(g.safeTargetRoas).toBeCloseTo(a.targetRoas as number, 6)
    // Porsi diketahui semua → yang disarankan target sesuai porsi, dan selalu ≤ target aman.
    expect(g.recommended).toBe('mix')
    expect(g.mixTargetRoas as number).toBeLessThan(g.safeTargetRoas as number)
    // Di ROAS grup, produk A (margin tipis) rugi; B tetap untung.
    expect(profitAtRoas({ price: 65_000, profit: a.profit }, g.mixTargetRoas as number)).toBeLessThan(0)
    expect(profitAtRoas({ price: 50_000, profit: b.profit }, g.mixTargetRoas as number)).toBeGreaterThan(0)
  })

  it('produk baru (porsi belum diketahui) → disarankan target aman, porsinya pakai rata-rata', () => {
    const g = simulateAdGroup({ rows: [{ ...A, qty: null }, { ...B, qty: 30 }], processFee: 1250, packaging: 0 })
    expect(g.hasUnknownQty).toBe(true)
    expect(g.rows[0].weightEstimated).toBe(true)
    expect(g.rows[0].weight).toBe(30)
    expect(g.recommended).toBe('safe')
    expect(g.recommendedRoas).toBeCloseTo(g.rows[0].targetRoas as number, 6)
  })

  it('ada produk yang margin-nya ≤ 5% → target aman tidak ada, tetap kasih target porsi', () => {
    const thin = { ...fees, price: 65_000, hpp: 53_000 }
    const g = simulateAdGroup({ rows: [{ ...thin, qty: 5 }, { ...B, qty: 30 }], processFee: 1250, packaging: 0 })
    expect(g.rows[0].targetRoas).toBeNull()
    expect(g.safeTargetRoas).toBeNull()
    expect(g.mixTargetRoas).not.toBeNull()
    expect(g.recommended).toBe('mix')
  })

  it('semua produk baru → porsi sama rata (1 : 1)', () => {
    const g = simulateAdGroup({ rows: [{ ...A, qty: null }, { ...B, qty: null }], processFee: 1250, packaging: 0 })
    expect(g.rows.map((r) => r.weight)).toEqual([1, 1])
    expect(g.recommended).toBe('safe')
  })

  it('porsi nol semua → target porsi tidak bisa dihitung, disarankan target aman', () => {
    const g = simulateAdGroup({ rows: [{ ...A, qty: 0 }, { ...B, qty: 0 }], processFee: 1250, packaging: 0 })
    expect(g.mixTargetRoas).toBeNull()
    expect(g.recommended).toBe('safe')
    expect(g.recommendedRoas).toBeCloseTo(g.safeTargetRoas as number, 6)
  })
})
