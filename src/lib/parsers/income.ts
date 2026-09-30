import { INCOME_PDF, type IncomeColumn } from '../shopeeColumns'
import { ParseError, parseRupiah, type ParseWarning } from './common'

/** Satu baris per tanggal dana dilepas, siap dikirim ke RPC `upsert_income`. */
export type IncomeDayRow = { released_date: string } & Record<IncomeColumn, number>

export interface IncomeParseResult {
  /** Nama toko di kop laporan (untuk dicocokkan dengan toko yang dipilih). */
  shopName: string | null
  periodStart: string | null
  periodEnd: string | null
  days: IncomeDayRow[]
  /** Jumlah total_income semua hari. */
  totalIncome: number
  summary: {
    hargaProduk: number | null
    pengembalianDana: number | null
  }
  warnings: ParseWarning[]
}

const NOT_INCOME_REPORT =
  'File ini sepertinya bukan laporan penghasilan Shopee. ' +
  'Gunakan PDF "Catatan Transaksi Penghasilan" dari Seller Centre → Keuangan → Penghasilan Saya.'

const DATE_ROW = /^(\d{4})[/-](\d{2})[/-](\d{2})\s+(.+)$/

/** Parse baris-baris teks dari PDF laporan penghasilan bulanan. */
export function parseIncomeLines(lines: string[]): IncomeParseResult {
  const text = lines.join('\n')
  const markerIndex = lines.findIndex((l) => l.includes(INCOME_PDF.marker))
  if (markerIndex < 0) throw new ParseError(NOT_INCOME_REPORT)
  if (!lines.some((l) => l.includes(INCOME_PDF.dailySection))) {
    throw new ParseError(
      'Laporan penghasilan ini tidak berisi tabel "Rincian Dana Dilepaskan" per tanggal. ' +
        'Pastikan yang di-upload adalah laporan bulanan.',
    )
  }

  const warnings: ParseWarning[] = []
  const columns = INCOME_PDF.dailyColumns
  const width = columns.length

  const toNumbers = (rest: string): number[] | null => {
    const tokens = rest.trim().split(/\s+/)
    if (tokens.length !== width) return null
    const values = tokens.map(parseRupiah)
    return values.some((v) => v === null) ? null : (values as number[])
  }

  // --- Rincian harian -------------------------------------------------------
  // Hanya baris antara tabel "Rincian Dana Dilepaskan" dan bagian biaya penyesuaian.
  const sectionStart = lines.findIndex((l) => l.includes(INCOME_PDF.dailySection))
  const adjIndex = lines.findIndex((l) => l.includes(INCOME_PDF.adjustmentsSection))
  const sectionLines = lines.slice(sectionStart, adjIndex > sectionStart ? adjIndex : undefined)

  const byDate = new Map<string, IncomeDayRow>()
  for (const line of sectionLines) {
    const m = line.match(DATE_ROW)
    if (!m) continue
    const values = toNumbers(m[4])
    if (!values) {
      throw new ParseError(
        `Baris tanggal ${m[1]}-${m[2]}-${m[3]} di laporan penghasilan tidak bisa dibaca. ` +
          'Format laporan Shopee mungkin berubah; hubungi pengelola aplikasi.',
      )
    }
    const date = `${m[1]}-${m[2]}-${m[3]}`
    const row = { released_date: date } as IncomeDayRow
    columns.forEach((col, i) => (row[col] = values[i]))

    const existing = byDate.get(date)
    if (existing && columns.some((c) => existing[c] !== row[c])) {
      throw new ParseError(`Tanggal ${date} muncul dua kali dengan angka berbeda di laporan penghasilan.`)
    }
    byDate.set(date, row)
  }
  const days = [...byDate.values()].sort((a, b) => a.released_date.localeCompare(b.released_date))
  if (days.length === 0) {
    throw new ParseError('Laporan penghasilan ini tidak berisi dana yang dilepaskan.')
  }

  // Tiap baris: jumlah komponen harus sama dengan total penghasilan hari itu.
  const components = columns.slice(0, -1)
  const inconsistent = days.filter(
    (d) => components.reduce((s, c) => s + d[c], 0) !== d.total_income,
  )
  if (inconsistent.length > 0) {
    warnings.push({
      code: 'row_sum_mismatch',
      message:
        `${inconsistent.length} tanggal punya rincian biaya yang tidak pas dengan total penghasilannya. ` +
        'Total penghasilan tetap diambil dari PDF, tapi mohon cek manual.',
      examples: inconsistent.slice(0, 5).map((d) => d.released_date),
    })
  }

  // --- Baris total: harus sama dengan jumlah rincian harian -----------------
  const totalLine = sectionLines.find(
    (l) => l.startsWith(INCOME_PDF.totalLabel) && toNumbers(l.slice(INCOME_PDF.totalLabel.length)),
  )
  const totalIncome = days.reduce((s, d) => s + d.total_income, 0)
  if (totalLine) {
    const totals = toNumbers(totalLine.slice(INCOME_PDF.totalLabel.length))!
    const mismatch = columns.filter((c, i) => days.reduce((s, d) => s + d[c], 0) !== totals[i])
    if (mismatch.length > 0) {
      throw new ParseError(
        'Total di laporan penghasilan tidak sama dengan jumlah rincian per tanggal. ' +
          'File mungkin terpotong atau formatnya berubah.',
      )
    }
  } else {
    warnings.push({
      code: 'total_not_found',
      message: 'Baris "Total Penghasilan" tidak ditemukan, jadi total tidak bisa dicek ulang.',
    })
  }

  // --- Periode & kop ---------------------------------------------------------
  const period = text.match(
    new RegExp(
      `${escapeRegExp(INCOME_PDF.periodLabel)}\\s*(\\d{4}-\\d{2}-\\d{2})\\s*sampai[\\s\\S]{0,400}?(\\d{4}-\\d{2}-\\d{2})`,
    ),
  )
  const periodStart = period?.[1] ?? null
  const periodEnd = period?.[2] ?? null
  if (periodStart && periodEnd) {
    const outside = days.filter((d) => d.released_date < periodStart || d.released_date > periodEnd)
    if (outside.length > 0) {
      warnings.push({
        code: 'outside_period',
        message: `${outside.length} tanggal berada di luar periode laporan (${periodStart} s/d ${periodEnd}).`,
        examples: outside.slice(0, 5).map((d) => d.released_date),
      })
    }
  }

  const headerLine = lines[markerIndex + 1] ?? ''
  const shopName = headerLine.replace(/\s+\d{6,}\s*$/, '').trim() || null

  // --- Ringkasan & biaya penyesuaian -----------------------------------------
  const summaryValue = (label: string): number | null => {
    const line = lines.find((l) => l.startsWith(label + ' '))
    return line ? parseRupiah(line.slice(label.length)) : null
  }

  if (adjIndex >= 0) {
    const next = lines[adjIndex + 1] ?? ''
    if (!next.startsWith(INCOME_PDF.noAdjustmentsText)) {
      warnings.push({
        code: 'adjustments_present',
        message:
          'Laporan ini berisi "Biaya Penyesuaian" yang tidak dihitung otomatis. ' +
          'Cek bagian itu di PDF dan masukkan manual di halaman Biaya (kategori Lain-lain) bila perlu.',
      })
    }
  }

  return {
    shopName,
    periodStart,
    periodEnd,
    days,
    totalIncome,
    summary: {
      hargaProduk: summaryValue(INCOME_PDF.summaryLabels.hargaProduk),
      pengembalianDana: summaryValue(INCOME_PDF.summaryLabels.pengembalianDana),
    },
    warnings,
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
