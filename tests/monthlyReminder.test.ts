import { describe, expect, it } from 'vitest'
import { buildReminder, reminderItems } from '../src/lib/monthlyReminder'
import type { MonthStatus } from '../src/lib/monthStatus'

const ok: MonthStatus = {
  final: true,
  hasIncome: true,
  missingOrders: { amount: 0, days: [] },
  ordersWithoutIncome: { orders: 0, days: [] },
  missingHpp: 0,
  expensesFilled: true,
  refunds: { amount: 0, days: [] },
  shifted: { amount: 0, days: [] },
}
const incomplete = (patch: Partial<MonthStatus>): MonthStatus => ({ ...ok, final: false, ...patch })

describe('buildReminder', () => {
  it('bulan sudah final: tidak ada pengingat', () => {
    expect(buildReminder({ month: '2026-09-01', status: ok, hadEarlierData: true })).toBeNull()
  })

  it('pelanggan baru (belum pernah punya data) dengan bulan kosong: jangan ditagih', () => {
    expect(buildReminder({ month: '2026-09-01', status: null, hadEarlierData: false })).toBeNull()
  })

  it('pelanggan lama yang bulan lalunya kosong: diingatkan upload', () => {
    const r = buildReminder({ month: '2026-09-01', status: null, hadEarlierData: true })!
    expect(r.kind).toBe('missing')
    expect(r.title).toBe('Data September 2026 belum di-upload')
    expect(r.items.map((i) => i.route)).toEqual(['upload', 'upload'])
  })

  it('bulan ada data tapi belum lengkap: daftar langkahnya, urut seperti di Rekap', () => {
    const r = buildReminder({
      month: '2026-09-01',
      status: incomplete({ hasIncome: false, missingHpp: 3, expensesFilled: false }),
      hadEarlierData: false,
    })!
    expect(r.kind).toBe('incomplete')
    expect(r.title).toBe('Rekap September 2026 belum lengkap')
    expect(r.items.map((i) => i.key)).toEqual(['income', 'hpp', 'expenses'])
  })

  it('tanpa alasan konkret, tidak ada pengingat walau belum final', () => {
    expect(buildReminder({ month: '2026-09-01', status: incomplete({}), hadEarlierData: true })).toBeNull()
  })
})

describe('reminderItems', () => {
  it('tiap langkah menunjuk halaman yang menyelesaikannya', () => {
    const items = reminderItems(
      incomplete({
        hasIncome: false,
        missingOrders: { amount: 1, days: ['2026-09-01'] },
        ordersWithoutIncome: { orders: 1, days: ['2026-09-02'] },
        missingHpp: 2,
        expensesFilled: false,
      }),
      '2026-09-01',
    )
    const by = Object.fromEntries(items.map((i) => [i.key, i]))
    expect(by.income.route).toBe('upload')
    expect(by.orders.route).toBe('upload')
    expect(by.orders.text).toContain('Agustus 2026') // uang cair September berasal dari pesanan Agustus
    expect(by.hpp).toMatchObject({ route: 'hpp', params: { kosong: '1' } })
    expect(by.expenses).toMatchObject({ route: 'biaya', params: { bulan: '2026-09-01' } })
  })

  it('"pesanan tanpa laporan" hanya muncul kalau laporan penghasilan sudah ada (sama seperti Rekap)', () => {
    const s = incomplete({ hasIncome: false, ordersWithoutIncome: { orders: 2, days: ['2026-09-02'] } })
    expect(reminderItems(s, '2026-09-01').map((i) => i.key)).toEqual(['income'])
  })
})
