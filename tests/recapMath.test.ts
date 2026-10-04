import { describe, expect, it } from 'vitest'
import { estimateProfit, soldFlow } from '../src/lib/recapMath'

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
    expect(r).toEqual({ sales: 1500, income: 850, fees: 650, modal: 500, profit: 350, missingHpp: 0, averaged: 0 })
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
})
