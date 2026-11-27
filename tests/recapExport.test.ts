import { describe, expect, it } from 'vitest'
import { buildRecapExport, recapExportFileName, recapSummary } from '../src/lib/recapExport'
import type { MonthStatus } from '../src/lib/monthStatus'
import type { IncomeBreakdownRow, ProductRecapRow } from '../src/lib/recapMath'
import type { MonthlyRecap } from '../src/lib/types'

const month = (m: Partial<MonthlyRecap>): MonthlyRecap => ({
  store_id: 1,
  store_name: 'Toko',
  month: '2026-10-01',
  total_income: 800_000,
  subtotal_pesanan: 1_000_000,
  total_modal: 400_000,
  total_expenses: 100_000,
  iklan_shopee: 100_000,
  meta_ads: 0,
  packaging: 0,
  lain_lain: 0,
  net_profit: 300_000,
  margin_pct: null,
  total_qty: 20,
  items_missing_hpp: 0,
  expense_entries: 1,
  adjustments: 0,
  ...m,
})

const finalStatus: MonthStatus = {
  final: true,
  hasIncome: true,
  missingOrders: { amount: 0, days: [] },
  ordersWithoutIncome: { orders: 0, days: [] },
  missingHpp: 0,
  expensesFilled: true,
  refunds: { amount: 0, days: [] },
  shifted: { amount: 0, days: [] },
}

const breakdownRow: IncomeBreakdownRow = {
  month: '2026-10-01',
  subtotal_pesanan: 1_000_000,
  subtotal_ongkir: 0,
  voucher_subsidi: 0,
  biaya_platform: -200_000,
  biaya_gratis_ongkir: 0,
  biaya_layanan_tambahan: 0,
  total_income: 800_000,
  order_count: 18,
  harga_produk: 1_000_000,
  pengembalian_dana: 0,
  biaya_admin: -150_000,
  biaya_proses: -50_000,
  orders_complete: true,
}

const product = (p: Partial<ProductRecapRow>): ProductRecapRow => ({
  sku: 'A',
  product_name: 'Serum',
  variant_name: '',
  qty_sold: 10,
  qty_returned: 0,
  total_modal: 200_000,
  missing_hpp: false,
  item_count: 10,
  items_with_income: 10,
  income: 500_000,
  qty_with_income: 10,
  modal_with_income: 200_000,
  ...p,
})

describe('recapSummary', () => {
  it('menjumlah bulan dan memakai rincian omzet kalau pas dengan uang masuk', () => {
    const s = recapSummary([month({})], [product({})], [breakdownRow])
    expect(s.totals.profit).toBe(300_000)
    expect(s.breakdown?.omzet).toBe(1_000_000)
    expect(s.margin).toBeCloseTo(30)
  })

  it('tanpa rincian yang pas: margin dari uang masuk', () => {
    const s = recapSummary([month({})], [], [{ ...breakdownRow, total_income: 700_000 }])
    expect(s.breakdown).toBeNull()
    expect(s.margin).toBeCloseTo(37.5)
  })
})

describe('buildRecapExport', () => {
  const base = {
    storeName: 'Toko | Cantik',
    createdAt: '2026-11-27T03:00:00Z',
    months: [month({})],
    products: [product({}), product({ sku: 'B', product_name: 'Toner', income: 100_000, modal_with_income: 150_000, total_modal: 150_000 })],
    breakdown: [breakdownRow],
    statuses: [{ month: '2026-10-01', status: finalStatus }],
  }

  it('berisi jawaban, hitungan dari omzet, dan produk urut paling untung', () => {
    const md = buildRecapExport(base)
    expect(md).toContain('# Rekap Oktober 2026: Toko / Cantik')
    expect(md).toContain('## Untung bersih: Rp300.000')
    expect(md).toContain('30% dari omzet')
    expect(md).toContain('**Status: Angka final.**')
    expect(md).toContain('| − Biaya admin | -Rp150.000 | 15% |')
    expect(md).toContain('| − Iklan Shopee | -Rp100.000 | 10% |')
    expect(md.indexOf('| Serum')).toBeLessThan(md.indexOf('| Toner'))
    expect(md).toMatch(/\| Toner \| – \| RUGI \|/)
    expect(md).not.toContain('## Per bulan')
  })

  it('menyebut hal yang belum lengkap dan tabel per bulan untuk beberapa bulan', () => {
    const md = buildRecapExport({
      ...base,
      months: [month({}), month({ month: '2026-11-01', net_profit: -50_000, expense_entries: 0 })],
      breakdown: [],
      statuses: [
        { month: '2026-10-01', status: finalStatus },
        { month: '2026-11-01', status: { ...finalStatus, final: false, expensesFilled: false } },
      ],
    })
    expect(md).toContain('# Rekap Oktober 2026 – November 2026')
    expect(md).toContain('Belum lengkap (1 hal)')
    expect(md).toContain('- November 2026: biaya belum diisi')
    expect(md).toContain('## Per bulan')
    expect(md).toContain('| November 2026 | Belum lengkap |')
  })

  it('kosong kalau tidak ada bulan', () => {
    expect(buildRecapExport({ ...base, months: [] })).toBe('')
  })
})

describe('recapExportFileName', () => {
  it('satu bulan dan rentang', () => {
    expect(recapExportFileName('Harel Beauty', '2026-10-01', '2026-10-01')).toBe('rekap-harel-beauty-2026-10.md')
    expect(recapExportFileName('', '2026-09-01', '2026-10-01')).toBe('rekap-toko-2026-09-sampai-2026-10.md')
  })
})
