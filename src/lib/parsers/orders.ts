import * as XLSX from 'xlsx'
import {
  COMPLETED_STATUSES,
  HEADER_SEARCH_ROWS,
  ORDER_COLUMNS,
  REQUIRED_ORDER_COLUMNS,
  SKU_KEY_SEPARATOR,
  type OrderColumnKey,
} from '../shopeeColumns'
import {
  ParseError,
  cleanText,
  normalizeHeader,
  parseQty,
  parseRupiah,
  parseShopeeDateTime,
  type ParseWarning,
} from './common'

export type SkuSource = 'sku' | 'sku_induk' | 'nama'

/** Satu item pesanan, siap dikirim ke RPC `upsert_order_items`. Tanpa data pembeli. */
export interface OrderItemRow {
  order_no: string
  sku: string
  sku_source: SkuSource
  product_name: string
  variant_name: string
  qty: number
  returned_qty: number
  status: string
  return_status: string
  /** ISO 8601 WIB, mis. "2026-08-03T14:22:00+07:00". */
  completed_at: string
  subtotal: number
}

export interface SkippedRows {
  /** Jumlah baris yang dilewati per status (mis. { "Batal": 3 }). */
  byStatus: Record<string, number>
  /** Baris berstatus selesai tapi tanpa waktu selesai / data rusak. */
  invalid: number
}

export interface OrdersParseResult {
  items: OrderItemRow[]
  /** Jumlah baris data di file (tanpa header). */
  totalRows: number
  /** Jumlah pesanan unik di `items`. */
  orderCount: number
  skipped: SkippedRows
  warnings: ParseWarning[]
}

const NOT_ORDER_EXPORT =
  'File ini sepertinya bukan export pesanan Shopee. ' +
  'Pastikan file diambil dari Seller Centre → Pesanan Saya → Export.'

/** Baca file .xlsx export pesanan Shopee. Melempar ParseError dengan pesan ramah. */
export function parseOrdersFile(data: ArrayBuffer | Uint8Array): OrdersParseResult {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(data, { type: 'array', dense: false })
  } catch {
    throw new ParseError(
      'File tidak bisa dibaca. Pastikan file berformat Excel (.xlsx) hasil export pesanan Shopee.',
    )
  }
  return parseOrdersWorkbook(workbook)
}

export function parseOrdersWorkbook(workbook: XLSX.WorkBook): OrdersParseResult {
  // Cari sheet pertama yang punya header export pesanan.
  let lastMissing: string[] = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = sheetToRows(sheet)
    const found = findHeader(rows)
    if (found.missing.length === 0) return parseRows(rows, found.headerIndex, found.columns)
    if (lastMissing.length === 0 || found.missing.length < lastMissing.length) lastMissing = found.missing
  }
  const detail =
    lastMissing.length > 0 && lastMissing.length < REQUIRED_ORDER_COLUMNS.length
      ? ` Kolom yang tidak ditemukan: ${lastMissing.join(', ')}.`
      : ''
  throw new ParseError(NOT_ORDER_EXPORT + detail)
}

function sheetToRows(sheet: XLSX.WorkSheet): unknown[][] {
  // Metadata ukuran sheet dari Shopee kadang salah (mis. hanya "A1"),
  // jadi hitung ulang dari sel yang benar-benar ada.
  const range = { s: { r: Infinity, c: Infinity }, e: { r: -1, c: -1 } }
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue
    const { r, c } = XLSX.utils.decode_cell(key)
    range.s.r = Math.min(range.s.r, r)
    range.s.c = Math.min(range.s.c, c)
    range.e.r = Math.max(range.e.r, r)
    range.e.c = Math.max(range.e.c, c)
  }
  if (range.e.r < 0) return []
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: range.e })
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: true })
}

type ColumnIndex = Partial<Record<OrderColumnKey, number>>

function findHeader(rows: unknown[][]): {
  headerIndex: number
  columns: ColumnIndex
  missing: string[]
} {
  let best = { headerIndex: -1, columns: {} as ColumnIndex, missing: [] as string[], score: -1 }
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS)
  for (let i = 0; i < limit; i++) {
    const normalized = (rows[i] ?? []).map(normalizeHeader)
    const columns: ColumnIndex = {}
    for (const key of Object.keys(ORDER_COLUMNS) as OrderColumnKey[]) {
      const aliases = ORDER_COLUMNS[key].map(normalizeHeader)
      const idx = normalized.findIndex((h) => aliases.includes(h))
      if (idx >= 0) columns[key] = idx
    }
    const missing = REQUIRED_ORDER_COLUMNS.filter((k) => columns[k] === undefined)
    const score = REQUIRED_ORDER_COLUMNS.length - missing.length
    if (score > best.score) {
      best = {
        headerIndex: i,
        columns,
        missing: missing.map((k) => ORDER_COLUMNS[k][0]),
        score,
      }
    }
    if (missing.length === 0) break
  }
  if (best.headerIndex < 0) {
    return { headerIndex: -1, columns: {}, missing: REQUIRED_ORDER_COLUMNS.map((k) => ORDER_COLUMNS[k][0]) }
  }
  return best
}

function buildSkuKey(skuRef: string, skuInduk: string, product: string, variant: string) {
  if (skuRef) return { sku: skuRef, source: 'sku' as const }
  if (skuInduk) {
    return { sku: variant ? skuInduk + SKU_KEY_SEPARATOR + variant : skuInduk, source: 'sku_induk' as const }
  }
  return { sku: variant ? product + SKU_KEY_SEPARATOR + variant : product, source: 'nama' as const }
}

