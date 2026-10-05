// Test dengan file iklan Shopee ASLI di /sample-data/ (di-gitignore).
// Otomatis dilewati kalau tidak ada file .csv di sana. Tidak ada angka asli di file ini.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeAds } from '../src/lib/adsMath'
import { parseAdsCsv } from '../src/lib/parsers/ads'

const DIR = path.join(import.meta.dirname, '../sample-data')
const csvs = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.csv')) : []

describe.skipIf(csvs.length === 0)('file iklan Shopee asli (lokal saja)', () => {
  const parsed = csvs.map((f) => parseAdsCsv(fs.readFileSync(path.join(DIR, f), 'utf8')))

  it('semua file terbaca tanpa baris rusak', () => {
    for (const p of parsed) {
      expect(p.warnings).toEqual([])
      expect(p.periodStart <= p.periodEnd).toBe(true)
    }
  })

  it('baris total Iklan Produk Otomatis sama di Data Keseluruhan dan file rincian (periode sama)', () => {
    for (const auto of parsed.filter((p) => p.source === 'otomatis')) {
      const all = parsed.find(
        (p) => p.source === 'keseluruhan' && p.periodStart === auto.periodStart && p.periodEnd === auto.periodEnd,
      )
      if (!all) continue
      const fromAll = all.rows.find((r) => !r.product_code && r.ad_name === 'Iklan Produk Otomatis')
      expect(fromAll?.spend).toBe(auto.totalSpend)
      // Baris produk di rincian berjumlah (hampir) sama dengan barisnya total (selisih pembulatan).
      const sum = auto.rows.filter((r) => r.product_code).reduce((s, r) => s + r.spend, 0)
      expect(Math.abs(sum - auto.totalSpend)).toBeLessThanOrEqual(auto.rows.length)

      const a = analyzeAds({ reports: [all, auto], orders: [], feeRate: 0.15 })
      expect(a.totalSpend).toBe(all.totalSpend)
      expect(a.unallocated.filter((u) => u.need === 'otomatis')).toEqual([])
    }
  })
})
