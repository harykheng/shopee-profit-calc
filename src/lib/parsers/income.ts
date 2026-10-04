import { INCOME_COLUMNS, INCOME_PDF, type IncomeColumn } from '../shopeeColumns'
import { ParseError, parseRupiah, type ParseWarning } from './common'

/** Satu baris per tanggal dana dilepas, siap dikirim ke RPC `upsert_income`. */
export type IncomeDayRow = { released_date: string } & Record<IncomeColumn, number>

/** Satu baris di "Rincian Biaya Penyesuaian" (mis. kompensasi barang hilang). */
export interface IncomeAdjustment {
  date: string
  description: string
  amount: number
}

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
  /** Biaya penyesuaian (terpisah dari tabel harian; tidak termasuk di totalIncome). */
  adjustments: IncomeAdjustment[]
  warnings: ParseWarning[]
}

const NOT_INCOME_REPORT =
  'File ini sepertinya bukan laporan penghasilan Shopee. ' +
  'Gunakan PDF "Catatan Transaksi Penghasilan" dari Seller Centre → Keuangan → Penghasilan Saya.'

const DATE_ROW = /^(\d{4})[/-](\d{2})[/-](\d{2})\s+(.+)$/

/** "1000 0 −100 Rp2,450" → [1000, 0, -100, 2450]; null kalau ada token bukan angka. */
function toNumbers(rest: string): number[] | null {
  const tokens = rest.trim().split(/\s+/)
  const values = tokens.map(parseRupiah)
  return values.some((v) => v === null) ? null : (values as number[])
}

const emptyRow = (date: string): IncomeDayRow => {
  const row = { released_date: date } as IncomeDayRow
  for (const c of INCOME_COLUMNS) row[c] = 0
  return row
}

