// Analisis iklan per produk: ROAS nyata, ROAS balik modal, ROAS saran, dan label.
// Fungsi murni (tanpa Supabase) supaya bisa dites.
import type { AdRow } from './parsers/ads'
import type { AdSource, StatusGroup } from './shopeeColumns'
import { ADS_CSV } from './shopeeColumns'

/** Target untung bersih setelah iklan (5% dari harga jual). */
export const ADS_TARGET_PROFIT = 0.05
/** Target untung harga jual setelah potongan Shopee, sebelum iklan & packaging. */
export const PRICE_TARGET_MARGIN = 0.2
/** Potongan Shopee kalau laporan penghasilan belum ada. */
export const DEFAULT_FEE_RATE = 0.15
/** Minimal terjual (bersih) sebelum produk diberi label pasti. */
export const MIN_SALES_FOR_VERDICT = 3
/** ROAS nyata ≥ ROAS saran × faktor ini → Hero. */
export const HERO_FACTOR = 1.2
/** Biaya tanpa penjualan di atas ini → takedown (kalau untung per barang belum diketahui). */
export const NO_SALE_SPEND_LIMIT = 10_000

export type AdVerdict = 'takedown' | 'kurang' | 'hero' | 'aman' | 'belum_cukup' | 'hpp_kosong'

export interface AdReportRows {
  source: AdSource
  rows: AdRow[]
}

/** Satu item pesanan yang DIBUAT dalam periode iklan. */
export interface AdOrderLine {
  product_name: string
  status_group: StatusGroup
  qty: number
  subtotal: number
  /** HPP per unit (snapshot, atau HPP produk sekarang). */
  hpp: number | null
}

export interface AdProductResult {
  code: string
  name: string
  spend: number
  clicks: number
  /** Terjual & omzet versi Shopee (termasuk pesanan batal). */
  adsSold: number
  adsGmv: number
  shopeeRoas: number | null
  /** Ada pesanan untuk produk ini di periode iklan. */
  hasOrders: boolean
  /** Porsi pesanan batal (0–1) dari data pesanan. */
  batalShare: number
  batalQty: number
  /** Setelah dikurangi pesanan batal. */
  netSold: number
  netGmv: number
  realRoas: number | null
  /** Harga jual rata-rata per barang (dari pesanan; kalau tidak ada, dari data iklan). */
  price: number | null
  hpp: number | null
  /** Sebagian pesanan belum ada HPP-nya. */
  hppIncomplete: boolean
  /** Sisa per barang setelah potongan Shopee dan HPP (sebelum iklan). */
  unitProfit: number | null
  margin: number | null
  /** ROAS minimal supaya tidak rugi. null = tidak mungkin (sudah rugi tanpa iklan). */
  bepRoas: number | null
  /** ROAS nyata supaya untung 5%. null = tidak mungkin (margin ≤ 5%). */
  targetRoas: number | null
  /** Angka target ROAS untuk diisi di Shopee (Shopee ikut menghitung pesanan batal). */
  shopeeTargetRoas: number | null
  profitAfterAds: number | null
  /** Harga jual supaya untung 20% (diisi kalau margin < 20%). */
  idealPrice: number | null
  verdict: AdVerdict
}

export interface UnallocatedSpend {
  adName: string
  spend: number
  /** File rincian yang perlu di-upload supaya biaya ini terbagi per produk. */
  need: 'otomatis' | 'grup'
}

export interface AdsAnalysis {
  totalSpend: number
  /** Dari file Data Keseluruhan (lengkap) atau hanya dari file rincian. */
  spendFrom: 'keseluruhan' | 'rincian'
  unallocated: UnallocatedSpend[]
  products: AdProductResult[]
  adsGmv: number
  netGmv: number
  /** Total untung produk yang diiklankan sebelum iklan (yang HPP-nya lengkap). */
  profitBeforeAds: number
  /** profitBeforeAds − total biaya iklan. */
  profitAfterAds: number
  /** Produk terjual yang untungnya belum bisa dihitung (HPP kosong). */
  productsWithoutProfit: number
  realRoas: number | null
}

