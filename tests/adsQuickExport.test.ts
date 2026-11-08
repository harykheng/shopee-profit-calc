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
  hppAvgVariants: 0,
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

  const lines = md.split('\n')
  /** Baris isi tabel di bawah judul `heading` (tanpa baris judul kolom & pemisah). */
  const tableAfter = (heading: string) => {
    const start = lines.indexOf(heading)
    expect(start).toBeGreaterThan(-1)
    const rows: string[] = []
    for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i])
    return rows
  }
  const hasil = tableAfter('### Hasil iklan')
  const untung = tableAfter('### Untung & target ROAS')

  it('produk dipecah ke dua tabel dengan urutan yang sama', () => {
    expect(hasil[0]).toContain('| Kode Produk | Vonis |')
    expect(untung[0]).toContain('| Harga jual | HPP |')
    const names = (rows: string[]) => rows.slice(2).map((r) => r.split('|')[1].trim())
    expect(names(hasil)).toEqual(['Sabun', 'Dot / bayi baru'])
    expect(names(untung)).toEqual(names(hasil))
  })

  it('tabel aman untuk Markdown dan menandai HPP sementara', () => {
    const dotHasil = hasil.find((l) => l.startsWith('| Dot'))
    const dotUntung = untung.find((l) => l.startsWith('| Dot'))
    expect(dotHasil).toContain('| Lanjut |')
    expect(dotUntung).toContain('Rp40.000 (sementara)')
    expect(md).not.toContain('Tanpa iklan')
    // Kolom pembanding: Sabun tidak ada di periode sebelumnya.
    expect(hasil.find((l) => l.startsWith('| Sabun'))).toContain('tidak diiklankan')
  })

  it('jumlah kolom tiap baris sama dengan judulnya', () => {
    const cols = (l: string) => l.split('|').length
    for (const rows of [hasil, untung]) for (const r of rows) expect(cols(r)).toBe(cols(rows[0]))
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

  it('menandai HPP rata-rata beberapa variasi', () => {
    const avg = product({ ...dot, hppTemp: false, hppAvgVariants: 3 })
    const text = buildQuickExport({
      storeName: 'T',
      createdAt: '2026-11-08',
      periods: [period('2026-11-01', '2026-11-07', [avg], false)],
    })
    expect(text).toContain('Rp40.000 (rata-rata 3 variasi)')
    expect(text).toContain('variasi yang terjual belum diketahui')
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
