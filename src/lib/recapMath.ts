// Hitungan untuk halaman Rekap yang tidak dilakukan di database.
import { formatPercent, formatRupiahShort, wibDay } from './format'

// --- "Kenapa barang terjual beda dengan barang dipesan?" ---------------------

export interface FlowNumbers {
  /** Semua barang yang dipesan (dibuat) di periode ini, semua status. */
  ordered: number
  cancelled: number
  inProcess: number
  /** Barang retur dari pesanan selesai yang dibuat di periode ini. */
  returned: number
  /** Pesanan dibuat di periode ini, tapi baru selesai setelahnya (qty bersih). */
  completedLater: number
  /** Pesanan dibuat sebelum periode ini, selesai di periode ini (qty bersih). */
  fromEarlier: number
  /** Barang terjual menurut rekap profit (selesai di periode ini, tanpa retur). */
  sold: number
}

export interface FlowStep {
  label: string
  value: number
  kind: 'start' | 'minus' | 'plus' | 'result'
}

export function soldFlow(n: FlowNumbers): FlowStep[] {
  const steps: FlowStep[] = [{ label: 'Barang dipesan di periode ini', value: n.ordered, kind: 'start' }]
  const add = (label: string, value: number, kind: 'minus' | 'plus') => {
    if (value !== 0) steps.push({ label, value, kind })
  }
  add('batal / belum bayar', n.cancelled, 'minus')
  add('masih diproses / dikirim', n.inProcess, 'minus')
  add('diretur pembeli', n.returned, 'minus')
  add('baru sampai setelah periode ini (masuk untung bulan berikutnya)', n.completedLater, 'minus')
  add('pesanan sebelum periode ini yang sampai di periode ini', n.fromEarlier, 'plus')
  const computed =
    n.ordered - n.cancelled - n.inProcess - n.returned - n.completedLater + n.fromEarlier
  const other = n.sold - computed
  // Sisa yang tidak bisa dijelaskan: biasanya data lama yang belum punya tanggal pesanan dibuat.
  if (other > 0) steps.push({ label: 'pesanan lain (data lama tanpa tanggal pesanan)', value: other, kind: 'plus' })
  if (other < 0) steps.push({ label: 'pesanan lain (data lama tanpa tanggal pesanan)', value: -other, kind: 'minus' })
  steps.push({ label: 'Terjual & uangnya cair di periode ini', value: n.sold, kind: 'result' })
  return steps
}

// --- Perkiraan untung dari pesanan yang dibuat di periode ini ----------------

export interface EstimateItem {
  subtotal: number
  qty: number
  returned_qty: number
  completed_at: string | null
  /** HPP per unit (terkunci kalau ada, kalau belum pakai HPP saat ini). null = belum diisi. */
  hpp: number | null
  /**
   * Uang masuk ASLI untuk item ini (dari Excel "Sudah Dilepas", sudah tanpa bagian yang diretur).
   * Tidak diisi / null = belum ada, pakai perkiraan dari uang cair per hari.
   */
  income?: number | null
}

export interface DayIncome {
  day: string
  total_income: number
  subtotal_pesanan: number
}

export interface ProfitEstimate {
  sales: number
  income: number
  fees: number
  modal: number
  profit: number
  /** Jumlah item yang HPP-nya kosong (modalnya belum terhitung). */
  missingHpp: number
  /** Item yang tanggal cairnya belum ada di laporan → pakai rata-rata potongan. */
  averaged: number
  /** Item yang memakai uang masuk asli per pesanan (bukan perkiraan). */
  exact: number
  /** Jumlah item yang dihitung. */
  items: number
}

/**
 * Laporan Shopee hanya mencatat uang cair per hari. Tiap pesanan mendapat bagian
 * dari uang cair di hari pesanan itu selesai, sebanding dengan nilai penjualannya:
 * uang masuk ≈ subtotal × (penghasilan hari itu ÷ subtotal hari itu), tanpa bagian yang diretur.
 * Kalau hari itu belum ada di laporan, dipakai rata-rata semua hari yang ada.
 * Item yang punya uang masuk asli (`income`, dari Excel "Sudah Dilepas") memakai angka itu.
 * Mengembalikan null kalau ada item tanpa uang masuk asli dan belum ada laporan penghasilan sama sekali.
 */