/** Kunci pencocokan nama produk antara data iklan dan export pesanan. */
export function productKey(name: string): string {
  return name
    .replace(/\s*\[\d+\]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Potongan Shopee (0–1) dari laporan penghasilan: 1 − total penghasilan ÷ subtotal pesanan. */
export function feeRateFromIncome(days: { total_income: number; subtotal_pesanan: number }[]): number | null {
  const sub = days.reduce((s, d) => s + Number(d.subtotal_pesanan), 0)
  const inc = days.reduce((s, d) => s + Number(d.total_income), 0)
  if (sub <= 0) return null
  const rate = 1 - inc / sub
  return rate >= 0 && rate < 0.6 ? rate : null
}

const ORDER: Record<AdVerdict, number> = { takedown: 0, kurang: 1, hpp_kosong: 2, hero: 3, aman: 4, belum_cukup: 5 }

export function analyzeAds(input: {
  reports: AdReportRows[]
  orders: AdOrderLine[]
  feeRate: number
  /** HPP per produk (nama listing) untuk produk tanpa pesanan di periode ini. */
  fallbackHpp?: Map<string, number>
}): AdsAnalysis {
  const { reports, orders, feeRate } = input
  const bySource = (s: AdSource) => reports.filter((r) => r.source === s).flatMap((r) => r.rows)
  const all = bySource('keseluruhan')
  const breakdown = [...bySource('otomatis'), ...bySource('grup')]

  // --- Total biaya & biaya yang belum terbagi per produk.
  let totalSpend: number
  const unallocated: UnallocatedSpend[] = []
  const hasKeseluruhan = reports.some((r) => r.source === 'keseluruhan')
  if (hasKeseluruhan) {
    totalSpend = all.reduce((s, r) => s + r.spend, 0)
    const covered = new Set(breakdown.filter((r) => !r.product_code).map((r) => productKey(r.ad_name)))
    for (const r of all) {
      if (r.product_code || r.spend <= 0 || covered.has(productKey(r.ad_name))) continue
      unallocated.push({
        adName: r.ad_name,
        spend: r.spend,
        need: productKey(r.ad_name) === productKey(ADS_CSV.autoAdName) ? 'otomatis' : 'grup',
      })
    }
  } else {
    totalSpend = 0
    for (const rep of reports) {
      const totals = rep.rows.filter((r) => !r.product_code)
      totalSpend += (totals.length > 0 ? totals : rep.rows).reduce((s, r) => s + r.spend, 0)
    }
  }

  // --- Gabungkan baris produk per Kode Produk (iklan produk + otomatis + grup).
  const agg = new Map<string, { name: string; spend: number; clicks: number; sold: number; gmv: number }>()
  for (const r of [...all, ...breakdown]) {
    if (!r.product_code) continue
    const e = agg.get(r.product_code) ?? { name: r.product_name, spend: 0, clicks: 0, sold: 0, gmv: 0 }
    e.spend += r.spend
    e.clicks += r.clicks
    e.sold += r.sold
    e.gmv += r.gmv
    agg.set(r.product_code, e)
  }

  // --- Pesanan per nama produk.
  const ordersByKey = new Map<string, AdOrderLine[]>()
  for (const o of orders) {
    const k = productKey(o.product_name)
    const list = ordersByKey.get(k)
    if (list) list.push(o)
    else ordersByKey.set(k, [o])
  }

  const products: AdProductResult[] = []
  for (const [code, a] of agg) {
    if (a.spend <= 0) continue
    const lines = ordersByKey.get(productKey(a.name)) ?? []
    const allQty = lines.reduce((s, l) => s + l.qty, 0)
    const kept = lines.filter((l) => l.status_group !== 'batal')
    const keptQty = kept.reduce((s, l) => s + l.qty, 0)
    const batalQty = allQty - keptQty
    const batalShare = allQty > 0 ? batalQty / allQty : 0
    const netSold = a.sold * (1 - batalShare)
    const netGmv = a.gmv * (1 - batalShare)

    const keptSubtotal = kept.reduce((s, l) => s + l.subtotal, 0)
    const price = keptQty > 0 ? keptSubtotal / keptQty : a.sold > 0 ? a.gmv / a.sold : null

    // HPP rata-rata tertimbang qty (pesanan yang tidak batal; kalau tidak ada, semua pesanan).
    const hppLines = (kept.length > 0 ? kept : lines).filter((l) => l.qty > 0)
    const withHpp = hppLines.filter((l) => l.hpp !== null)
    const hppQty = withHpp.reduce((s, l) => s + l.qty, 0)
    let hpp = hppQty > 0 ? withHpp.reduce((s, l) => s + l.qty * (l.hpp as number), 0) / hppQty : null
    if (hpp === null && hppLines.length === 0) hpp = input.fallbackHpp?.get(productKey(a.name)) ?? null
    // Hanya relevan kalau ada barang yang benar-benar terjual.
    const hppIncomplete = kept.length > 0 && withHpp.length < hppLines.length

    const unitProfit = price !== null && hpp !== null ? price * (1 - feeRate) - hpp : null
    const margin = unitProfit !== null && price ? unitProfit / price : null
    const bepRoas = margin !== null && margin > 0 ? 1 / margin : null
    const targetRoas = margin !== null && margin > ADS_TARGET_PROFIT ? 1 / (margin - ADS_TARGET_PROFIT) : null
    const shopeeTargetRoas = targetRoas !== null && batalShare < 1 ? targetRoas / (1 - batalShare) : null
    const realRoas = a.spend > 0 ? netGmv / a.spend : null
    const profitAfterAds = unitProfit !== null ? netSold * unitProfit - a.spend : null
    const idealPrice =
      hpp !== null && margin !== null && margin < PRICE_TARGET_MARGIN
        ? hpp / (1 - feeRate - PRICE_TARGET_MARGIN)
        : null

    products.push({
      code,
      name: a.name,
      spend: a.spend,
      clicks: a.clicks,
      adsSold: a.sold,
      adsGmv: a.gmv,
      shopeeRoas: a.spend > 0 ? a.gmv / a.spend : null,
      hasOrders: lines.length > 0,
      batalShare,
      batalQty,
      netSold,
      netGmv,
      realRoas,
      price,
      hpp,
      hppIncomplete,
      unitProfit,
      margin,
      bepRoas,
      targetRoas,
      shopeeTargetRoas,
      profitAfterAds,
      idealPrice,
      verdict: verdictFor({ spend: a.spend, netSold, unitProfit, realRoas, bepRoas, targetRoas }),
    })
  }

  products.sort((x, y) => ORDER[x.verdict] - ORDER[y.verdict] || y.spend - x.spend)

  const known = products.filter((p) => p.unitProfit !== null)
  const profitBeforeAds = known.reduce((s, p) => s + p.netSold * (p.unitProfit as number), 0)
  const netGmv = products.reduce((s, p) => s + p.netGmv, 0)
  return {
    totalSpend,
    spendFrom: hasKeseluruhan ? 'keseluruhan' : 'rincian',
    unallocated,
    products,
    adsGmv: products.reduce((s, p) => s + p.adsGmv, 0),
    netGmv,
    profitBeforeAds,
    profitAfterAds: profitBeforeAds - totalSpend,
    productsWithoutProfit: products.filter((p) => p.unitProfit === null && p.netSold >= 0.5).length,
    realRoas: totalSpend > 0 ? netGmv / totalSpend : null,
  }
}

export function verdictFor(p: {
  spend: number
  netSold: number
  unitProfit: number | null
  realRoas: number | null
  bepRoas: number | null
  targetRoas: number | null
}): AdVerdict {
  const { spend, netSold, unitProfit, realRoas, bepRoas, targetRoas } = p
  if (netSold < 0.5) {
    // Belum ada penjualan: takedown kalau biayanya sudah melebihi untung 1 barang.
    const limit = unitProfit !== null && unitProfit > 0 ? unitProfit : NO_SALE_SPEND_LIMIT
    return spend >= limit ? 'takedown' : 'belum_cukup'
  }
  if (unitProfit === null || realRoas === null) return 'hpp_kosong'
  if (unitProfit <= 0 || bepRoas === null) return 'takedown'
  if (netSold < MIN_SALES_FOR_VERDICT) {
    return realRoas < bepRoas && spend >= 2 * unitProfit ? 'takedown' : 'belum_cukup'
  }
  if (realRoas < bepRoas) return 'takedown'
  if (targetRoas === null || realRoas < targetRoas) return 'kurang'
  return realRoas >= targetRoas * HERO_FACTOR ? 'hero' : 'aman'
}

/** Periode = satu bulan kalender penuh (tanggal 1 s/d tanggal terakhir). Hasil: "YYYY-MM-01" atau null. */
export function fullMonthOf(periodStart: string, periodEnd: string): string | null {
  if (!periodStart.endsWith('-01') || periodStart.slice(0, 7) !== periodEnd.slice(0, 7)) return null
  const [y, m] = periodStart.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Number(periodEnd.slice(8, 10)) === last ? periodStart : null
}
