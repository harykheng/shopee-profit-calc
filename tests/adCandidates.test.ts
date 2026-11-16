import { describe, expect, it } from 'vitest'
import { findAdCandidates } from '../src/lib/adCandidates'
import { analyzeAds, type AdOrderLine, type AdReportRows } from '../src/lib/adsMath'
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

const sold = (name: string, qty: number, price: number, hpp: number | null, returned = 0): AdOrderLine => ({
  product_name: name,
  status_group: 'selesai',
  qty,
  returned_qty: returned,
  subtotal: qty * price,
  hpp,
})

// Satu produk diiklankan dengan ROAS nyata 10 (patokan toko), sisanya belum diiklankan. Nama dummy.
const orders: AdOrderLine[] = [
  sold('Diiklankan', 10, 100_000, 50_000),
  sold('Serum', 8, 100_000, 40_000),
  sold('Toner [3]', 20, 100_000, 40_000),
  sold('Mahal', 5, 100_000, 78_000),
  sold('Tipis', 5, 100_000, 82_000),
  sold('Retur', 10, 100_000, 40_000, 3),
  sold('Kosong', 5, 100_000, null),
  sold('Dua', 2, 100_000, 40_000),
  { product_name: 'Batal', status_group: 'batal', qty: 4, subtotal: 400_000, hpp: 10_000 },
]

const adReports = (extra: AdRow[] = []): AdReportRows[] => [
  {
    source: 'otomatis' as const,
    rows: [
      row({ product_code: 'A', product_name: 'Diiklankan', sold: 10, gmv: 1_000_000, spend: 100_000 }),
      // Iklan yang sudah keluar biaya tapi belum laku tetap dihitung "sudah diiklankan".
      row({ product_code: 'N', product_name: 'Dua', clicks: 3, spend: 2_000 }),
      ...extra,
    ],
  },
]

function run(opts: { reports?: AdReportRows[]; actualFees?: Map<string, number> } = {}) {
  const analysis = analyzeAds({ reports: opts.reports ?? adReports(), orders, feeRate: 0.15 })
  return findAdCandidates({
    orders,
    analysis,
    feeRate: 0.15,
    actualFees: opts.actualFees,
    productIds: new Map([['serum', 'S1']]),
  })
}

describe('findAdCandidates', () => {
  const r = run()
  const by = Object.fromEntries(r.candidates.map((c) => [c.name, c]))

  it('patokan = ROAS nyata iklan toko; produk yang sudah diiklankan dan yang tidak laku dilewati', () => {
    // Omzet 1 juta ÷ biaya 102.000 (termasuk iklan yang belum laku).
    expect(r.referenceRoas).toBeCloseTo(1_000_000 / 102_000)
    expect(by.Diiklankan).toBeUndefined()
    expect(by.Dua).toBeUndefined()
    expect(by.Batal).toBeUndefined()
    expect(r.maybeAdvertised).toBe(false)
  })

  it('layak: target ROAS di bawah patokan; yang paling laku tanpa iklan dulu', () => {
    expect(r.candidates.slice(0, 2).map((c) => c.name)).toEqual(['Toner', 'Serum'])
    // Untung per barang 100.000 × 85% − 40.000 = 45.000 (45%), target untung 5% → ROAS 1 ÷ 0,40 = 2,5.
    expect(by.Serum.status).toBe('layak')
    expect(by.Serum.unitProfit).toBeCloseTo(45_000)
    expect(by.Serum.targetRoas).toBeCloseTo(2.5)
    expect(by.Serum.feeSource).toBe('rata-rata')
  })

  it('berat, tidak mungkin, banyak retur, HPP kosong', () => {
    // Margin 7% → target 1 ÷ 0,02 = 50, jauh di atas ROAS ±9,8 toko.
    expect(by.Mahal.status).toBe('berat')
    expect(by.Mahal.targetRoas).toBeCloseTo(50)
    expect(by.Tipis.status).toBe('tidak_mungkin')
    // 3 dari 10 diretur (30%) → terjual bersih 7.
    expect(by.Retur.status).toBe('banyak_retur')
    expect(by.Retur.sold).toBe(7)
    expect(by.Kosong.status).toBe('hpp_kosong')
    expect(r.candidates.map((c) => c.status)).toEqual(['layak', 'layak', 'berat', 'tidak_mungkin', 'banyak_retur', 'hpp_kosong'])
  })

  it('terjual kurang dari 3 = data belum cukup', () => {
    const rep = adReports()
    rep[0].rows = rep[0].rows.filter((x) => x.product_code !== 'N')
    const c = run({ reports: rep }).candidates.find((x) => x.name === 'Dua')
    expect(c?.status).toBe('sedikit')
  })

  it('potongan asli lewat ID Produk dari laporan penghasilan', () => {
    const serum = run({ actualFees: new Map([['S1', 0.3]]) }).candidates.find((c) => c.name === 'Serum')!
    expect(serum.feeSource).toBe('aktual')
    expect(serum.unitProfit).toBeCloseTo(30_000)
  })

  it('tanpa biaya iklan sama sekali: tidak ada patokan, semua yang mungkin dianggap layak', () => {
    const analysis = analyzeAds({ reports: [], orders, feeRate: 0.15 })
    const res = findAdCandidates({ orders, analysis, feeRate: 0.15 })
    expect(res.referenceRoas).toBeNull()
    expect(res.candidates.find((c) => c.name === 'Mahal')?.status).toBe('layak')
  })

  it('biaya iklan yang belum dirinci per produk → sebagian produk mungkin sudah diiklankan', () => {
    const res = run({
      reports: [
        ...adReports(),
        { source: 'keseluruhan' as const, rows: [row({ ad_name: 'Grup Iklan 1', spend: 50_000 })] },
      ],
    })
    expect(res.maybeAdvertised).toBe(true)
  })
})