export function estimateProfit(
  items: EstimateItem[],
  days: DayIncome[],
  /** Porsi barang retur yang bisa dijual lagi (0–1). 1 = semua kembali ke stok (modalnya tidak hilang). */
  returnRecovery = 1,
): ProfitEstimate | null {
  const ratio = new Map<string, number>()
  let sumInc = 0
  let sumSub = 0
  for (const d of days) {
    if (d.subtotal_pesanan > 0) {
      ratio.set(d.day, d.total_income / d.subtotal_pesanan)
      sumInc += d.total_income
      sumSub += d.subtotal_pesanan
    }
  }
  const needsEstimate = items.some((i) => i.income === undefined || i.income === null)
  if (sumSub === 0 && (needsEstimate || items.length === 0)) return null
  const average = sumSub > 0 ? sumInc / sumSub : 0

  let sales = 0
  let income = 0
  let modal = 0
  let missingHpp = 0
  let averaged = 0
  let exact = 0
  for (const i of items) {
    sales += i.subtotal
    const netQty = i.qty - i.returned_qty
    if (i.income !== undefined && i.income !== null) {
      income += i.income
      exact++
    } else {
      const day = i.completed_at ? wibDay(i.completed_at) : null
      let r = day ? ratio.get(day) : undefined
      if (r === undefined) {
        r = average
        averaged++
      }
      // Uang barang retur dikembalikan ke pembeli, jadi hanya bagian yang tidak diretur yang jadi uang masuk.
      income += i.qty > 0 ? i.subtotal * (netQty / i.qty) * r : 0
    }
    if (i.hpp === null) {
      // Barang yang seluruhnya diretur juga butuh HPP kalau retur ikut jadi kerugian (returnRecovery < 1).
      if (netQty > 0 || (i.returned_qty > 0 && returnRecovery < 1)) missingHpp++
    } else {
      // Barang retur yang tidak bisa dijual lagi menjadi kerugian modal (sama dengan hitungan di database).
      modal += netQty * i.hpp + i.returned_qty * i.hpp * (1 - returnRecovery)
    }
  }
  income = Math.round(income)
  modal = Math.round(modal)
  return { sales, income, fees: sales - income, modal, profit: income - modal, missingHpp, averaged, exact, items: items.length }
}

// --- Bab 2: dari omzet sampai uang masuk -------------------------------------

/** Satu baris view income_monthly_breakdown (SQL 20261022). Angka biaya bertanda negatif seperti di laporan. */
export interface IncomeBreakdownRow {
  month: string
  subtotal_pesanan: number
  subtotal_ongkir: number
  voucher_subsidi: number
  biaya_platform: number
  biaya_gratis_ongkir: number
  biaya_layanan_tambahan: number
  total_income: number
  order_count: number | null
  harga_produk: number | null
  pengembalian_dana: number | null
  biaya_admin: number | null
  biaya_proses: number | null
  orders_complete: boolean
}

export interface IncomeBreakdown {
  /** true = semua bulan punya rincian per pesanan (Excel "Sudah Dilepas"): omzet sebelum refund, admin & proses terpisah. */
  detailed: boolean
  /** Harga produk (Excel) atau subtotal pesanan setelah refund (PDF). */
  omzet: number
  /** Jumlah pesanan (hanya Excel). */
  orders: number | null
  /** Uang yang dikembalikan ke pembeli (positif = mengurangi). 0 kalau tidak diketahui terpisah (PDF). */
  refund: number
  /** Voucher dari penjual (positif = mengurangi). */
  voucher: number
  /** Ongkir bersih: negatif = ditanggung toko. Biasanya 0. */
  ongkir: number
  /** Total potongan Shopee (positif = mengurangi). */
  shopeeFee: number
  /** Rincian potongan Shopee (positif), hanya yang bukan 0, urut dari yang terbesar. */
  feeParts: { label: string; amount: number }[]
  /** Uang cair (tanpa biaya penyesuaian). */
  released: number
}

/**
 * Rincian omzet → uang cair untuk beberapa bulan. null kalau tidak ada data, atau kalau rinciannya
 * tidak pas dengan uang cair (Bab 2 lalu memakai tampilan lama yang dimulai dari uang masuk).
 */
