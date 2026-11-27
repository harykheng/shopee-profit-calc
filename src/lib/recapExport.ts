// Rekap bulanan sebagai file Markdown: untuk disimpan sebagai arsip, dikirim ke keluarga/akuntan, atau
// dilampirkan ke Claude. Fungsi murni: tidak ada data pembeli (tanpa nomor pesanan, nama, alamat), hanya
// angka yang sama dengan yang tampil di halaman Rekap.
import { fileSlug, formatDate, formatMonth, formatNumber, formatPercent, formatRupiah } from './format'
import { monthTodos, type MonthStatus } from './monthStatus'
import {
  THIN_MARGIN,
  incomeBreakdown,
  productRows,
  recapInsights,
  sortProducts,
  type IncomeBreakdown,
  type IncomeBreakdownRow,
  type ProductRecapRow,
  type ProductRow,
  type RecapInsight,
} from './recapMath'
import type { MonthlyRecap } from './types'

export interface RecapTotals {
  income: number
  adjustments: number
  modal: number
  returnedLoss: number
  expenses: number
  profit: number
  qty: number
}

export interface RecapSummary {
  totals: RecapTotals
  /** Rincian dari omzet, hanya kalau uang cairnya pas dengan rekap bulanan (sama dengan Bab 2). */
  breakdown: IncomeBreakdown | null
  /** Iklan Shopee + Meta Ads. */
  ads: number
  products: ProductRow[]
  insights: RecapInsight[]
  /** Untung ÷ omzet (atau ÷ uang masuk tanpa rincian), dalam persen. */
  margin: number | null
}

/** Angka Bab 1 & 2 Rekap. Dipakai halaman Rekap dan file .md supaya angkanya pasti sama. */
export function recapSummary(
  months: MonthlyRecap[],
  products: ProductRecapRow[],
  breakdownRows: IncomeBreakdownRow[],
): RecapSummary {
  const totals = months.reduce<RecapTotals>(
    (a, m) => ({
      income: a.income + Number(m.total_income),
      adjustments: a.adjustments + Number(m.adjustments ?? 0),
      modal: a.modal + Number(m.total_modal),
      returnedLoss: a.returnedLoss + Number(m.returned_loss ?? 0),
      expenses: a.expenses + Number(m.total_expenses),
      profit: a.profit + Number(m.net_profit),
      qty: a.qty + Number(m.total_qty),
    }),
    { income: 0, adjustments: 0, modal: 0, returnedLoss: 0, expenses: 0, profit: 0, qty: 0 },
  )
  const b = incomeBreakdown(breakdownRows)
  const breakdown = b && Math.abs(b.released + totals.adjustments - totals.income) <= 1 ? b : null
  const ads = months.reduce((n, m) => n + Number(m.iklan_shopee) + Number(m.meta_ads), 0)
  const rows = productRows(products)
  const insights = breakdown
    ? recapInsights({
        omzet: breakdown.omzet,
        shopeeFee: breakdown.shopeeFee,
        feeParts: breakdown.feeParts,
        ads,
        modal: totals.modal,
        profit: totals.profit,
        rugi: rows.filter((p) => p.status === 'rugi').length,
        tipis: rows.filter((p) => p.status === 'tipis').length,
      })
    : []
  const margin =
    breakdown && breakdown.omzet > 0
      ? (totals.profit / breakdown.omzet) * 100
      : totals.income > 0
        ? (totals.profit / totals.income) * 100
        : null
  return { totals, breakdown, ads, products: rows, insights, margin }
}

/** Isi sel tabel Markdown: tanpa garis tegak dan baris baru yang merusak tabel. */
const cell = (text: string) => text.replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim()

/** Tabel Markdown; `textCols` kolom pertama rata kiri, sisanya (angka) rata kanan. */
function table(out: string[], head: string[], textCols: number, rows: string[][]) {
  out.push(`| ${head.join(' | ')} |`)
  out.push(`|${head.map((_, i) => (i < textCols ? '---' : '---:')).join('|')}|`)
  for (const r of rows) out.push(`| ${r.map(cell).join(' | ')} |`)
}

/** Nama file .md: rekap-<toko>-<bulan>.md atau rekap-<toko>-<dari>-sampai-<akhir>.md. */
export function recapExportFileName(storeName: string, from: string, to: string): string {
  const ym = (m: string) => m.slice(0, 7)
  const period = from === to ? ym(from) : `${ym(from)}-sampai-${ym(to)}`
  return `rekap-${fileSlug(storeName)}-${period}.md`
}

const EXPENSE_PARTS = [
  ['Iklan Shopee', 'iklan_shopee'],
  ['Meta Ads', 'meta_ads'],
  ['Packaging', 'packaging'],
  ['Lain-lain', 'lain_lain'],
] as const

