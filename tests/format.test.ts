import { describe, expect, it } from 'vitest'
import {
  addMonths,
  currentMonth,
  formatDate,
  formatDateTime,
  formatMonth,
  formatPercent,
  formatRupiah,
  formatRupiahShort,
  countUpLabels,
  monthEnd,
  periodDays,
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

describe('formatRupiahShort', () => {
  it('meringkas angka besar tanpa membulatkan ke atas', () => {
    expect(formatRupiahShort(2785162)).toBe('Rp2,78 juta')
    expect(formatRupiahShort(13771357)).toBe('Rp13,77 juta')
    expect(formatRupiahShort(2000000)).toBe('Rp2 juta')
    expect(formatRupiahShort(150000)).toBe('Rp150 ribu')
    expect(formatRupiahShort(283642)).toBe('Rp283 ribu')
    expect(formatRupiahShort(1250000000)).toBe('Rp1,25 miliar')
  })
  it('negatif dan angka kecil', () => {
    expect(formatRupiahShort(-283642)).toBe('-Rp283 ribu')
    expect(formatRupiahShort(-2785162)).toBe('-Rp2,78 juta')
    expect(formatRupiahShort(950)).toBe('Rp950')
    expect(formatRupiahShort(null)).toBe('-')
  })
})

describe('countUpLabels', () => {
  it('berisi angka akhir dan teks lebih panjang yang lewat saat berputar', () => {
    const labels = countUpLabels(1_500_000, formatRupiahShort)
    expect(labels[0]).toBe('Rp1,5 juta')
    expect(labels).toContain('Rp1,46 juta') // dua desimal, lebih lebar dari angka akhirnya
    expect(labels.some((l) => / ribu$/.test(l) && l.length === 10)).toBe(true) // "RpXXX ribu"
    expect(new Set(labels).size).toBe(labels.length)
  })
  it('nol hanya satu teks', () => {
    expect(countUpLabels(0, formatRupiahShort)).toEqual(['Rp0'])
  })
})

describe('periodDays', () => {
  it('menghitung tanggal awal dan akhir', () => {
    expect(periodDays('2026-10-13', '2026-10-19')).toBe(7)
    expect(periodDays('2026-10-19', '2026-10-19')).toBe(1)
    expect(periodDays('2026-08-01', '2026-08-31')).toBe(31)
    expect(periodDays('2026-02-26', '2026-03-02')).toBe(5)
  })
})
