import { describe, expect, it } from 'vitest'
import { roundUpToThousand, simulatePrice, targetRoasFromMargin, type PriceSimInput } from '../src/lib/adsMath'

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
