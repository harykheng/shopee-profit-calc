import { describe, expect, it } from 'vitest'
import { normalizeHeader, parseQty, parseRupiah, parseShopeeDateTime } from '../src/lib/parsers/common'

describe('parseRupiah', () => {
  it.each([
    ['37.200', 37200],
    ['198.200', 198200],
    ['1.694.299', 1694299],
    ['Rp13,771,357', 13771357],
    ['−600', -600],
    ['-1.500', -1500],
    ['0', 0],
    ['', 0],
    [75000, 75000],
    ['12500,50', 12501],
  ])('%s → %s', (input, expected) => {
    expect(parseRupiah(input)).toBe(expected)
  })

  it('returns null for text that is not a number', () => {
    expect(parseRupiah('abc')).toBeNull()
    expect(parseRupiah('12.34.5')).toBeNull()
  })
})

describe('parseQty', () => {
  it('rejects negative quantities', () => {
    expect(parseQty('2')).toBe(2)
    expect(parseQty('-1')).toBeNull()
  })
})

describe('parseShopeeDateTime', () => {
  it.each([
    ['2026-08-03 14:22', '2026-08-03T14:22:00+07:00'],
    ['2026-08-03 14:22:05', '2026-08-03T14:22:05+07:00'],
    ['2026/08/03 14:22', '2026-08-03T14:22:00+07:00'],
    ['03-08-2026 14:22', '2026-08-03T14:22:00+07:00'],
    ['2026-08-31', '2026-08-31T00:00:00+07:00'],
  ])('%s → %s', (input, expected) => {
    expect(parseShopeeDateTime(input)).toBe(expected)
  })

  it('handles Excel serial dates without timezone drift', () => {
    // 46238.5 = 2026-08-04 12:00
    expect(parseShopeeDateTime(46238.5)).toBe('2026-08-04T12:00:00+07:00')
  })

  it('empty → null, garbage → undefined', () => {
    expect(parseShopeeDateTime('')).toBeNull()
    expect(parseShopeeDateTime('-')).toBeNull()
    expect(parseShopeeDateTime('kemarin')).toBeUndefined()
    expect(parseShopeeDateTime('2026-13-01 10:00')).toBeUndefined()
  })
})

describe('normalizeHeader', () => {
  it('ignores case, extra spaces and spaces around slashes', () => {
    expect(normalizeHeader('  Status Pembatalan/ Pengembalian ')).toBe('status pembatalan/pengembalian')
    expect(normalizeHeader('No.  Pesanan')).toBe('no. pesanan')
  })
})