/** Parse baris-baris teks dari PDF laporan penghasilan bulanan. */
export function parseIncomeLines(lines: string[]): IncomeParseResult {
  const text = lines.join('\n')
  const markerIndex = lines.findIndex((l) => l.includes(INCOME_PDF.marker))
  if (markerIndex < 0) throw new ParseError(NOT_INCOME_REPORT)
  const sectionStart = lines.findIndex((l) => l.includes(INCOME_PDF.dailySection))
  if (sectionStart < 0) {
    throw new ParseError(
      'Laporan penghasilan ini tidak berisi tabel "Rincian Dana Dilepaskan" per tanggal. ' +
        'Pastikan yang di-upload adalah laporan bulanan.',
    )
  }

  const warnings: ParseWarning[] = []

  // --- Rincian harian -------------------------------------------------------
  // Hanya baris antara tabel "Rincian Dana Dilepaskan" dan bagian biaya penyesuaian.
  const adjIndex = lines.findIndex((l) => l.includes(INCOME_PDF.adjustmentsSection))
  const sectionLines = lines.slice(sectionStart, adjIndex > sectionStart ? adjIndex : undefined)

  const rawRows: { date: string; values: number[] }[] = []
  for (const line of sectionLines) {
    const m = line.match(DATE_ROW)
    if (!m) continue
    const date = `${m[1]}-${m[2]}-${m[3]}`
    const values = toNumbers(m[4])
    if (!values || values.length < 2) {
      throw new ParseError(
        `Baris tanggal ${date} di laporan penghasilan tidak bisa dibaca. ` +
          'Format laporan Shopee mungkin berubah; hubungi pengelola aplikasi.',
      )
    }
    rawRows.push({ date, values })
  }
  if (rawRows.length === 0) {
    throw new ParseError('Laporan penghasilan ini tidak berisi dana yang dilepaskan.')
  }

  // Baris total di bawah tabel (diulang di tiap halaman).
  const totals =
    sectionLines
      .filter((l) => l.startsWith(INCOME_PDF.totalLabel))
      .map((l) => toNumbers(l.slice(INCOME_PDF.totalLabel.length)))
      .find((v): v is number[] => v !== null && v.length >= 2) ?? null

  // Jumlah kolom bisa berbeda antar bulan, tapi harus sama untuk semua baris di satu
  // laporan. Patokannya baris total; kalau tidak ada, jumlah kolom yang paling sering.
  const width = totals?.length ?? mostCommon(rawRows.map((r) => r.values.length))
  const odd = rawRows.find((r) => r.values.length !== width)
  if (odd) {
    throw new ParseError(
      `Baris tanggal ${odd.date} di laporan penghasilan tidak bisa dibaca (jumlah kolomnya berbeda dari baris lain). ` +
        'Format laporan Shopee mungkin berubah; hubungi pengelola aplikasi.',
    )
  }

  // --- Kolom biaya di tengah: kenali dari label ringkasan ----------------------
  const summaryLines = sliceSection(lines, INCOME_PDF.summarySection, INCOME_PDF.dailySection)
  const summaryAmount = (label: string): number | null => {
    for (const l of summaryLines) {
      if (!l.startsWith(label + ' ')) continue
      const v = toNumbers(l.slice(label.length))
      if (v && v.length === 1) return v[0]
    }
    return null
  }
  const present = INCOME_PDF.feeColumns
    .map((f) => ({ ...f, amount: summaryAmount(f.label) }))
    .filter((f) => f.amount !== null)
  const feeCount = width - 2
  let feeMap: IncomeColumn[] | null = null
  if (present.length === feeCount && (!totals || present.every((f, i) => f.amount === totals[i + 1]))) {
    feeMap = present.map((f) => f.column)
  } else if (feeCount > 0) {
    warnings.push({
      code: 'fee_columns_unknown',
      message:
        'Sebagian kolom biaya di laporan ini tidak dikenali, jadi rinciannya digabung. ' +
        'Total penghasilan tetap sesuai PDF.',
    })
  }

  const byDate = new Map<string, IncomeDayRow>()
  for (const { date, values } of rawRows) {
    const row = emptyRow(date)
    row.subtotal_pesanan = values[0]
    row.total_income = values[width - 1]
    values.slice(1, -1).forEach((v, i) => {
      const col = feeMap?.[i] ?? INCOME_PDF.fallbackFeeColumn
      row[col] += v
    })
    const existing = byDate.get(date)
    if (existing && INCOME_COLUMNS.some((c) => existing[c] !== row[c])) {
      throw new ParseError(`Tanggal ${date} muncul dua kali dengan angka berbeda di laporan penghasilan.`)
    }
    byDate.set(date, row)
  }
  const days = [...byDate.values()].sort((a, b) => a.released_date.localeCompare(b.released_date))
  const uniqueRows = [...new Map(rawRows.map((r) => [r.date, r])).values()]

  // Tiap baris: jumlah semua kolom sebelum total harus sama dengan total hari itu.
  const inconsistent = uniqueRows.filter(
    (r) => r.values.slice(0, -1).reduce((s, v) => s + v, 0) !== r.values[width - 1],
  )
  if (inconsistent.length > 0) {
    warnings.push({
      code: 'row_sum_mismatch',
      message:
        `${inconsistent.length} tanggal punya rincian biaya yang tidak pas dengan total penghasilannya. ` +
        'Total penghasilan tetap diambil dari PDF, tapi mohon cek manual.',
      examples: inconsistent.slice(0, 5).map((r) => r.date),
    })
  }

  // --- Baris total: harus sama dengan jumlah rincian harian -----------------
  const totalIncome = days.reduce((s, d) => s + d.total_income, 0)
  if (totals) {
    const mismatch = totals.some((t, i) => uniqueRows.reduce((s, r) => s + r.values[i], 0) !== t)
    if (mismatch) {
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

  // --- Biaya penyesuaian -------------------------------------------------------
  const adjustments: IncomeAdjustment[] = []
  if (adjIndex >= 0 && !(lines[adjIndex + 1] ?? '').startsWith(INCOME_PDF.noAdjustmentsText)) {
    for (const line of lines.slice(adjIndex + 1)) {
      const m = line.match(/^(\d{4})[/-](\d{2})[/-](\d{2})\s+(.+?)\s+(\S+)$/)
      const amount = m ? parseRupiah(m[5]) : null
      if (!m || amount === null) continue
      adjustments.push({ date: `${m[1]}-${m[2]}-${m[3]}`, description: m[4].trim(), amount })
    }
    // Penyesuaian yang terbaca ikut disimpan & dihitung; hanya peringatkan kalau tidak terbaca.
    if (adjustments.length === 0) {
      warnings.push({
        code: 'adjustments_unreadable',
        message:
          'Laporan ini berisi "Biaya Penyesuaian" yang tidak bisa dibaca otomatis, jadi belum ikut dihitung. ' +
          'Cek bagian itu di PDF.',
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
      hargaProduk: summaryAmount(INCOME_PDF.summaryLabels.hargaProduk),
      pengembalianDana: summaryAmount(INCOME_PDF.summaryLabels.pengembalianDana),
    },
    adjustments,
    warnings,
  }
}

/** Baris dari judul `start` sampai sebelum judul `end` (kalau tidak ada: kosong). */
function sliceSection(lines: string[], start: string, end: string): string[] {
  const a = lines.findIndex((l) => l.startsWith(start))
  if (a < 0) return []
  const b = lines.findIndex((l, i) => i > a && l.includes(end))
  return lines.slice(a + 1, b < 0 ? undefined : b)
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
