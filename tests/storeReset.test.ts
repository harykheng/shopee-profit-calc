import { describe, expect, it } from 'vitest'
import { confirmNameMatches, resetSummary, toResetCounts } from '../src/lib/storeReset'

describe('confirmNameMatches', () => {
  it('mengabaikan spasi di ujung dan huruf besar/kecil, seperti database', () => {
    expect(confirmNameMatches('  harel beauty ', 'Harel Beauty')).toBe(true)
    expect(confirmNameMatches('Harel', 'Harel Beauty')).toBe(false)
    expect(confirmNameMatches('', '')).toBe(false)
    expect(confirmNameMatches('   ', 'Harel Beauty')).toBe(false)
  })
})

describe('toResetCounts', () => {
  it('mengisi 0 untuk angka yang tidak ada atau aneh', () => {
    const c = toResetCounts({ order_items: 12, income: '3', products: null, expenses: -1, store_name: 'X' })
    expect(c.order_items).toBe(12)
    expect(c.income).toBe(3)
    expect(c.products).toBe(0)
    expect(c.expenses).toBe(0)
    expect(c.ad_rows).toBe(0)
  })
})

describe('resetSummary', () => {
  it('menyebut yang terhapus saja, dan menegaskan nama toko tetap', () => {
    const text = resetSummary(
      'Toko Uji',
      toResetCounts({ order_items: 1200, income: 30, income_orders: 900, products: 45, expenses: 0, ad_reports: 2 }),
    )
    expect(text).toContain('1.200 baris pesanan')
    expect(text).toContain('30 hari uang cair')
    expect(text).toContain('45 produk beserta HPP-nya')
    expect(text).toContain('dan 2 laporan iklan')
    expect(text).not.toContain('biaya')
    expect(text).toContain('Nama toko, akun, dan langganan tidak berubah')
  })

  it('toko yang sudah kosong', () => {
    expect(resetSummary('Toko Uji', toResetCounts({}))).toBe(
      'Toko Uji memang sudah kosong. Nama toko, akun, dan langganan tidak berubah.',
    )
  })
})
