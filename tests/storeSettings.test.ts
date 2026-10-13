import { describe, expect, it } from 'vitest'
import {
  analyzeAds,
  DEFAULT_TARGETS,
  priceLadder,
  simulateAdGroup,
  simulatePrice,
  targetRoasFromMargin,
  type AdOrderLine,
} from '../src/lib/adsMath'
import { estimateProfit } from '../src/lib/recapMath'
import {
  DEFAULT_SETTINGS,
  resolveSettings,
  settingsToPercent,
  targetsOf,
  validateSettings,
} from '../src/lib/storeSettings'
import type { AdRow } from '../src/lib/parsers/ads'

describe('resolveSettings', () => {
  it('tanpa baris atau kolom kosong: bawaan (5%, 20%, retur kembali 100%)', () => {
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(resolveSettings({ ads_target_profit_pct: null })).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ adsTargetProfit: 0.05, priceTargetMargin: 0.2, returnRecovery: 1 })
  })
  it('persen jadi pecahan; angka numerik dari Postgres (string) juga diterima', () => {
    const s = resolveSettings({ ads_target_profit_pct: 3, price_target_margin_pct: '12.5' as unknown as number, return_recovery_pct: 0 })
    expect(s.adsTargetProfit).toBeCloseTo(0.03)
    expect(s.priceTargetMargin).toBeCloseTo(0.125)
    expect(s.returnRecovery).toBe(0) // 0 itu nilai sah, bukan "kosong"
  })
  it('bolak-balik ke persen tanpa sisa desimal', () => {
    expect(settingsToPercent(DEFAULT_SETTINGS)).toEqual({ adsTargetProfitPct: 5, priceTargetMarginPct: 20, returnRecoveryPct: 100 })
  })
  it('targetsOf mengambil dua target untuk hitungan saran', () => {
    expect(targetsOf(DEFAULT_SETTINGS)).toEqual(DEFAULT_TARGETS)
  })
})

describe('validateSettings', () => {
  const ok = { adsTargetProfitPct: 5, priceTargetMarginPct: 20, returnRecoveryPct: 100 }
  it('benar', () => expect(validateSettings(ok)).toBeNull())
  it('di luar batas (sama dengan check di database)', () => {
    expect(validateSettings({ ...ok, adsTargetProfitPct: 51 })).toMatch(/setelah iklan/)
    expect(validateSettings({ ...ok, adsTargetProfitPct: -1 })).toMatch(/setelah iklan/)
    expect(validateSettings({ ...ok, priceTargetMarginPct: 91 })).toMatch(/harga jual/)
    expect(validateSettings({ ...ok, returnRecoveryPct: 101 })).toMatch(/retur/)
    expect(validateSettings({ ...ok, returnRecoveryPct: Number.NaN })).toMatch(/retur/)
  })
  it('batas atas-bawah termasuk', () => {
    expect(validateSettings({ adsTargetProfitPct: 0, priceTargetMarginPct: 0, returnRecoveryPct: 0 })).toBeNull()
    expect(validateSettings({ adsTargetProfitPct: 50, priceTargetMarginPct: 90, returnRecoveryPct: 100 })).toBeNull()
  })
})

