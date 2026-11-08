import { describe, expect, it } from 'vitest'
import { DEFAULT_TARGETS, type AdProductResult, type AdsAnalysis } from '../src/lib/adsMath'
import { buildQuickExport, quickExportFileName, quickProducts } from '../src/lib/adsQuickExport'

const product = (p: Partial<AdProductResult>): AdProductResult => ({
  code: 'K1',
  name: 'Produk',
  spend: 0,
  clicks: 0,
  adsSold: 0,
  adsGmv: 0,
  shopeeRoas: null,
  hasOrders: true,
  batalShare: 0,
  batalQty: 0,
  returQty: 0,
  lostShare: 0,
  netSold: 0,
  netGmv: 0,
  realRoas: null,
  price: null,
  priceSource: null,
  hpp: null,
  hppTemp: false,
  hppIncomplete: false,
  feeRate: 0.15,
  feeSource: 'rata-rata',
  unitProfit: null,
  margin: null,
  bepRoas: null,
  targetRoas: null,
  shopeeTargetRoas: null,
  profitAfterAds: null,
  idealPrice: null,
  verdict: 'belum_cukup',
  ...p,
})

const analysis = (products: AdProductResult[]): AdsAnalysis => ({
  totalSpend: products.reduce((s, p) => s + p.spend, 0),
  spendFrom: 'keseluruhan',
  periodsWithoutKeseluruhan: [],
  unallocated: [],
  products,
  adsGmv: 0,
  netGmv: 0,
  profitBeforeAds: 0,
  profitAfterAds: 0,
  productsWithoutProfit: 0,
  realRoas: null,
})

const dot = product({
  code: 'D1',
  name: 'Dot | bayi\nbaru',
  spend: 100_000,
  clicks: 200,
  adsSold: 12,
  netSold: 10,
  shopeeRoas: 12,
  realRoas: 10,
  price: 100_000,
  priceSource: 'pesanan',
  hpp: 40_000,
  hppTemp: true,
  unitProfit: 45_000,
  margin: 0.45,
  bepRoas: 1 / 0.45,
  targetRoas: 2.5,
  shopeeTargetRoas: 3,
  profitAfterAds: 350_000,
  verdict: 'hero',
})
const sabun = product({ code: 'S1', name: 'Sabun', spend: 20_000, clicks: 10, verdict: 'takedown', unitProfit: 5_000, margin: 0.1 })
const tanpaIklan = product({ code: 'X', name: 'Tanpa iklan', spend: 0 })

const period = (start: string, end: string, products: AdProductResult[], hasOrders = true) => ({
  start,
  end,
  days: 7,
  analysis: analysis(products),
  targets: DEFAULT_TARGETS,
  hasOrders,
})

describe('quickProducts', () => {
  it('hanya produk berbiaya iklan, Stop lebih dulu', () => {
    expect(quickProducts(analysis([dot, tanpaIklan, sabun])).map((p) => p.code)).toEqual(['S1', 'D1'])
  })
})

describe('buildQuickExport', () => {
  const md = buildQuickExport({
    storeName: 'Toko Contoh',
    createdAt: '2026-11-08T03:00:00Z',
    periods: [period('2026-10-25', '2026-10-31', [dot]), period('2026-11-01', '2026-11-07', [dot, sabun, tanpaIklan])],
  })

  it('memuat peringatan data beberapa hari dan definisi rumus', () => {
    expect(md).toContain('# Cek cepat iklan Shopee: Toko Contoh')
    expect(md).toContain('Data ini hanya 7 hari')
    expect(md).toContain('**ROAS nyata** = omzet iklan setelah dikurangi pesanan batal dan retur')
    expect(md).toContain('1 ÷ (margin − 5%)')
  })

  it('tabel per produk aman untuk Markdown dan menandai HPP sementara', () => {
    const rows = md.split('\n').filter((l) => l.startsWith('| Dot'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('Dot / bayi baru')
    expect(rows[0]).toContain('Rp40.000 (sementara)')
    expect(rows[0]).toContain('| Lanjut |')
    expect(md).not.toContain('Tanpa iklan')
    // Kolom pembanding: Sabun tidak ada di periode sebelumnya.
    expect(md.split('\n').find((l) => l.startsWith('| Sabun'))).toContain('tidak diiklankan')
  })

  it('jumlah kolom tiap baris tabel produk sama dengan judulnya', () => {
    const lines = md.split('\n')
    const head = lines.findIndex((l) => l.startsWith('| Produk | Kode Produk'))
    const cols = (l: string) => l.split('|').length
    expect(cols(lines[head + 2])).toBe(cols(lines[head]))
    expect(cols(lines[head + 3])).toBe(cols(lines[head]))
  })

  it('memberi tahu kalau export pesanan belum ada', () => {
    const single = buildQuickExport({
      storeName: 'T',
      createdAt: '2026-11-08',
      periods: [period('2026-11-01', '2026-11-07', [dot], false)],
    })
    expect(single).toContain('Export pesanan untuk tanggal ini belum di-upload')
    expect(single).not.toContain('ROAS nyata sebelumnya')
  })

  it('kosong kalau tidak ada periode', () => {
    expect(buildQuickExport({ storeName: 'T', createdAt: '2026-11-08', periods: [] })).toBe('')
  })
})

describe('quickExportFileName', () => {
  it('nama file aman', () => {
    expect(quickExportFileName('Toko Bunda & Bayi!', '2026-11-07')).toBe('cek-cepat-iklan-toko-bunda-bayi-2026-11-07.md')
    expect(quickExportFileName('***', '2026-11-07')).toBe('cek-cepat-iklan-toko-2026-11-07.md')
  })
})