function parseRows(rows: unknown[][], headerIndex: number, columns: ColumnIndex): OrdersParseResult {
  // Hanya kolom yang dipetakan yang dibaca; kolom data pribadi pembeli tidak pernah disentuh.
  const cell = (row: unknown[], key: OrderColumnKey): unknown => {
    const idx = columns[key]
    return idx === undefined ? '' : row[idx]
  }
  const completed = new Set(COMPLETED_STATUSES.map((s) => s.toLowerCase()))

  const skipped: SkippedRows = { byStatus: {}, invalid: 0 }
  const invalidExamples: string[] = []
  const merged = new Map<string, OrderItemRow>()
  let duplicateRows = 0
  let totalRows = 0

  for (const row of rows.slice(headerIndex + 1)) {
    const orderNo = cleanText(cell(row, 'orderNo'))
    if (!orderNo) continue // baris kosong / penutup
    totalRows++

    const status = cleanText(cell(row, 'status'))
    if (!completed.has(status.toLowerCase())) {
      const label = status || '(status kosong)'
      skipped.byStatus[label] = (skipped.byStatus[label] ?? 0) + 1
      continue
    }

    const productName = cleanText(cell(row, 'productName'))
    const variantName = cleanText(cell(row, 'variantName'))
    const qty = parseQty(cell(row, 'qty'))
    const returnedQty = parseQty(cell(row, 'returnedQty'))
    const subtotal = parseRupiah(cell(row, 'subtotal'))
    const completedAt = parseShopeeDateTime(cell(row, 'completedAt'))

    if (!productName || qty === null || returnedQty === null || subtotal === null || !completedAt) {
      skipped.invalid++
      if (invalidExamples.length < 5) invalidExamples.push(orderNo)
      continue
    }

    const { sku, source } = buildSkuKey(
      cleanText(cell(row, 'skuRef')),
      cleanText(cell(row, 'skuInduk')),
      productName,
      variantName,
    )
    const item: OrderItemRow = {
      order_no: orderNo,
      sku,
      sku_source: source,
      product_name: productName,
      variant_name: variantName,
      qty,
      returned_qty: Math.min(returnedQty, qty),
      status,
      return_status: cleanText(cell(row, 'returnStatus')),
      completed_at: completedAt,
      subtotal,
    }

    const key = `${orderNo}\u0000${sku}`
    const existing = merged.get(key)
    if (existing) {
      duplicateRows++
      existing.qty += item.qty
      existing.returned_qty += item.returned_qty
      existing.subtotal += item.subtotal
      if (!existing.return_status) existing.return_status = item.return_status
    } else {
      merged.set(key, item)
    }
  }

  if (totalRows === 0) {
    throw new ParseError('File export pesanan ini tidak berisi data pesanan.')
  }

  const items = [...merged.values()]
  return {
    items,
    totalRows,
    orderCount: new Set(items.map((i) => i.order_no)).size,
    skipped,
    warnings: buildWarnings(items, duplicateRows, skipped.invalid, invalidExamples),
  }
}

function uniqueSkus(items: OrderItemRow[], source: SkuSource) {
  return [...new Set(items.filter((i) => i.sku_source === source).map((i) => i.sku))]
}

function buildWarnings(
  items: OrderItemRow[],
  duplicateRows: number,
  invalidRows: number,
  invalidExamples: string[],
): ParseWarning[] {
  const warnings: ParseWarning[] = []

  const byName = uniqueSkus(items, 'nama')
  if (byName.length > 0) {
    warnings.push({
      code: 'sku_from_name',
      message:
        `${byName.length} produk tidak punya SKU sama sekali, jadi dikenali dari nama produk + variasi. ` +
        'Kalau nama produk diubah di Shopee, produk ini akan terbaca sebagai produk baru. ' +
        'Sebaiknya isi SKU variasi di Seller Centre.',
      examples: byName.slice(0, 5),
    })
  }

  const byInduk = uniqueSkus(items, 'sku_induk')
  if (byInduk.length > 0) {
    warnings.push({
      code: 'sku_from_parent',
      message:
        `${byInduk.length} produk tidak punya SKU variasi, jadi dikenali dari SKU Induk + nama variasi.`,
      examples: byInduk.slice(0, 5),
    })
  }

  const returned = items.filter((i) => i.returned_qty > 0)
  if (returned.length > 0) {
    warnings.push({
      code: 'returned_items',
      message:
        `${returned.length} item punya barang retur. Qty retur tidak dihitung sebagai modal.`,
      examples: returned.slice(0, 5).map((i) => `${i.order_no} (${i.sku})`),
    })
  }

  if (duplicateRows > 0) {
    warnings.push({
      code: 'merged_duplicates',
      message: `${duplicateRows} baris dengan no. pesanan dan produk yang sama digabung (qty dijumlahkan).`,
    })
  }

  if (invalidRows > 0) {
    warnings.push({
      code: 'invalid_rows',
      message:
        `${invalidRows} baris pesanan selesai dilewati karena datanya tidak lengkap ` +
        '(waktu selesai, nama produk, qty, atau subtotal kosong/tidak terbaca).',
      examples: invalidExamples,
    })
  }

  return warnings
}