export function incomeBreakdown(rows: IncomeBreakdownRow[]): IncomeBreakdown | null {
  if (rows.length === 0) return null
  const sum = (f: (r: IncomeBreakdownRow) => number | null) => rows.reduce((s, r) => s + Number(f(r) ?? 0), 0)
  const detailed = rows.every((r) => r.orders_complete)
  const omzet = detailed ? sum((r) => r.harga_produk) : sum((r) => r.subtotal_pesanan)
  const refund = detailed ? -sum((r) => r.pengembalian_dana) : 0
  const voucher = -sum((r) => r.voucher_subsidi)
  const ongkir = sum((r) => r.subtotal_ongkir)
  const xtra = -sum((r) => r.biaya_gratis_ongkir)
  const lain = -sum((r) => r.biaya_layanan_tambahan)
  const parts = detailed
    ? [
        { label: 'Biaya admin', amount: -sum((r) => r.biaya_admin) },
        { label: 'Gratis Ongkir XTRA', amount: xtra },
        { label: 'Biaya proses pesanan', amount: -sum((r) => r.biaya_proses) },
        { label: 'Biaya lain-lain', amount: lain },
      ]
    : [
        { label: 'Biaya admin & proses pesanan', amount: -sum((r) => r.biaya_platform) },
        { label: 'Gratis Ongkir XTRA', amount: xtra },
        { label: 'Biaya lain-lain', amount: lain },
      ]
  const feeParts = parts.filter((p) => p.amount !== 0).sort((a, b) => b.amount - a.amount)
  const shopeeFee = parts.reduce((s, p) => s + p.amount, 0)
  const released = sum((r) => r.total_income)
  // Harus pas sampai rupiah: omzet − refund − voucher + ongkir − potongan = uang cair.
  if (Math.abs(omzet - refund - voucher + ongkir - shopeeFee - released) > 1) return null
  const orders = detailed ? sum((r) => r.order_count) : null
  return { detailed, omzet, orders, refund, voucher, ongkir, shopeeFee, feeParts, released }
}

// --- Per produk: untung dari uang masuk asli -----------------------------------

/** Untung di bawah ini (dari uang masuk) ditandai "tipis". */
export const THIN_MARGIN = 0.1

export interface ProductRecapRow {
  sku: string
  product_name: string
  variant_name: string
  qty_sold: number
  qty_returned: number
  total_modal: number | null
  missing_hpp: boolean
  item_count?: number
  items_with_income?: number
  income?: number | null
  qty_with_income?: number | null
  modal_with_income?: number | null
}

export interface ProductRow {
  sku: string
  name: string
  variant: string
  qty: number
  returned: number
  modal: number
  missing: boolean
  items: number
  /** Item yang uang masuknya sudah ada di Excel "Sudah Dilepas". */
  itemsWithIncome: number
  income: number
  qtyWithIncome: number
  modalWithIncome: number
  /** Uang masuk − modal dari barang yang uangnya sudah ada; null = belum ada uang masuk asli / HPP kosong. */
  profit: number | null
  /** profit ÷ uang masuk. */
  margin: number | null
  status: 'rugi' | 'tipis' | null
}

/** Gabungkan baris product_monthly_recap (bisa beberapa bulan) per SKU. */
export function productRows(products: ProductRecapRow[]): ProductRow[] {
  const map = new Map<string, Omit<ProductRow, 'profit' | 'margin' | 'status'>>()
  for (const p of products) {
    const r = map.get(p.sku) ?? {
      sku: p.sku, name: p.product_name, variant: p.variant_name, qty: 0, returned: 0, modal: 0, missing: false,
      items: 0, itemsWithIncome: 0, income: 0, qtyWithIncome: 0, modalWithIncome: 0,
    }
    r.qty += Number(p.qty_sold)
    r.returned += Number(p.qty_returned)
    r.modal += Number(p.total_modal ?? 0)
    r.missing ||= p.missing_hpp
    r.items += Number(p.item_count ?? 0)
    r.itemsWithIncome += Number(p.items_with_income ?? 0)
    r.income += Number(p.income ?? 0)
    r.qtyWithIncome += Number(p.qty_with_income ?? 0)
    r.modalWithIncome += Number(p.modal_with_income ?? 0)
    map.set(p.sku, r)
  }
  return [...map.values()]
    .map((r) => {
      const profit = r.itemsWithIncome > 0 && !r.missing ? r.income - r.modalWithIncome : null
      const margin = profit !== null && r.income > 0 ? profit / r.income : null
      const status: ProductRow['status'] =
        profit === null ? null : profit < 0 ? 'rugi' : margin !== null && margin < THIN_MARGIN ? 'tipis' : null
      return { ...r, profit, margin, status }
    })
    .sort((a, b) => b.qty - a.qty)
}

