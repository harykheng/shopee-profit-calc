import { describe, expect, it } from 'vitest'
import { monthStatus } from '../src/lib/monthStatus'
import type { DailyReconciliation, MonthlyRecap } from '../src/lib/types'

const recap = (over: Partial<MonthlyRecap> = {}): MonthlyRecap => ({
  store_id: 1, store_name: 'Toko', month: '2026-08-01', total_income: 1000, subtotal_pesanan: 1200,
  total_modal: 400, total_expenses: 0, iklan_shopee: 0, meta_ads: 0, packaging: 0, lain_lain: 0,
  net_profit: 600, margin_pct: 60, total_qty: 3, items_missing_hpp: 0, expense_entries: 4, ...over,
})

const day = (d: string, over: Partial<DailyReconciliation> = {}): DailyReconciliation => ({
  store_id: 1, day: d, month: d.slice(0, 8) + '01', income_subtotal: 100, total_income: 90,
  orders_subtotal: 100, order_count: 1, difference: 0, has_income: true, has_orders: true, ...over,
})

describe('monthStatus', () => {
  it('is final when every day matches, HPP is complete and expenses were saved', () => {
    const s = monthStatus(recap(), [day('2026-08-05'), day('2026-08-06')])
    expect(s.final).toBe(true)
  })

  it('a refund day does not block final', () => {
    const s = monthStatus(recap(), [day('2026-08-17', { difference: -130666 })])
    expect(s.final).toBe(true)
    expect(s.refunds).toEqual({ amount: -130666, days: ['2026-08-17'] })
  })

  it('released funds without uploaded orders block final', () => {
    const s = monthStatus(recap(), [
      day('2026-08-01', { has_orders: false, orders_subtotal: 0, order_count: 0, difference: 420900 }),
      day('2026-08-06', { difference: 55800 }),
      day('2026-08-07'),
    ])
    expect(s.final).toBe(false)
    expect(s.missingOrders).toEqual({ amount: 476700, days: ['2026-08-01', '2026-08-06'] })
  })

  it('orders on a day missing from the income report block final', () => {
    const s = monthStatus(recap(), [day('2026-08-05'), day('2026-08-31', { has_income: false, order_count: 2 })])
    expect(s.final).toBe(false)
    expect(s.ordersWithoutIncome).toEqual({ orders: 2, days: ['2026-08-31'] })
  })

  it('needs an income report, complete HPP and saved expenses', () => {
    expect(monthStatus(recap(), []).hasIncome).toBe(false)
    expect(monthStatus(recap(), []).final).toBe(false)
    expect(monthStatus(recap({ items_missing_hpp: 3 }), [day('2026-08-05')]).final).toBe(false)
    const noExpenses = monthStatus(recap({ expense_entries: 0 }), [day('2026-08-05')])
    expect(noExpenses.expensesFilled).toBe(false)
    expect(noExpenses.final).toBe(false)
  })

  it('ignores days from other months', () => {
    const s = monthStatus(recap(), [day('2026-08-05'), day('2026-07-31', { difference: 999 })])
    expect(s.final).toBe(true)
  })

  it('uang yang cair sehari setelah pesanan selesai bukan data hilang (3 → 4 Agu)', () => {
    const s = monthStatus(recap(), [
      day('2026-08-03', { income_subtotal: 735000, orders_subtotal: 933200, difference: -198200 }),
      day('2026-08-04', { income_subtotal: 303400, orders_subtotal: 105200, difference: 198200 }),
      day('2026-08-17', { difference: -130666 }),
    ])
    expect(s.final).toBe(true)
    expect(s.missingOrders.days).toEqual([])
    expect(s.shifted).toEqual({ amount: 198200, days: ['2026-08-04'] })
    // 3 Agu tidak lagi dianggap pengembalian dana; 17 Agu tetap.
    expect(s.refunds).toEqual({ amount: -130666, days: ['2026-08-17'] })
  })

  it('kelebihan pesanan tetangga yang lebih besar ikut menutupi; sisanya tetap pengembalian', () => {
    const s = monthStatus(recap(), [
      day('2026-08-10', { difference: -250000 }),
      day('2026-08-11', { difference: 198200 }),
    ])
    expect(s.missingOrders.days).toEqual([])
    expect(s.refunds).toEqual({ amount: -51800, days: ['2026-08-10'] })
  })

  it('tidak dipasangkan kalau harinya terlalu jauh atau kelebihannya kurang', () => {
    const far = monthStatus(recap(), [day('2026-08-01', { difference: -198200 }), day('2026-08-05', { difference: 198200 })])
    expect(far.missingOrders.days).toEqual(['2026-08-05'])
    const small = monthStatus(recap(), [day('2026-08-03', { difference: -100000 }), day('2026-08-04', { difference: 198200 })])
    expect(small.missingOrders).toEqual({ amount: 198200, days: ['2026-08-04'] })
  })

  it('pergantian bulan: selesai 31 Jul malam (tanpa uang cair), cair 1 Agu', () => {
    const s = monthStatus(recap(), [
      day('2026-07-31', { has_income: false, income_subtotal: 0, orders_subtotal: 198200, difference: -198200 }),
      day('2026-08-01', { orders_subtotal: 0, has_orders: false, difference: 198200 }),
    ])
    expect(s.missingOrders.days).toEqual([])
    expect(s.final).toBe(true)
    const july = monthStatus(recap({ month: '2026-07-01' }), [
      day('2026-07-31', { has_income: false, income_subtotal: 0, orders_subtotal: 198200, difference: -198200 }),
      day('2026-08-01', { orders_subtotal: 0, has_orders: false, difference: 198200 }),
    ])
    expect(july.ordersWithoutIncome.days).toEqual([])
  })
})
