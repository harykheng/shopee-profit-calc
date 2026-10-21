// Parser export penghasilan "Sudah Dilepas" (.xlsx): Keuangan → Penghasilan Saya → Sudah Dilepas → Export.
// Hasilnya sama bentuknya dengan PDF bulanan (uang cair per tanggal + biaya penyesuaian), ditambah
// rincian per pesanan & produk. Data pembeli (username, metode bayar) tidak dibaca.
import * as XLSX from 'xlsx'
import { INCOME_COLUMNS, INCOME_XLSX } from '../shopeeColumns'
import { ParseError, cleanText, normalizeHeader, parseRupiah, parseShopeeDateTime, type ParseWarning } from './common'
import type { IncomeAdjustment, IncomeDayRow, IncomeOrderLine, IncomeParseResult } from './income'
import { isIncomeWorkbook, sheetToRows } from './orders'

const NOT_INCOME_XLSX =
  'File Excel ini sepertinya bukan export penghasilan "Sudah Dilepas". ' +
  'Ambil dari Seller Centre → Keuangan → Penghasilan Saya → Sudah Dilepas → Export, ' +
  'atau upload PDF laporan bulanan.'

const FORMAT_CHANGED = 'Format file Shopee mungkin berubah; hubungi pengelola aplikasi.'

export function parseIncomeXlsxFile(data: ArrayBuffer | Uint8Array): IncomeParseResult {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(data, { type: 'array', dense: false })
  } catch {
    throw new ParseError('File tidak bisa dibaca. Pastikan file berformat Excel (.xlsx) dari Shopee.')
  }
  return parseIncomeXlsxWorkbook(workbook)
}

export function parseIncomeXlsxWorkbook(workbook: XLSX.WorkBook): IncomeParseResult {
  if (!isIncomeWorkbook(workbook)) {
    const looksLikeOrders = workbook.SheetNames.some((n) =>
      sheetToRows(workbook.Sheets[n]).slice(0, 5).some((r) => r.some((c) => normalizeHeader(c) === 'status pesanan')),
    )
    throw new ParseError(
      looksLikeOrders
        ? 'Ini file export pesanan, bukan laporan penghasilan. Upload file ini di kotak "1. Export pesanan".'
        : NOT_INCOME_XLSX,
    )
  }
  const warnings: ParseWarning[] = []
  const summary = readSummary(sheetToRows(workbook.Sheets[INCOME_XLSX.sheets.summary]))
  const { orderRows, lines } = readOrders(sheetToRows(workbook.Sheets[INCOME_XLSX.sheets.orders]), warnings)
  const adjSheet = workbook.Sheets[INCOME_XLSX.sheets.adjustments]
  const adj = adjSheet ? readAdjustments(sheetToRows(adjSheet)) : { items: [], total: null }

  if (orderRows.length === 0) throw new ParseError('File penghasilan ini tidak berisi dana yang dilepaskan.')

  // --- Uang cair per tanggal (dari baris Order) ----------------------------------
  const byDate = new Map<string, IncomeDayRow>()
  for (const o of orderRows) {
    let day = byDate.get(o.released_date)
    if (!day) {
      day = { released_date: o.released_date } as IncomeDayRow
      for (const c of INCOME_COLUMNS) day[c] = 0
      byDate.set(o.released_date, day)
    }
    day.subtotal_pesanan += o.harga_produk + o.pengembalian_dana
    day.subtotal_ongkir += o.subtotal_ongkir
    day.voucher_subsidi += o.voucher_subsidi
    day.biaya_platform += o.biaya_admin + o.biaya_proses
    day.biaya_gratis_ongkir += o.biaya_gratis_ongkir
    day.biaya_layanan_tambahan += o.biaya_lain
    day.total_income += o.total_income
  }
  const days = [...byDate.values()].sort((a, b) => a.released_date.localeCompare(b.released_date))
  const totalIncome = days.reduce((s, d) => s + d.total_income, 0)

  // --- Cek total dengan ringkasan --------------------------------------------------
  if (summary.total === null) {
    warnings.push({
      code: 'total_not_found',
      message: `Baris "${INCOME_XLSX.summary.totalLabel}" tidak ditemukan, jadi total tidak bisa dicek ulang.`,
    })
  } else if (summary.total !== totalIncome) {
    throw new ParseError(
      `Total di file (${summary.total}) tidak sama dengan jumlah penghasilan per pesanan (${totalIncome}). ` +
        'File mungkin terpotong; download ulang dari Shopee.',
    )
  }
  const adjustmentsTotal = adj.items.reduce((s, a) => s + a.amount, 0)
  if (adj.total !== null && adj.total !== adjustmentsTotal) {
    throw new ParseError(
      `Total biaya penyesuaian di file (${adj.total}) tidak sama dengan jumlah rinciannya (${adjustmentsTotal}). ` +
        FORMAT_CHANGED,
    )
  }

  // --- Periode ---------------------------------------------------------------------
  const { periodStart, periodEnd } = summary
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

  const hargaProduk = orderRows.reduce((s, o) => s + o.harga_produk, 0)
  const pengembalianDana = orderRows.reduce((s, o) => s + o.pengembalian_dana, 0)
  return {
    source: 'xlsx',
    shopName: summary.shopName,
    periodStart,
    periodEnd,
    days,
    totalIncome,
    summary: { hargaProduk, pengembalianDana },
    adjustments: adj.items,
    adjustmentsComplete: true,
    orders: lines,
    warnings,
  }
}