export type ProductSort = 'terlaris' | 'untung' | 'rugi'

/** Urutkan produk. Produk tanpa untung asli selalu di belakang untuk urutan untung/rugi. */
export function sortProducts(rows: ProductRow[], sort: ProductSort): ProductRow[] {
  if (sort === 'terlaris') return [...rows].sort((a, b) => b.qty - a.qty)
  const dir = sort === 'untung' ? -1 : 1
  return [...rows].sort((a, b) => {
    if (a.profit === null || b.profit === null) return (a.profit === null ? 1 : 0) - (b.profit === null ? 1 : 0)
    return dir * (a.profit - b.profit)
  })
}

// --- Bab 1: kenapa untungnya segini ------------------------------------------------

export interface RecapInsight {
  key: 'iklan' | 'produk' | 'potongan' | 'modal'
  tone: 'bad' | 'info'
  /** Kalimat utama (tebal). */
  title: string
  /** Lanjutan kalimat (boleh kosong). */
  detail: string
}

// Format sama dengan bagian lain aplikasi ("Rp1,05 juta", "15,8%").
const pctText = (x: number) => formatPercent(x * 100)
const rpShort = (n: number) => formatRupiahShort(n)

/**
 * Maksimal 3 penyebab terbesar untung/rugi bulan ini, urut dari yang paling perlu ditindaklanjuti.
 * Kosong kalau omzet belum diketahui.
 */
export function recapInsights(input: {
  omzet: number
  shopeeFee: number
  feeParts: { label: string; amount: number }[]
  /** Iklan Shopee + Meta Ads. */
  ads: number
  modal: number
  profit: number
  rugi: number
  tipis: number
}): RecapInsight[] {
  const { omzet, ads, profit } = input
  if (omzet <= 0) return []
  const out: RecapInsight[] = []
  if (ads > 0 && ads / omzet >= 0.1) {
    const ratio = profit > 0 ? ads / profit : null
    out.push({
      key: 'iklan',
      tone: 'bad',
      title: `Iklan ${rpShort(ads)} = ${pctText(ads / omzet)} dari omzet`,
      detail:
        profit <= 0
          ? 'sementara toko rugi.'
          : ratio !== null && ratio >= 1
            ? `${(Math.round(ratio * 10) / 10).toLocaleString('id-ID')}× untung bersih.`
            : 'masih di bawah untung bersih.',
    })
  }
  if (input.rugi + input.tipis > 0) {
    const parts = [
      input.rugi > 0 ? `${input.rugi} produk rugi` : null,
      input.tipis > 0 ? `${input.tipis} produk untungnya tipis` : null,
    ].filter(Boolean)
    out.push({
      key: 'produk',
      tone: input.rugi > 0 ? 'bad' : 'info',
      title: parts.join(', '),
      // Untung per produk belum dikurangi iklan, jadi disebut supaya tidak dikira sesudah iklan.
      detail: input.tipis > 0 ? `(di bawah ${pctText(THIN_MARGIN)} dari uang masuk), sebelum iklan.` : '(sebelum iklan).',
    })
  }
  if (input.shopeeFee > 0) {
    const top = input.feeParts[0]
    out.push({
      key: 'potongan',
      tone: 'info',
      title: `Potongan Shopee ${pctText(input.shopeeFee / omzet)} dari omzet`,
      detail: `(${rpShort(input.shopeeFee)}).${top ? ` Terbesar: ${top.label.toLowerCase()} ${pctText(top.amount / omzet)}.` : ''}`,
    })
  }
  if (input.modal / omzet >= 0.7) {
    out.push({
      key: 'modal',
      tone: 'bad',
      title: `Modal ${pctText(input.modal / omzet)} dari omzet`,
      detail: 'harga jual tipis dibanding HPP.',
    })
  }
  return out.slice(0, 3)
}
