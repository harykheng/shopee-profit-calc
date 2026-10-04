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

// Ringkasan bulanan (di atas tabel harian); dipakai untuk mengenali kolom biaya.
const SUMMARY = [
  'Ringkasan Dana yang Dilepaskan Jumlah (IDR)',
  'Subtotal Pesanan 3000',
  'Subtotal Ongkos Kirim 0',
  'Voucher & Subsidi \u2212100',
  'Voucher disponsor oleh Penjual \u2212100',
  'Biaya Platform \u2212300',
  'Biaya Gratis Ongkir XTRA \u2212150',
  'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D) \u2212150',
  'Subtotal Biaya Layanan Tambahan 0',
  'Total Penghasilan',
  'Rp2,450',
]
const parse = (lines: string[]) => parseIncomeLines([...lines.slice(0, 4), ...SUMMARY, ...lines.slice(4)])

describe('parseIncomeLines — edge cases', () => {
  it('parses a minimal valid report', () => {
    const r = parse(base)
    expect(r.days).toHaveLength(2)
    expect(r.totalIncome).toBe(2450)
    expect(r.warnings).toEqual([])
  })

  it('rejects files that are not an income report', () => {
    expect(() => parse(['Invoice', '2026/08/02 1 2 3'])).toThrow(/bukan laporan penghasilan Shopee/)
  })

  it('rejects a report without the daily table', () => {
    expect(() => parse(['Catatan Transaksi Penghasilan', 'Ringkasan'])).toThrow(ParseError)
  })

  it('fails loudly when a daily row has an unexpected number of columns', () => {
    const lines = base.map((l) => (l.startsWith('2026/08/02') ? '2026/08/02 1000 0 750' : l))
    expect(() => parse(lines)).toThrow(/2026-08-02.*tidak bisa dibaca/)
  })

  it('fails when the total line does not match the daily rows (truncated file)', () => {
    const lines = base.filter((l) => !l.startsWith('2026/08/03'))
    expect(() => parse(lines)).toThrow(/tidak sama dengan jumlah rincian/)
  })

  it('warns when the total line is missing', () => {
    const lines = base.filter((l) => !l.startsWith('Total Penghasilan'))
    expect(parse(lines).warnings.map((w) => w.code)).toEqual(['total_not_found'])
  })

  it('warns when a row does not add up', () => {
    const lines = base.map((l) =>
      l.startsWith('2026/08/02') ? '2026/08/02 1000 0 −100 −100 −50 0 999' : l,
    )
    const withTotal = lines.map((l) =>
      l.startsWith('Total') ? 'Total Penghasilan 3000 0 −100 −300 −150 0 2699' : l,
    )
    const r = parse(withTotal)
    expect(r.warnings[0]).toMatchObject({ code: 'row_sum_mismatch', examples: ['2026-08-02'] })
  })

  it('ignores identical rows repeated on another page, rejects conflicting ones', () => {
    const repeated = [...base.slice(0, 7), base[6], ...base.slice(7)]
    expect(parse(repeated).days).toHaveLength(2)
    const conflicting = [...base.slice(0, 7), '2026/08/02 1 0 0 0 0 0 1', ...base.slice(7)]
    expect(() => parse(conflicting)).toThrow(/muncul dua kali/)
  })

  it('warns about dates outside the period and still reads adjustments', () => {
    const lines = [
      ...base.slice(0, 6),
      '2026/09/01 1000 0 −100 −100 −50 0 750',
      base[7],
      base[8],
      'Rincian Biaya Penyesuaian',
      '2026/08/10 Penyesuaian dummy −10000',
    ]
    const r = parse(lines)
    expect(r.warnings.map((w) => w.code)).toEqual(['outside_period'])
    expect(r.adjustments).toEqual([{ date: '2026-08-10', description: 'Penyesuaian dummy', amount: -10000 }])
  })

  it('warns when the adjustments section has content it cannot read', () => {
    const lines = [...base.slice(0, 9), 'Rincian Biaya Penyesuaian', 'Format baru yang aneh']
    expect(parse(lines).warnings.map((w) => w.code)).toEqual(['adjustments_unreadable'])
  })

  it('handles an extra fee column (e.g. "Biaya Layanan" in July) by its summary label', () => {
    const summary = SUMMARY.map((l) => (l.startsWith('Biaya Gratis Ongkir XTRA \u2212') ? l : l)).concat()
    const idx = summary.indexOf('Subtotal Biaya Layanan Tambahan 0')
    summary.splice(idx, 0, 'Biaya Layanan \u221220', 'SPayLater Xtra 0% Service Fee \u221220')
    const lines = [
      ...base.slice(0, 4),
      ...summary,
      'Rincian Dana Dilepaskan',
      'Tanggal Dana Subtotal Subtotal Voucher & Biaya Biaya Gratis Biaya Subtotal Biaya Layanan Total',
      '2026/08/02 1000 0 \u2212100 \u2212100 \u221250 \u221220 0 730',
      '2026/08/03 2000 0 0 \u2212200 \u2212100 0 0 1700',
      'Total Penghasilan 3000 0 \u2212100 \u2212300 \u2212150 \u221220 0 Rp2,430',
    ]
    const r = parseIncomeLines(lines)
    expect(r.warnings).toEqual([])
    expect(r.totalIncome).toBe(2430)
    expect(r.days[0]).toMatchObject({
      subtotal_pesanan: 1000,
      voucher_subsidi: -100,
      biaya_platform: -100,
      biaya_gratis_ongkir: -50,
      biaya_layanan_tambahan: -20,
      total_income: 730,
    })
  })

  it('still reads subtotal and total when fee columns are unknown', () => {
    const lines = base.map((l) =>
      l.startsWith('2026/08/02') ? '2026/08/02 1000 0 \u2212100 \u2212100 \u221250 \u22125 0 745'
      : l.startsWith('2026/08/03') ? '2026/08/03 2000 0 0 \u2212200 \u2212100 0 0 1700'
      : l.startsWith('Total') ? 'Total Penghasilan 3000 0 \u2212100 \u2212300 \u2212150 \u22125 0 Rp2,445'
      : l,
    )
    const r = parse(lines)
    expect(r.totalIncome).toBe(2445)
    expect(r.days[0]).toMatchObject({ subtotal_pesanan: 1000, total_income: 745 })
    expect(r.warnings.map((w) => w.code)).toEqual(['fee_columns_unknown'])
  })

  it('rejects rows with different column counts in one report', () => {
    const lines = base.map((l) => (l.startsWith('2026/08/03') ? '2026/08/03 2000 0 0 \u2212200 \u2212100 0 0 1700' : l))
    expect(() => parse(lines)).toThrow(/2026-08-03.*jumlah kolomnya berbeda/)
  })

  it('reads adjustments with their amounts', () => {
    const lines = [
      ...base.slice(0, 9),
      'Ringkasan Biaya Penyesuaian Jumlah',
      'Total Penghasilan pada Biaya Penyesuaian (IDR) Rp22,881',
      'Rincian Biaya Penyesuaian',
      'Tanggal Pelepasan Dana Tipe Penyesuaian | Deskripsi Total Penghasilan pada Biaya Penyesuaian (IDR)',
      '2026/08/30 Penyesuaian/Kompensasi Pengembalian Barang/Dana 22,881',
      'Total Penghasilan pada Biaya Penyesuaian (IDR) Rp22,881',
    ]
    const r = parse(lines)
    expect(r.adjustments).toEqual([
      { date: '2026-08-30', description: 'Penyesuaian/Kompensasi Pengembalian Barang/Dana', amount: 22881 },
    ])
    expect(r.totalIncome).toBe(2450)
    expect(r.warnings).toEqual([])
  })
})
