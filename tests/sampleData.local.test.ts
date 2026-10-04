// Test dengan file Shopee ASLI di /sample-data/ (di-gitignore).
// Otomatis dilewati kalau folder itu tidak ada (mis. di CI / Vercel).
// Tidak ada angka atau data asli yang ditulis di file ini, dan pesan gagal
// hanya berisi jumlah — tidak pernah isi data pembeli.
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseIncomeLines, type IncomeParseResult } from '../src/lib/parsers/income'
import { parseOrdersFile, type OrdersParseResult } from '../src/lib/parsers/orders'
import { BUYER_PRIVATE_COLUMNS } from '../src/lib/shopeeColumns'
import { pdfLinesFromFile } from './helpers/pdf'

const DIR = path.join(import.meta.dirname, '../sample-data')
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR) : []
const ordersFile = files.find((f) => f.toLowerCase().endsWith('.xlsx'))
const incomeFiles = files.filter((f) => f.toLowerCase().endsWith('.pdf'))

describe.skipIf(!ordersFile || incomeFiles.length === 0)('real Shopee sample files (local only)', () => {
  let ordersData: Uint8Array
  let orders: OrdersParseResult
  let incomes: IncomeParseResult[]
  /** Laporan penghasilan untuk bulan yang paling banyak pesanan selesainya di export. */
  let income: IncomeParseResult | undefined

  beforeAll(async () => {
    ordersData = new Uint8Array(fs.readFileSync(path.join(DIR, ordersFile!)))
    orders = parseOrdersFile(ordersData)
    incomes = []
    for (const f of incomeFiles) incomes.push(parseIncomeLines(await pdfLinesFromFile(path.join(DIR, f))))
    const months = new Map<string, number>()
    for (const i of orders.items) months.set(i.completed_at.slice(0, 7), (months.get(i.completed_at.slice(0, 7)) ?? 0) + 1)
    const busiest = [...months.entries()].sort((a, b) => b[1] - a[1])[0][0]
    income = incomes.find((r) => r.periodStart?.startsWith(busiest))
  })

  it('parses the order export', () => {
    expect(orders.items.length).toBeGreaterThan(0)
    expect(orders.skipped.invalid).toBe(0)
    const itemRows = orders.items.length
    expect(itemRows).toBeLessThanOrEqual(orders.totalRows)
  })

  it('does not leak any buyer personal data', () => {
    const wb = XLSX.read(ordersData, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    const header = rows[0] as string[]
    const idx = BUYER_PRIVATE_COLUMNS.map((c) => header.indexOf(c)).filter((i) => i >= 0)
    const values = new Set(
      rows.slice(1).flatMap((r) => idx.map((i) => String(r[i] ?? '').trim())).filter((v) => v.length > 3),
    )
    const json = JSON.stringify(orders)
    const leaks = [...values].filter((v) => json.includes(v)).length
    expect(leaks).toBe(0)
  })

  it('parses every income PDF (column layout may differ per month)', () => {
    for (const r of incomes) {
      expect(r.days.length).toBeGreaterThan(0)
      // Penyesuaian boleh ada; peringatan lain berarti format tidak terbaca sempurna.
      expect(r.warnings.map((w) => w.code).filter((c) => c !== 'adjustments_present')).toEqual([])
      for (const d of r.days) {
        const parts = d.subtotal_pesanan + d.subtotal_ongkir + d.voucher_subsidi + d.biaya_platform +
          d.biaya_gratis_ongkir + d.biaya_layanan_tambahan
        expect(parts).toBe(d.total_income)
      }
    }
  })

  it('daily release subtotal matches completed orders, except refunds and previous-month orders', () => {
    if (!income) return
    const byDay = new Map<string, number>()
    for (const i of orders.items) {
      const day = i.completed_at.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + i.subtotal)
    }
    const diffs = income.days.map((d) => ({
      day: d.released_date,
      diff: d.subtotal_pesanan - (byDay.get(d.released_date) ?? 0),
    }))
    const matched = diffs.filter((d) => d.diff === 0).length
    // Selisih negatif = refund; totalnya harus sama dengan "Jumlah Pengembalian Dana".
    const refunds = diffs.filter((d) => d.diff < 0).reduce((s, d) => s + d.diff, 0)
    expect(refunds).toBe(income.summary.pengembalianDana ?? 0)
    // Selisih positif = pesanan bulan lalu yang belum ada di export; hanya di awal bulan.
    const lateMissing = diffs.filter((d) => d.diff > 0 && Number(d.day.slice(8)) > 10).length
    expect(lateMissing).toBe(0)
    expect(matched).toBeGreaterThan(income.days.length / 2)
  })
})
