import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { ParseError } from '../src/lib/parsers/common'
import { parseOrdersFile, parseOrdersWorkbook } from '../src/lib/parsers/orders'
import { BUYER_PRIVATE_COLUMNS } from '../src/lib/shopeeColumns'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/orders_dummy.xlsx')
const readFixture = () => new Uint8Array(fs.readFileSync(FIXTURE))
const fixtureRows = () => {
  const wb = XLSX.read(readFixture(), { type: 'array' })
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
}
const workbookFromRows = (rows: unknown[][]) => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'orders')
  return wb
}

describe('parseOrdersFile — dummy fixture', () => {
  const result = parseOrdersFile(readFixture())
  const bySku = (order: string, sku: string) =>
    result.items.find((i) => i.order_no === order && i.sku === sku)

  it('counts rows and keeps only completed items', () => {
    expect(result.totalRows).toBe(12)
    expect(result.items).toHaveLength(7)
    expect(result.orderCount).toBe(6)
    expect(result.skipped.byStatus).toEqual({ Batal: 1, 'Belum Bayar': 1, 'Sedang Dikirim': 1 })
    expect(result.skipped.invalid).toBe(1)
    expect(result.items.every((i) => i.status === 'Selesai')).toBe(true)
  })

  it('uses Nomor Referensi SKU when present', () => {
    expect(bySku('260801DUMMY001', 'DUM-POND')).toMatchObject({
      sku_source: 'sku',
      qty: 1,
      subtotal: 37200,
      completed_at: '2026-08-05T10:17:00+07:00',
    })
  })

  it('falls back to SKU Induk + variasi so variants stay separate', () => {
    expect(bySku('260801DUMMY002', 'DUM-DOT | M')).toMatchObject({ sku_source: 'sku_induk', qty: 2, subtotal: 57000 })
    expect(bySku('260801DUMMY002', 'DUM-DOT | L (Regular)')).toMatchObject({ sku_source: 'sku_induk', qty: 1 })
  })

  it('falls back to nama produk (+ variasi) when there is no SKU at all', () => {
    expect(bySku('260802DUMMY003', '[HARGA GROSIR] Sikat Gigi Dummy 12PCS')).toMatchObject({
      sku_source: 'nama',
      variant_name: '',
      qty: 4,
      subtotal: 198200,
    })
    expect(bySku('260802DUMMY004', '[GROSIR] Bedak Dummy Silver / Putih | Putih')).toMatchObject({
      sku_source: 'nama',
      variant_name: 'Putih',
    })
  })

  it('keeps returned quantity and return status', () => {
    expect(bySku('260802DUMMY004', '[GROSIR] Bedak Dummy Silver / Putih | Putih')).toMatchObject({
      qty: 2,
      returned_qty: 1,
      return_status: 'Permintaan Disetujui',
    })
  })

  it('merges duplicate rows of the same order + product', () => {
    expect(result.items.filter((i) => i.order_no === '260804DUMMY007')).toHaveLength(1)
    expect(bySku('260804DUMMY007', '[HARGA GROSIR] Sikat Gigi Dummy 12PCS')).toMatchObject({
      qty: 2,
      subtotal: 99100,
      completed_at: '2026-08-31T23:59:00+07:00',
    })
  })

  it('accepts numeric cells as well as text', () => {
    expect(bySku('260805DUMMY009', 'DUM-DOT | S')).toMatchObject({ qty: 3, subtotal: 75000 })
  })

  it('reports warnings for fallback SKUs, returns, merged and invalid rows', () => {
    const codes = result.warnings.map((w) => w.code)
    expect(codes).toEqual(['sku_from_name', 'sku_from_parent', 'returned_items', 'merged_duplicates', 'invalid_rows'])
    expect(result.warnings.find((w) => w.code === 'invalid_rows')?.examples).toEqual(['260806DUMMY010'])
  })

  it('never leaks buyer personal data into the result', () => {
    const rows = fixtureRows()
    const header = rows[0] as string[]
    const privateIdx = BUYER_PRIVATE_COLUMNS.map((c) => header.indexOf(c)).filter((i) => i >= 0)
    expect(privateIdx.length).toBe(BUYER_PRIVATE_COLUMNS.length)
    const privateValues = rows
      .slice(1)
      .flatMap((r) => privateIdx.map((i) => String(r[i] ?? '')))
      .filter((v) => v.length > 3)
    expect(privateValues.length).toBeGreaterThan(0)
    const json = JSON.stringify(result)
    for (const value of privateValues) expect(json).not.toContain(value)
  })
})

describe('parseOrdersWorkbook — format variations', () => {
  it('finds the header even when it is not on row 1', () => {
    const rows = fixtureRows()
    const wb = workbookFromRows([['Laporan Pesanan'], [], ...rows])
    expect(parseOrdersWorkbook(wb).items).toHaveLength(7)
  })

  it('matches headers regardless of case, spacing and column order', () => {
    const rows = fixtureRows()
    const header = (rows[0] as string[]).map((h) => `  ${h.toUpperCase()} `)
    const reversed = [header, ...rows.slice(1)].map((r) => [...(r as unknown[])].reverse())
    expect(parseOrdersWorkbook(workbookFromRows(reversed)).items).toHaveLength(7)
  })

  it('recovers rows when the sheet size metadata is wrong (Shopee bug)', () => {
    const wb = XLSX.read(readFixture(), { type: 'array' })
    wb.Sheets[wb.SheetNames[0]]['!ref'] = 'A1'
    expect(parseOrdersWorkbook(wb).items).toHaveLength(7)
  })

  it('rejects files that are not an order export, with a friendly message', () => {
    const wb = workbookFromRows([['Nama', 'Harga'], ['Sabun', '1000']])
    expect(() => parseOrdersWorkbook(wb)).toThrow(ParseError)
    expect(() => parseOrdersWorkbook(wb)).toThrow(/bukan export pesanan Shopee/)
  })

  it('names the missing columns when only some are missing', () => {
    const rows = fixtureRows()
    const header = (rows[0] as string[]).map((h) => (h === 'Waktu Pesanan Selesai' ? 'Kolom Lain' : h))
    expect(() => parseOrdersWorkbook(workbookFromRows([header, ...rows.slice(1)]))).toThrow(
      /Kolom yang tidak ditemukan: Waktu Pesanan Selesai/,
    )
  })

  it('rejects an export without data rows', () => {
    const rows = fixtureRows()
    expect(() => parseOrdersWorkbook(workbookFromRows([rows[0]]))).toThrow(/tidak berisi data pesanan/)
  })

  it('rejects a PDF uploaded in the order slot', () => {
    const pdf = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/income_dummy.pdf'))
    expect(() => parseOrdersFile(new Uint8Array(pdf))).toThrow(ParseError)
  })
})
