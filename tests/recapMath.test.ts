import { describe, expect, it } from 'vitest'
import {
  estimateProfit,
  incomeBreakdown,
  productRows,
  recapInsights,
  soldFlow,
  sortProducts,
  type IncomeBreakdownRow,
} from '../src/lib/recapMath'

describe('soldFlow', () => {
  it('explains July: 162 ordered → 108 sold', () => {
    const steps = soldFlow({ ordered: 162, cancelled: 25, inProcess: 0, returned: 1, completedLater: 28, fromEarlier: 0, sold: 108 })
    expect(steps.map((s) => [s.kind, s.value])).toEqual([
      ['start', 162],
      ['minus', 25],
      ['minus', 1],
      ['minus', 28],
      ['result', 108],
    ])
  })

  it('adds orders from the previous month and an unexplained remainder', () => {
    const steps = soldFlow({ ordered: 10, cancelled: 2, inProcess: 1, returned: 0, completedLater: 0, fromEarlier: 4, sold: 13 })
    expect(steps.map((s) => [s.kind, s.value])).toEqual([
      ['start', 10],
      ['minus', 2],
      ['minus', 1],
      ['plus', 4],
      ['plus', 2],
      ['result', 13],
    ])
  })
})

describe('estimateProfit', () => {
  const days = [
    { day: '2026-07-20', total_income: 900, subtotal_pesanan: 1000 }, // 10% potongan
    { day: '2026-07-21', total_income: 1600, subtotal_pesanan: 2000 }, // 20% potongan
  ]

  it('allocates each day’s released income by sales value', () => {
    const r = estimateProfit(
      [
        { subtotal: 500, qty: 1, returned_qty: 0, completed_at: '2026-07-20T10:00:00+07:00', hpp: 300 },
        { subtotal: 1000, qty: 2, returned_qty: 1, completed_at: '2026-07-21T23:30:00+07:00', hpp: 200 },
      ],
      days,
    )
    // 500 × 90% + 1000 × ½ (1 dari 2 diretur) × 80% = 850
    expect(r).toEqual({ sales: 1500, income: 850, fees: 650, modal: 500, profit: 350, missingHpp: 0, averaged: 0, exact: 0, items: 2 })
  })

  it('uses the average fee for days not in the report and counts missing HPP', () => {
    const r = estimateProfit(
      [{ subtotal: 300, qty: 1, returned_qty: 0, completed_at: '2026-08-02T10:00:00+07:00', hpp: null }],
      days,
    )
    // rata-rata: 2500 / 3000
    expect(r).toMatchObject({ income: 250, modal: 0, missingHpp: 1, averaged: 1 })
  })

  it('returns null without any income report', () => {
    expect(estimateProfit([], [])).toBeNull()
  })

  it('uses the real per-order income when it is known, and estimates the rest', () => {
    const r = estimateProfit(
      [
        { subtotal: 500, qty: 1, returned_qty: 0, completed_at: '2026-07-20T10:00:00+07:00', hpp: 300, income: 410 },
        { subtotal: 500, qty: 1, returned_qty: 0, completed_at: '2026-07-20T10:00:00+07:00', hpp: 300 },
      ],
      days,
    )
    // 410 (asli) + 500 × 90% (perkiraan)
    expect(r).toMatchObject({ income: 860, exact: 1, averaged: 0, items: 2 })
  })

  it('works from real income alone, without daily income rows', () => {
    const r = estimateProfit(
      [{ subtotal: 500, qty: 1, returned_qty: 0, completed_at: '2026-07-20T10:00:00+07:00', hpp: 300, income: 410 }],
      [],
    )
    expect(r).toMatchObject({ income: 410, profit: 110, exact: 1, items: 1 })
  })
})

// Juli 2026 dari file asli (Summary "Sudah Dilepas" = PDF bulanan).
const JULY: IncomeBreakdownRow = {
  month: '2026-07-01',
  subtotal_pesanan: 6_600_500,
  subtotal_ongkir: 0,
  voucher_subsidi: -5_400,
  biaya_platform: -680_975,
  biaya_gratis_ongkir: -293_473,
  biaya_layanan_tambahan: 0,
  total_income: 5_620_652,
  order_count: 102,
  harga_produk: 6_628_000,
  pengembalian_dana: -27_500,
  biaya_admin: -554_725,
  biaya_proses: -126_250,
  orders_complete: true,
}