/** Bangun file Markdown rekap untuk satu bulan atau beberapa bulan (`months` urut lama → baru). */
export function buildRecapExport(input: {
  storeName: string
  createdAt: string
  months: MonthlyRecap[]
  products: ProductRecapRow[]
  breakdown: IncomeBreakdownRow[]
  /** Status tiap bulan (sama dengan stiker "Angka final / Belum lengkap" di Rekap). */
  statuses: { month: string; status: MonthStatus }[]
}): string {
  const { storeName, createdAt, months, statuses } = input
  if (months.length === 0) return ''
  const first = months[0].month
  const last = months[months.length - 1].month
  const period = first === last ? formatMonth(first) : `${formatMonth(first)} – ${formatMonth(last)}`
  const s = recapSummary(months, input.products, input.breakdown)
  const t = s.totals
  const b = s.breakdown
  const loss = t.profit < 0
  const ofOmzet = (v: number) => (b && b.omzet > 0 ? formatPercent((v / b.omzet) * 100) : '')
  const out: string[] = []

  out.push(`# Rekap ${period}: ${cell(storeName)}`)
  out.push('')
  out.push(`Dibuat ${formatDate(createdAt)} dari aplikasi hitung untung toko. Tanpa data pembeli.`)
  out.push('')

  // --- Jawaban dulu -----------------------------------------------------------
  out.push(`## ${loss ? 'Rugi' : 'Untung bersih'}: ${formatRupiah(t.profit)}`)
  out.push('')
  out.push(
    `${period}, ${cell(storeName)} ${loss ? 'rugi' : 'untung bersih'} **${formatRupiah(Math.abs(t.profit))}**` +
      (s.margin !== null ? ` (${formatPercent(s.margin)} dari ${b ? 'omzet' : 'uang masuk'})` : '') +
      `, dari **${formatNumber(t.qty)} barang** yang sudah sampai ke pembeli dan uangnya cair.`,
  )
  out.push('')
  const todos = statuses.flatMap((x) => monthTodos(x.status).map((todo) => ({ month: x.month, todo })))
  if (statuses.length > 0 && todos.length === 0) {
    out.push('**Status: Angka final.** Semua laporan, HPP, dan biaya sudah lengkap.')
  } else if (todos.length > 0) {
    out.push(`**Status: Belum lengkap (${todos.length} hal).** Angka di atas masih bisa berubah:`)
    out.push('')
    for (const x of todos) out.push(`- ${months.length > 1 ? `${formatMonth(x.month)}: ` : ''}${x.todo.short}`)
  }
  out.push('')

  if (s.insights.length > 0) {
    out.push('### Kenapa untungnya segini?')
    out.push('')
    for (const i of s.insights) out.push(`- **${i.title}** ${i.detail}`.trim())
    out.push('')
  }

  // --- Hitungannya ------------------------------------------------------------
  out.push(`## ${b ? (loss ? 'Dari omzet sampai rugi' : 'Dari omzet sampai untung') : 'Dari mana angkanya'}`)
  out.push('')
  const lines: string[][] = []
  const pct = (v: number) => (b ? [ofOmzet(v)] : [])
  if (b) {
    lines.push([
      'Omzet' + (b.orders !== null ? ` (${formatNumber(b.orders)} pesanan)` : ''),
      formatRupiah(b.omzet),
      '100%',
    ])
    if (b.refund !== 0) lines.push(['− Refund ke pembeli', formatRupiah(-b.refund), ofOmzet(b.refund)])
    if (b.voucher !== 0) lines.push(['− Voucher toko', formatRupiah(-b.voucher), ofOmzet(b.voucher)])
    if (b.ongkir !== 0) lines.push(['Ongkir', formatRupiah(b.ongkir), ofOmzet(Math.abs(b.ongkir))])
    for (const p of b.feeParts) lines.push([`− ${p.label}`, formatRupiah(-p.amount), ofOmzet(p.amount)])
    if (t.adjustments !== 0) lines.push(['Penyesuaian Shopee', formatRupiah(t.adjustments), ofOmzet(Math.abs(t.adjustments))])
  }
  lines.push(['= Uang masuk dari Shopee', formatRupiah(t.income), ...pct(t.income)])
  lines.push([
    `− Modal barang terjual (${formatNumber(t.qty)} barang × HPP)`,
    formatRupiah(-t.modal),
    ...pct(t.modal),
  ])
  const expenseRows = EXPENSE_PARTS.map(([label, key]) => [label, months.reduce((n, m) => n + Number(m[key]), 0)] as const)
  for (const [label, v] of expenseRows) if (v > 0) lines.push([`− ${label}`, formatRupiah(-v), ...pct(v)])
  const unfilled = months.filter((m) => Number(m.expense_entries) === 0)
  if (t.expenses === 0) lines.push(['− Biaya', unfilled.length > 0 ? 'belum diisi' : formatRupiah(0), ...pct(0)])
  lines.push([`= **${loss ? 'Rugi' : 'Untung bersih'}**`, `**${formatRupiah(t.profit)}**`, ...pct(t.profit)])
  table(out, b ? ['', 'Jumlah', '% dari omzet'] : ['', 'Jumlah'], 1, lines)
  out.push('')
  if (t.returnedLoss > 0) {
    out.push(`Modal sudah termasuk ${formatRupiah(t.returnedLoss)} dari barang retur yang tidak bisa dijual lagi.`)
    out.push('')
  }
  if (!b) {
    out.push(
      'Rincian dari omzet belum ada (laporan penghasilan PDF, atau rinciannya belum pas dengan uang cair), jadi ' +
        'hitungan dimulai dari uang masuk.',
    )
    out.push('')
  }

  // --- Per bulan ---------------------------------------------------------------
  if (months.length > 1) {
    out.push('## Per bulan')
    out.push('')
    table(
      out,
      ['Bulan', 'Status', 'Uang masuk', 'Modal', 'Biaya', 'Untung bersih', 'Barang'],
      2,
      months.map((m) => {
        const st = statuses.find((x) => x.month === m.month)?.status
        return [
          formatMonth(m.month),
          st ? (monthTodos(st).length === 0 ? 'Final' : 'Belum lengkap') : '–',
          formatRupiah(Number(m.total_income)),
          formatRupiah(Number(m.total_modal)),
          formatRupiah(Number(m.total_expenses)),
          formatRupiah(Number(m.net_profit)),
          formatNumber(Number(m.total_qty)),
        ]
      }),
    )
    out.push('')
  }

  // --- Per produk --------------------------------------------------------------
  const withIncome = s.products.some((p) => p.itemsWithIncome > 0)
  const rows = sortProducts(s.products, withIncome ? 'untung' : 'terlaris')
  out.push('## Per produk')
  out.push('')
  if (rows.length === 0) {
    out.push(`Belum ada barang terjual di ${period}.`)
  } else {
    out.push(
      withIncome
        ? 'Urut dari yang paling untung. Uang masuk dan untung per produk dari laporan Excel "Sudah Dilepas" ' +
            '(potongan Shopee asli), **belum dikurangi iklan, packaging, dan biaya lain**.'
        : 'Urut dari yang paling laku. Untung per produk belum bisa dihitung (butuh laporan Excel "Sudah Dilepas").',
    )
    out.push('')
    table(
      out,
      [
        'Produk',
        'Variasi',
        'Tanda',
        'Terjual',
        'Retur',
        'Modal',
        ...(withIncome ? ['Uang masuk', 'Untung sebelum iklan', 'Margin'] : []),
      ],
      3,
      rows.map((r) => [
        r.name,
        r.variant || '–',
        r.missing ? 'HPP kosong' : r.status === 'rugi' ? 'RUGI' : r.status === 'tipis' ? 'TIPIS' : '',
        formatNumber(r.qty),
        formatNumber(r.returned),
        r.missing ? '–' : formatRupiah(r.modal),
        ...(withIncome
          ? [
              r.itemsWithIncome > 0 ? formatRupiah(r.income) : '–',
              r.profit !== null ? formatRupiah(r.profit) : '–',
              r.margin !== null ? formatPercent(r.margin * 100) : '–',
            ]
          : []),
      ]),
    )
    out.push('')
    if (withIncome) {
      out.push(
        `**RUGI** = untung di bawah 0. **TIPIS** = untung di bawah ${formatPercent(THIN_MARGIN * 100)} dari uang masuk. ` +
          '"–" = uangnya belum ada di laporan atau HPP kosong.',
      )
      out.push('')
    }
  }

  // --- Cara membaca & pertanyaan untuk Claude -----------------------------------
  out.push('## Cara membaca angka')
  out.push('')
  out.push('- **Untung bersih** = uang masuk dari Shopee − modal (jumlah terjual × HPP) − biaya (iklan, packaging, lain-lain).')
  out.push('- **Uang masuk** dihitung di bulan uangnya cair; **modal** di bulan pesanannya selesai (WIB). Di akhir bulan bisa bergeser 1–2 hari.')
  out.push('- **Omzet** = harga produk sebelum potongan (Excel "Sudah Dilepas") atau subtotal pesanan setelah refund (PDF).')
  out.push('- Barang retur tidak dihitung sebagai modal, kecuali yang tidak bisa dijual lagi.')
  out.push('')
  out.push('## Kalau mau bertanya ke Claude')
  out.push('')
  out.push('Lampirkan file ini di chat, lalu misalnya tanyakan:')
  out.push('')
  out.push('1. Apa 3 hal yang paling berpengaruh ke untung bulan ini, dan apa yang bisa saya perbaiki dulu?')
  out.push('2. Produk mana yang sebaiknya saya naikkan harganya, kurangi iklannya, atau berhenti jual?')
  if (months.length > 1) out.push('3. Bulan mana yang paling baik dan paling buruk, dan kenapa?')
  out.push('')
  out.push('Semua angka sudah dihitung aplikasi; pakai definisi di "Cara membaca angka", jangan dihitung ulang dengan rumus lain.')
  out.push('')
  return out.join('\n')
}
