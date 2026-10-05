// Parser file CSV data iklan Shopee (Iklan Saya → Download Data).
// File iklan tidak berisi data pembeli.
import { ADS_CSV, HEADER_SEARCH_ROWS, type AdSource } from '../shopeeColumns'
import { ParseError, cleanText, normalizeHeader, type ParseWarning } from './common'

/** Satu baris iklan / produk, siap dikirim ke RPC `save_ad_report`. */
export interface AdRow {
  /** Nama iklan / grup. Untuk baris produk di file otomatis/grup: nama iklan/grup induknya. */
  ad_name: string
  /** Kode Produk Shopee; '' kalau baris ini total iklan/grup (bukan satu produk). */
  product_code: string
  /** Nama produk tanpa akhiran " [2]"; '' kalau bukan baris produk. */
  product_name: string
  views: number
  clicks: number
  /** "Produk Terjual" versi Shopee (ikut menghitung pesanan yang kemudian batal). */
  sold: number
  gmv: number
  spend: number
}

export interface AdsParseResult {
  source: AdSource
  /** Nama jenis file untuk ditampilkan. */
  sourceLabel: string
  /** "Nama Toko" di file. */
  shopName: string
  /** YYYY-MM-DD */
  periodStart: string
  /** YYYY-MM-DD */
  periodEnd: string
  rows: AdRow[]
  /** Total biaya iklan di file (tanpa dobel antara baris total dan baris produk). */
  totalSpend: number
  /** Jumlah produk yang punya biaya iklan. */
  productCount: number
  warnings: ParseWarning[]
}

const NOT_ADS_FILE =
  'File ini sepertinya bukan data iklan Shopee. ' +
  'Ambil dari Seller Centre → Iklan Saya → Download Data (file .csv).'

/** Baca CSV sederhana (tanda kutip, koma/titik koma, baris CRLF). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLines = src.split(/\r?\n/, HEADER_SEARCH_ROWS).join('\n')
  const delimiter = (firstLines.match(/;/g)?.length ?? 0) > (firstLines.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/**
 * Angka di CSV iklan: "899423", "6972.27" (titik = desimal), "1,036,055".
 * Kosong / "-" → 0. Tidak bisa dibaca → null.
 */
export function parseAdNumber(value: string): number | null {
  const s = value.trim().replace(/\s/g, '')
  if (s === '' || s === '-') return 0
  if (/^-?\d+(\.\d+)?$/.test(s)) return Math.round(Number(s))
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Math.round(Number(s.replace(/,/g, '')))
  if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) return Number(s.replace(/\./g, ''))
  return null
}

/** Hapus akhiran " [2]" yang ditambahkan Shopee untuk iklan kedua dari produk yang sama. */
export function stripAdSuffix(name: string): string {
  return name.replace(/\s*\[\d+\]\s*$/, '')
}