describe('incomeBreakdown', () => {
  it('starts from product price when per-order detail is complete (Excel)', () => {
    expect(incomeBreakdown([JULY])).toEqual({
      detailed: true,
      omzet: 6_628_000,
      orders: 102,
      refund: 27_500,
      voucher: 5_400,
      ongkir: 0,
      shopeeFee: 974_448,
      feeParts: [
        { label: 'Biaya admin', amount: 554_725 },
        { label: 'Gratis Ongkir XTRA', amount: 293_473 },
        { label: 'Biaya proses pesanan', amount: 126_250 },
      ],
      released: 5_620_652,
    })
  })

  it('falls back to the daily columns for PDF months', () => {
    const pdf = { ...JULY, orders_complete: false, harga_produk: null, pengembalian_dana: null, biaya_admin: null, biaya_proses: null, order_count: null }
    expect(incomeBreakdown([pdf])).toMatchObject({
      detailed: false,
      omzet: 6_600_500,
      refund: 0,
      shopeeFee: 974_448,
      feeParts: [
        { label: 'Biaya admin & proses pesanan', amount: 680_975 },
        { label: 'Gratis Ongkir XTRA', amount: 293_473 },
      ],
    })
    // Satu bulan PDF di rentang → semua bulan memakai cara PDF.
    expect(incomeBreakdown([JULY, { ...pdf, month: '2026-08-01' }])?.detailed).toBe(false)
  })

  it('refuses numbers that do not add up', () => {
    expect(incomeBreakdown([{ ...JULY, total_income: 5_000_000 }])).toBeNull()
    expect(incomeBreakdown([])).toBeNull()
  })
})

describe('productRows & sortProducts', () => {
  const base = { variant_name: '', qty_returned: 0, missing_hpp: false }
  const rows = productRows([
    { ...base, sku: 'A', product_name: 'Laris', qty_sold: 40, total_modal: 640_000, item_count: 40, items_with_income: 40, income: 920_000, qty_with_income: 40, modal_with_income: 640_000 },
    { ...base, sku: 'B', product_name: 'Rugi', qty_sold: 14, total_modal: 336_000, item_count: 14, items_with_income: 14, income: 310_000, qty_with_income: 14, modal_with_income: 336_000 },
    { ...base, sku: 'C', product_name: 'Tipis', qty_sold: 7, total_modal: 133_000, item_count: 7, items_with_income: 7, income: 142_000, qty_with_income: 7, modal_with_income: 133_000 },
    { ...base, sku: 'D', product_name: 'PDF', qty_sold: 60, total_modal: 50_000 },
  ])

  it('labels loss-making and thin products from real income', () => {
    expect(rows.map((r) => [r.sku, r.profit, r.status])).toEqual([
      ['D', null, null],
      ['A', 280_000, null],
      ['B', -26_000, 'rugi'],
      ['C', 9_000, 'tipis'],
    ])
  })

  it('sorts by profit with unknown profit last', () => {
    expect(sortProducts(rows, 'rugi').map((r) => r.sku)).toEqual(['B', 'C', 'A', 'D'])
    expect(sortProducts(rows, 'untung').map((r) => r.sku)).toEqual(['A', 'C', 'B', 'D'])
    expect(sortProducts(rows, 'terlaris').map((r) => r.sku)).toEqual(['D', 'A', 'B', 'C'])
  })
})

describe('recapInsights', () => {
  const july = { omzet: 6_628_000, shopeeFee: 974_448, feeParts: [{ label: 'Biaya admin', amount: 554_725 }] }

  it('names the biggest causes, at most 3, most actionable first', () => {
    const r = recapInsights({ ...july, ads: 1_050_000, modal: 3_900_000, profit: 543_533, rugi: 1, tipis: 1 })
    expect(r.map((i) => i.key)).toEqual(['iklan', 'produk', 'potongan'])
    expect(r[0]).toMatchObject({ tone: 'bad', title: 'Iklan Rp1,05 juta = 15,8% dari omzet', detail: '1,9× untung bersih.' })
    expect(r[1]).toMatchObject({
      tone: 'bad',
      title: '1 produk rugi, 1 produk untungnya tipis',
      detail: '(di bawah 10% dari uang masuk), sebelum iklan.',
    })
    expect(r[2]).toMatchObject({ title: 'Potongan Shopee 14,7% dari omzet', detail: '(Rp974 ribu). Terbesar: biaya admin 8,4%.' })
  })

  it('still finishes the sentence when ads are below the profit', () => {
    const r = recapInsights({ ...july, ads: 700_000, modal: 3_000_000, profit: 2_000_000, rugi: 0, tipis: 0 })
    expect(r[0]).toMatchObject({ key: 'iklan', detail: 'masih di bawah untung bersih.' })
  })

  it('skips small ads and mentions a heavy cost of goods', () => {
    const r = recapInsights({ ...july, ads: 100_000, modal: 5_000_000, profit: 400_000, rugi: 0, tipis: 0 })
    expect(r.map((i) => i.key)).toEqual(['potongan', 'modal'])
  })

  it('needs an omzet', () => {
    expect(recapInsights({ omzet: 0, shopeeFee: 0, feeParts: [], ads: 0, modal: 0, profit: 0, rugi: 0, tipis: 0 })).toEqual([])
  })
})