// ---------------------------------------------------------------------------

/** Tanggal "2026-07-31" / nomor seri Excel → "2026-07-31"; kosong → null; tidak terbaca → undefined. */
function toDay(value: unknown): string | null | undefined {
  const iso = parseShopeeDateTime(value)
  return iso ? iso.slice(0, 10) : iso
}

function readSummary(rows: unknown[][]) {
  const S = INCOME_XLSX.summary
  const valueAfter = (row: unknown[], from: number) => row.slice(from).find((c) => cleanText(c) !== '')
  let shopName: string | null = null
  let periodStart: string | null = null
  let periodEnd: string | null = null
  let total: number | null = null
  for (const row of rows) {
    const label = cleanText(row[0])
    if (label === S.shopLabel) shopName = cleanText(valueAfter(row, 1)) || null
    else if (label === S.fromLabel) {
      periodStart = toDay(valueAfter(row, 1)) ?? null
      // Kadang "Dari … ke …" ada di satu baris.
      const toAt = row.findIndex((c) => cleanText(c) === S.toLabel)
      if (toAt > 0) periodEnd = toDay(valueAfter(row, toAt + 1)) ?? null
    } else if (label === S.toLabel) periodEnd = toDay(valueAfter(row, 1)) ?? null
    else if (label === S.totalLabel) {
      const v = [...row.slice(1)].reverse().find((c) => cleanText(c) !== '')
      total = v === undefined ? null : parseRupiah(v)
    }
  }
  return { shopName, periodStart, periodEnd, total }
}

type OrderAmounts = Omit<IncomeOrderLine, 'line_no'>

function readOrders(rows: unknown[][], warnings: ParseWarning[]) {
  const C = INCOME_XLSX.columns
  const headerIndex = rows
    .slice(0, 10)
    .findIndex((r) => r.some((c) => normalizeHeader(c) === normalizeHeader(C.orderNo)) &&
      r.some((c) => normalizeHeader(c) === normalizeHeader(C.total)))
  if (headerIndex < 0) throw new ParseError(NOT_INCOME_XLSX)
  const header = rows[headerIndex].map(normalizeHeader)
  const col = (name: string) => header.indexOf(normalizeHeader(name))
  const required = [C.orderNo, C.releasedAt, C.total, C.hargaProduk]
  const missing = required.filter((n) => col(n) < 0)
  if (missing.length > 0) {
    throw new ParseError(`Kolom tidak ditemukan di file penghasilan: ${missing.join(', ')}. ${FORMAT_CHANGED}`)
  }
  const G = INCOME_XLSX.groups
  const groupCols = (names: readonly string[]) => names.map(col).filter((i) => i >= 0)
  const ongkirCols = groupCols(G.ongkir)
  const voucherCols = groupCols(G.voucher)
  const lainCols = groupCols(G.lain)
  const xtraCols = header
    .map((h, i) => (h.startsWith(normalizeHeader(INCOME_XLSX.xtraPrefix)) ? i : -1))
    .filter((i) => i >= 0)
  const kindCol = col(INCOME_XLSX.rowKind)

  const orderRows: OrderAmounts[] = []
  const skuByOrder = new Map<string, OrderAmounts[]>()
  let unknownCost = 0
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r]
    const orderNo = cleanText(row[col(C.orderNo)])
    if (!orderNo) continue
    // Tanpa kolom jenis baris (format lama): setiap baris adalah satu pesanan.
    const kind = kindCol < 0 ? INCOME_XLSX.orderKind : cleanText(row[kindCol])
    if (kind !== INCOME_XLSX.orderKind && kind !== INCOME_XLSX.skuKind) continue

    const num = (i: number) => {
      if (i < 0) return 0
      const v = parseRupiah(row[i])
      if (v === null) {
        throw new ParseError(`Angka di pesanan ${orderNo} (kolom "${rows[headerIndex][i]}") tidak bisa dibaca. ${FORMAT_CHANGED}`)
      }
      return v
    }
    const sum = (cols: number[]) => cols.reduce((s, i) => s + num(i), 0)
    const released = toDay(row[col(C.releasedAt)])
    if (!released) throw new ParseError(`Tanggal dana dilepas pesanan ${orderNo} tidak bisa dibaca. ${FORMAT_CHANGED}`)
    const productId = cleanText(row[col(C.productId)])
    const productName = cleanText(row[col(C.productName)])
    const known = {
      harga_produk: num(col(C.hargaProduk)),
      pengembalian_dana: num(col(C.pengembalianDana)),
      subtotal_ongkir: sum(ongkirCols),
      voucher_subsidi: sum(voucherCols),
      biaya_admin: num(col(C.biayaAdmin)),
      biaya_proses: num(col(C.biayaProses)),
      biaya_gratis_ongkir: sum(xtraCols),
    }
    const total = num(col(C.total))
    // Biaya lain = sisa sampai total, supaya kolom baru yang belum dikenal tetap terhitung.
    const lain = total - Object.values(known).reduce((s, v) => s + v, 0)
    if (kind === INCOME_XLSX.orderKind) unknownCost += lain - sum(lainCols)
    const line: OrderAmounts = {
      order_no: orderNo,
      return_no: cleanText(row[col(C.returnNo)]).replace(/^-$/, ''),
      product_id: productId === '-' ? '' : productId,
      product_name: productName === '-' ? '' : productName,
      created_date: toDay(row[col(C.createdAt)]) ?? null,
      released_date: released,
      ...known,
      biaya_lain: lain,
      total_income: total,
    }
    if (kind === INCOME_XLSX.orderKind) orderRows.push(line)
    else skuByOrder.set(orderNo, [...(skuByOrder.get(orderNo) ?? []), line])
  }

  if (unknownCost !== 0) {
    warnings.push({
      code: 'fee_columns_unknown',
      message:
        'Ada kolom biaya di file ini yang belum dikenali, jadi dimasukkan ke biaya lain-lain. ' +
        'Total penghasilan tetap sesuai file.',
    })
  }

  // Duplikat nomor pesanan di baris Order: file aneh, jangan ditebak.
  const seen = new Set<string>()
  for (const o of orderRows) {
    if (seen.has(o.order_no)) throw new ParseError(`Pesanan ${o.order_no} muncul dua kali di file penghasilan. ${FORMAT_CHANGED}`)
    seen.add(o.order_no)
  }

  // Rincian per produk: pakai baris Sku kalau jumlahnya pas dengan baris Order-nya; kalau tidak,
  // simpan baris Order sebagai satu baris (total tetap benar, rincian produk hilang).
  const lines: IncomeOrderLine[] = []
  const mismatched: string[] = []
  for (const o of orderRows) {
    const skus = skuByOrder.get(o.order_no) ?? []
    const fits =
      skus.length > 0 &&
      skus.every((s) => s.released_date === o.released_date) &&
      (Object.keys(o) as (keyof OrderAmounts)[]).every(
        (k) => typeof o[k] !== 'number' || skus.reduce((s, x) => s + (x[k] as number), 0) === o[k],
      )
    if (fits) skus.forEach((s, i) => lines.push({ ...s, return_no: s.return_no || o.return_no, line_no: i + 1 }))
    else {
      if (kindCol >= 0) mismatched.push(o.order_no)
      lines.push({ ...o, line_no: 1 })
    }
  }
  if (mismatched.length > 0) {
    warnings.push({
      code: 'sku_rows_mismatch',
      message:
        `${mismatched.length} pesanan tidak punya rincian per produk yang pas dengan totalnya, ` +
        'jadi disimpan sebagai satu baris per pesanan. Total penghasilan tetap sesuai file.',
      examples: mismatched.slice(0, 5),
    })
  }
  return { orderRows, lines }
}