describe('target untung per toko', () => {
  it('targetRoasFromMargin: target lebih kecil = ROAS yang dibutuhkan lebih kecil', () => {
    // margin 25%: target 5% → 1/0.20 = 5; target 10% → 1/0.15 = 6,67; target 0 → 1/0.25 = 4 (= balik modal)
    expect(targetRoasFromMargin(0.25, 0).targetRoas).toBeCloseTo(5)
    expect(targetRoasFromMargin(0.25, 0, 0.1).targetRoas).toBeCloseTo(1 / 0.15)
    expect(targetRoasFromMargin(0.25, 0, 0).targetRoas).toBeCloseTo(4)
  })
  it('margin tidak melebihi target: tidak mungkin', () => {
    expect(targetRoasFromMargin(0.1, 0, 0.1).targetRoas).toBeNull()
  })

  const base = { hpp: 50_000, price: 100_000, adminRate: 0.0825, xtra: true, processFee: 1250, packaging: 0, realisticRoas: 5.5 }
  it('simulatePrice tanpa targets sama dengan bawaan', () => {
    expect(simulatePrice(base)).toEqual(simulatePrice({ ...base, targets: DEFAULT_TARGETS }))
  })
  it('simulatePrice: target lebih tinggi = harga saran lebih tinggi', () => {
    const lenient = simulatePrice({ ...base, targets: { adsProfit: 0.02, priceMargin: 0.1 } })
    const strict = simulatePrice({ ...base, targets: { adsProfit: 0.1, priceMargin: 0.3 } })
    expect(strict.priceTargetProfit!.exact).toBeGreaterThan(lenient.priceTargetProfit!.exact)
    expect(strict.priceTargetMargin!.exact).toBeGreaterThan(lenient.priceTargetMargin!.exact)
    // Harga untuk untung m% sebelum iklan: (HPP + proses) ÷ (1 − admin − XTRA − m)
    expect(strict.priceTargetMargin!.exact).toBeCloseTo((50_000 + 1250) / (1 - 0.0825 - 0.04 - 0.3))
  })
  it('priceLadder ikut targets', () => {
    const { price: _p, ...input } = base
    const a = priceLadder({ ...input, targets: { adsProfit: 0.02, priceMargin: 0.1 } })
    const b = priceLadder({ ...input, targets: { adsProfit: 0.1, priceMargin: 0.3 } })
    expect(b.recommended!).toBeGreaterThan(a.recommended!)
  })
  it('simulateAdGroup: target ROAS naik kalau target untung naik', () => {
    const rows = [{ hpp: 50_000, price: 100_000, adminRate: 0.0825, xtra: true, qty: 10 }]
    const low = simulateAdGroup({ rows, processFee: 1250, packaging: 0, targets: { adsProfit: 0.02, priceMargin: 0.2 } })
    const high = simulateAdGroup({ rows, processFee: 1250, packaging: 0, targets: { adsProfit: 0.15, priceMargin: 0.2 } })
    expect(high.mixTargetRoas!).toBeGreaterThan(low.mixTargetRoas!)
  })

  const row = (p: Partial<AdRow>): AdRow => ({ ad_name: '', product_code: '', product_name: '', views: 0, clicks: 0, sold: 0, gmv: 0, spend: 0, ...p })
  const reports = [
    { source: 'otomatis' as const, rows: [row({ product_code: 'S', product_name: 'Serum', sold: 100, gmv: 100 * 100_000, spend: 100_000 })] },
  ]
  const orders: AdOrderLine[] = [{ product_name: 'Serum', status_group: 'selesai', qty: 100, subtotal: 100 * 100_000, hpp: 70_000 }]
  // Untung per barang = 100.000 × 0,85 − 70.000 = 15.000 (margin 15%).
  it('analyzeAds: target 5% bawaan vs target 12% mengubah target ROAS dan harga ideal', () => {
    const d = analyzeAds({ reports, orders, feeRate: 0.15 }).products[0]
    const s = analyzeAds({ reports, orders, feeRate: 0.15, targets: { adsProfit: 0.12, priceMargin: 0.3 } }).products[0]
    expect(d.targetRoas).toBeCloseTo(1 / (0.15 - 0.05)) // 10
    expect(s.targetRoas).toBeCloseTo(1 / (0.15 - 0.12)) // 33,3
    expect(d.idealPrice).toBeCloseTo(70_000 / (1 - 0.15 - 0.2))
    expect(s.idealPrice).toBeCloseTo(70_000 / (1 - 0.15 - 0.3))
  })
  it('analyzeAds: target untung yang tidak mungkin dipenuhi = tanpa harga ideal (bukan harga negatif)', () => {
    const p = analyzeAds({ reports, orders, feeRate: 0.15, targets: { adsProfit: 0.05, priceMargin: 0.9 } }).products[0]
    expect(p.idealPrice).toBeNull()
  })
})

describe('estimateProfit: barang retur yang tidak bisa dijual lagi', () => {
  const items = [{ subtotal: 200_000, qty: 2, returned_qty: 1, completed_at: '2026-09-10T03:00:00Z', hpp: 40_000 }]
  const days = [{ day: '2026-09-10', total_income: 85_000, subtotal_pesanan: 100_000 }]
  it('bawaan (100% kembali): modal hanya barang yang tidak diretur', () => {
    expect(estimateProfit(items, days)!.modal).toBe(40_000)
    expect(estimateProfit(items, days, 1)!.modal).toBe(40_000)
  })
  it('0% kembali: modal barang retur ikut jadi kerugian', () => {
    expect(estimateProfit(items, days, 0)!.modal).toBe(80_000)
  })
  it('50% kembali: separuh modal barang retur hilang', () => {
    expect(estimateProfit(items, days, 0.5)!.modal).toBe(60_000)
  })
  it('untung turun sebesar modal yang hilang, uang masuk tidak berubah', () => {
    const a = estimateProfit(items, days, 1)!
    const b = estimateProfit(items, days, 0)!
    expect(b.income).toBe(a.income)
    expect(a.profit - b.profit).toBe(40_000)
  })
  it('retur penuh tanpa HPP: baru dianggap HPP kosong kalau retur ikut jadi kerugian', () => {
    const full = [{ ...items[0], qty: 2, returned_qty: 2, hpp: null }]
    expect(estimateProfit(full, days, 1)!.missingHpp).toBe(0) // bawaan: perilaku lama
    expect(estimateProfit(full, days, 0)!.missingHpp).toBe(1)
    expect(estimateProfit(full, days, 0.5)!.missingHpp).toBe(1)
  })
  it('barang tanpa HPP tidak ikut (tetap dihitung sebagai HPP kosong)', () => {
    const r = estimateProfit([{ ...items[0], hpp: null }], days, 0)!
    expect(r.modal).toBe(0)
    expect(r.missingHpp).toBe(1)
  })
})