/** "01/07/2026" → "2026-07-01" */
function parseDmy(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [d, mo, y] = [+m[1], +m[2], +m[3]]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseAdsCsv(text: string): AdsParseResult {
  const rows = parseCsv(text)

  // Baris header: punya kolom "Kode Produk" dan "Biaya".
  const codeKey = normalizeHeader(ADS_CSV.columns.productCode[0])
  const spendKey = normalizeHeader(ADS_CSV.columns.spend[0])
  const headerIdx = rows
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((r) => r.some((c) => normalizeHeader(c) === codeKey) && r.some((c) => normalizeHeader(c) === spendKey))
  if (headerIdx < 0) throw new ParseError(NOT_ADS_FILE)
  const header = rows[headerIdx].map(normalizeHeader)

  const kind = ADS_CSV.kinds.find((k) => header.includes(normalizeHeader(k.nameColumn)))
  if (!kind) throw new ParseError(NOT_ADS_FILE)

  const col = (aliases: readonly string[]) => {
    for (const a of aliases) {
      const i = header.indexOf(normalizeHeader(a))
      if (i >= 0) return i
    }
    return -1
  }
  const idx = {
    name: header.indexOf(normalizeHeader(kind.nameColumn)),
    code: col(ADS_CSV.columns.productCode),
    views: col(ADS_CSV.columns.views),
    clicks: col(ADS_CSV.columns.clicks),
    sold: col(ADS_CSV.columns.sold),
    gmv: col(ADS_CSV.columns.gmv),
    spend: col(ADS_CSV.columns.spend),
  }
  const missing = (['sold', 'gmv', 'spend'] as const).filter((k) => idx[k] < 0)
  if (missing.length > 0) {
    throw new ParseError(
      'Kolom ' +
        missing.map((k) => `"${ADS_CSV.columns[k][0]}"`).join(', ') +
        ' tidak ditemukan di file iklan. Pastikan file tidak diubah sebelum di-upload.',
    )
  }

  // Info di atas header.
  let shopName = ''
  let periodStart: string | null = null
  let periodEnd: string | null = null
  for (const r of rows.slice(0, headerIdx)) {
    const label = normalizeHeader(r[0])
    if (label === normalizeHeader(ADS_CSV.shopNameLabel)) shopName = cleanText(r[1])
    if (label === normalizeHeader(ADS_CSV.periodLabel)) {
      const [a, b] = String(r[1] ?? '').split(/\s+-\s+/)
      periodStart = parseDmy(a ?? '')
      periodEnd = parseDmy(b ?? '')
    }
  }
  if (!periodStart || !periodEnd || periodEnd < periodStart) {
    throw new ParseError(
      'Periode laporan iklan tidak terbaca (baris "Periode" di bagian atas file). Pastikan file tidak diubah.',
    )
  }

  const out: AdRow[] = []
  const invalid: string[] = []
  let currentGroup = ''
  for (const r of rows.slice(headerIdx + 1)) {
    const name = cleanText(r[idx.name])
    if (!name) continue
    const rawCode = cleanText(r[idx.code])
    const code = rawCode === ADS_CSV.noProductCode ? '' : rawCode
    const num = (i: number) => (i < 0 ? 0 : parseAdNumber(String(r[i] ?? '')))
    const values = {
      views: num(idx.views),
      clicks: num(idx.clicks),
      sold: num(idx.sold),
      gmv: num(idx.gmv),
      spend: num(idx.spend),
    }
    if (Object.values(values).some((v) => v === null)) {
      invalid.push(name.slice(0, 60))
      continue
    }
    const v = values as Record<keyof typeof values, number>

    let adName: string
    if (kind.source === 'keseluruhan') adName = name
    else if (kind.source === 'otomatis') adName = code ? ADS_CSV.autoAdName : name
    else {
      // Grup: baris tanpa kode = grup; baris produk sesudahnya milik grup itu.
      if (!code) currentGroup = name
      adName = code ? currentGroup : name
    }
    out.push({ ad_name: adName, product_code: code, product_name: code ? stripAdSuffix(name) : '', ...v })
  }

  // Total biaya tanpa dobel: file keseluruhan → semua baris (satu baris per iklan);
  // file rincian → baris total iklan/grup, atau jumlah baris produk kalau tidak ada.
  const totals = out.filter((r) => !r.product_code)
  const totalSpend =
    kind.source === 'keseluruhan' || totals.length === 0
      ? out.reduce((s, r) => s + r.spend, 0)
      : totals.reduce((s, r) => s + r.spend, 0)

  const warnings: ParseWarning[] = []
  if (invalid.length > 0) {
    warnings.push({
      code: 'invalid_rows',
      message: `${invalid.length} baris angkanya tidak terbaca dan dilewati.`,
      examples: invalid.slice(0, 5),
    })
  }

  return {
    source: kind.source,
    sourceLabel: kind.label,
    shopName,
    periodStart,
    periodEnd,
    rows: out,
    totalSpend,
    productCount: new Set(out.filter((r) => r.product_code && r.spend > 0).map((r) => r.product_code)).size,
    warnings,
  }
}
