import { describe, expect, it } from 'vitest'
import {
  addMonths,
  currentMonth,
  formatDate,
  formatDateTime,
  formatMonth,
  formatPercent,
  formatRupiah,
  monthEnd,
} from '../src/lib/format'

describe('format', () => {
  it('formats Rupiah the Indonesian way', () => {
    expect(formatRupiah(1250000)).toBe('Rp1.250.000')
    expect(formatRupiah(13771357)).toBe('Rp13.771.357')
    expect(formatRupiah(-130666)).toBe('-Rp130.666')
    expect(formatRupiah(0)).toBe('Rp0')
    expect(formatRupiah(null)).toBe('-')
  })

  it('formats percentages with a comma', () => {
    expect(formatPercent(40.79)).toBe('40,8%')
    expect(formatPercent(null)).toBe('-')
  })

  it('formats dates in WIB', () => {
    expect(formatDate('2026-08-05')).toBe('5 Agu 2026')
    expect(formatDate('2026-08-31T23:59:00+07:00')).toBe('31 Agu 2026')
    expect(formatDateTime('2026-08-31T16:59:00Z')).toBe('31 Agu 2026 23:59')
    expect(formatMonth('2026-08-01')).toBe('Agustus 2026')
  })

  it('does month arithmetic', () => {
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(monthEnd('2026-02-01')).toBe('2026-02-28')
    expect(monthEnd('2028-02-01')).toBe('2028-02-29')
    expect(currentMonth(new Date('2026-08-31T18:00:00Z'))).toBe('2026-09-01')
  })
})