function readAdjustments(rows: unknown[][]): { items: IncomeAdjustment[]; total: number | null } {
  const A = INCOME_XLSX.adjustments
  let total: number | null = null
  for (const row of rows) {
    if (cleanText(row[0]) === A.totalLabel) {
      const v = row.slice(1).find((c) => cleanText(c) !== '')
      total = v === undefined ? null : parseRupiah(v)
    }
  }
  const headerIndex = rows.findIndex((r) => r.some((c) => normalizeHeader(c) === normalizeHeader(A.amount)) &&
    r.some((c) => normalizeHeader(c) === normalizeHeader(A.type)))
  if (headerIndex < 0) {
    if (total) throw new ParseError(`Rincian biaya penyesuaian tidak bisa dibaca. ${FORMAT_CHANGED}`)
    return { items: [], total }
  }
  const header = rows[headerIndex].map(normalizeHeader)
  const col = (name: string) => header.indexOf(normalizeHeader(name))
  const items: IncomeAdjustment[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const type = cleanText(row[col(A.type)])
    const rawAmount = row[col(A.amount)]
    // Baris kosong atau baris "Total Biaya" menandai akhir tabel.
    if (!type || cleanText(rawAmount) === '') {
      if (row.some((c) => cleanText(c) !== '')) break
      continue
    }
    const amount = parseRupiah(rawAmount)
    // Pakai tanggal dana dilepas (sama dengan uang cair lainnya); kalau kosong, tanggal penyesuaian dibuat.
    const date = toDay(row[col(A.releasedAt)]) || toDay(row[col(A.createdAt)])
    if (amount === null || !date) throw new ParseError(`Baris biaya penyesuaian "${type}" tidak bisa dibaca. ${FORMAT_CHANGED}`)
    const reason = col(A.reason) >= 0 ? cleanText(row[col(A.reason)]) : ''
    const orderNo = cleanText(row[col(A.orderNo)])
    items.push({
      date,
      description: reason && reason !== '-' ? `${type} · ${reason}` : type,
      amount,
      ...(orderNo && orderNo !== '-' ? { orderNo } : {}),
    })
  }
  return { items, total }
}
