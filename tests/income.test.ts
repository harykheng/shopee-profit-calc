import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ParseError } from '../src/lib/parsers/common'
import { parseIncomeLines } from '../src/lib/parsers/income'
import { pdfLinesFromFile } from './helpers/pdf'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/income_dummy.pdf')

describe('parseIncomeLines — dummy PDF fixture', async () => {
  const lines = await pdfLinesFromFile(FIXTURE)
  const result = parseIncomeLines(lines)

  it('reads one row per release date across pages', () => {
    expect(result.days.map((d) => d.released_date)).toEqual([
      '2026-08-01',
      '2026-08-05',
      '2026-08-06',
      '2026-08-17',
      '2026-08-20',
      '2026-08-31',
    ])
  })

  it('maps every column, including unicode minus signs', () => {
    expect(result.days[0]).toEqual({
      released_date: '2026-08-01',
      subtotal_pesanan: 120000,
      subtotal_ongkir: 0,
      voucher_subsidi: -300,
      biaya_platform: -12000,
      biaya_gratis_ongkir: -4800,
      biaya_layanan_tambahan: 0,
      total_income: 102900,
    })
  })

  it('totals match the PDF total line', () => {
    expect(result.totalIncome).toBe(result.days.reduce((s, d) => s + d.total_income, 0))
    expect(result.totalIncome).toBe(549200)
  })

  it('reads the header info and summary', () => {
    expect(result.shopName).toBe('Toko Dummy Beauty')
    expect(result.periodStart).toBe('2026-08-01')
    expect(result.periodEnd).toBe('2026-08-31')
    expect(result.summary).toEqual({ hargaProduk: 665000, pengembalianDana: -25000 })
    expect(result.warnings).toEqual([])
  })
})

// Baris teks sintetis untuk kasus tepi (tanpa perlu membuat PDF baru).
const base = [
  'Catatan Transaksi Penghasilan',
  'Toko Contoh 999999999',
  'Catatan Transaksi untuk 2026-08-01 sampai',
  '2026-08-31',
  'Rincian Dana Dilepaskan',
  'Tanggal Dana Subtotal ...',
  '2026/08/02 1000 0 −100 −100 −50 0 750',
  '2026/08/03 2000 0 0 −200 −100 0 1700',
  'Total Penghasilan 3000 0 −100 −300 −150 0 Rp2,450',
  'Rincian Biaya Penyesuaian',
  'Tidak ada riwayat transaksi minggu ini.',
]

describe('parseIncomeLines — edge cases', () => {
  it('parses a minimal valid report', () => {
    const r = parseIncomeLines(base)
    expect(r.days).toHaveLength(2)
    expect(r.totalIncome).toBe(2450)
    expect(r.warnings).toEqual([])
  })

  it('rejects files that are not an income report', () => {
    expect(() => parseIncomeLines(['Invoice', '2026/08/02 1 2 3'])).toThrow(/bukan laporan penghasilan Shopee/)
  })

  it('rejects a report without the daily table', () => {
    expect(() => parseIncomeLines(['Catatan Transaksi Penghasilan', 'Ringkasan'])).toThrow(ParseError)
  })

  it('fails loudly when a daily row has an unexpected number of columns', () => {
    const lines = base.map((l) => (l.startsWith('2026/08/02') ? '2026/08/02 1000 0 750' : l))
    expect(() => parseIncomeLines(lines)).toThrow(/2026-08-02.*tidak bisa dibaca/)
  })

  it('fails when the total line does not match the daily rows (truncated file)', () => {
    const lines = base.filter((l) => !l.startsWith('2026/08/03'))
    expect(() => parseIncomeLines(lines)).toThrow(/tidak sama dengan jumlah rincian/)
  })

  it('warns when the total line is missing', () => {
    const lines = base.filter((l) => !l.startsWith('Total Penghasilan'))
    expect(parseIncomeLines(lines).warnings.map((w) => w.code)).toEqual(['total_not_found'])
  })

  it('warns when a row does not add up', () => {
    const lines = base.map((l) =>
      l.startsWith('2026/08/02') ? '2026/08/02 1000 0 −100 −100 −50 0 999' : l,
    )
    const withTotal = lines.map((l) =>
      l.startsWith('Total') ? 'Total Penghasilan 3000 0 −100 −300 −150 0 2699' : l,
    )
    const r = parseIncomeLines(withTotal)
    expect(r.warnings[0]).toMatchObject({ code: 'row_sum_mismatch', examples: ['2026-08-02'] })
  })

  it('ignores identical rows repeated on another page, rejects conflicting ones', () => {
    const repeated = [...base.slice(0, 7), base[6], ...base.slice(7)]
    expect(parseIncomeLines(repeated).days).toHaveLength(2)
    const conflicting = [...base.slice(0, 7), '2026/08/02 1 0 0 0 0 0 1', ...base.slice(7)]
    expect(() => parseIncomeLines(conflicting)).toThrow(/muncul dua kali/)
  })

  it('warns about adjustments and dates outside the period', () => {
    const lines = [
      ...base.slice(0, 6),
      '2026/09/01 1000 0 −100 −100 −50 0 750',
      base[7],
      base[8],
      'Rincian Biaya Penyesuaian',
      '2026/08/10 Penyesuaian dummy −10000',
    ]
    const codes = parseIncomeLines(lines).warnings.map((w) => w.code)
    expect(codes).toEqual(['outside_period', 'adjustments_present'])
  })
})
