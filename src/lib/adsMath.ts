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
/** ROAS di atas ini praktis tidak bisa dicapai iklan Shopee → dianggap "tidak mungkin". */
export const MAX_TARGET_ROAS = 50
/** Biaya tanpa penjualan di atas ini → takedown (kalau untung per barang belum diketahui). */
export const NO_SALE_SPEND_LIMIT = 10_000

export type AdVerdict = 'takedown' | 'kurang' | 'hero' | 'aman' | 'belum_cukup' | 'hpp_kosong'

export interface AdReportRows {
  source: AdSource
  rows: AdRow[]
  /** Kunci periode laporan (mis. "2026-07-01|2026-07-31"). Untuk menggabungkan beberapa bulan. */
  period?: string
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
  /** Periode laporan asal biaya ini. */
  period?: string
}

export interface AdsAnalysis {
  totalSpend: number
  /** Dari file Data Keseluruhan (lengkap) atau (sebagian) hanya dari file rincian. */
  spendFrom: 'keseluruhan' | 'rincian'
  /** Periode yang belum punya file Data Keseluruhan. */
  periodsWithoutKeseluruhan: string[]
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

/**
 * ROAS supaya masih untung ADS_TARGET_PROFIT (5%) dari harga jual setelah iklan.
 * - `targetRoas`: ROAS nyata yang dibutuhkan; null = tidak mungkin (margin ≤ 5% atau > MAX_TARGET_ROAS).
 * - `shopeeTargetRoas`: angka untuk diisi di Shopee, dengan cadangan pesanan batal
 *   (Shopee ikut menghitung pesanan batal); null = tidak mungkin.
 * `margin` = untung per barang (sebelum iklan) ÷ harga jual; `batalShare` = porsi pesanan batal (0–1).
 */
export function targetRoasFromMargin(
  margin: number | null,
  batalShare = 0,
): { targetRoas: number | null; shopeeTargetRoas: number | null } {
  const rawTarget = margin !== null && margin > ADS_TARGET_PROFIT ? 1 / (margin - ADS_TARGET_PROFIT) : null
  const targetRoas = rawTarget !== null && rawTarget <= MAX_TARGET_ROAS ? rawTarget : null
  const shopeeTarget = targetRoas !== null && batalShare < 1 ? targetRoas / (1 - batalShare) : null
  const shopeeTargetRoas = shopeeTarget !== null && shopeeTarget <= MAX_TARGET_ROAS ? shopeeTarget : null
  return { targetRoas, shopeeTargetRoas }
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

  // --- Total biaya & biaya yang belum terbagi per produk, dihitung per periode laporan
  // (supaya beberapa bulan bisa digabung tanpa dobel), lalu dijumlahkan.
  let totalSpend = 0
  const unallocated: UnallocatedSpend[] = []
  const periodsWithoutKeseluruhan: string[] = []
  const periods = [...new Set(reports.map((r) => r.period ?? ''))]
  for (const period of periods) {
    const reps = reports.filter((r) => (r.period ?? '') === period)
    const pAll = reps.filter((r) => r.source === 'keseluruhan').flatMap((r) => r.rows)
    if (reps.some((r) => r.source === 'keseluruhan')) {
      totalSpend += pAll.reduce((s, r) => s + r.spend, 0)
      const covered = new Set(
        reps
          .filter((r) => r.source !== 'keseluruhan')
          .flatMap((r) => r.rows)
          .filter((r) => !r.product_code)
          .map((r) => productKey(r.ad_name)),
      )
      for (const r of pAll) {
        if (r.product_code || r.spend <= 0 || covered.has(productKey(r.ad_name))) continue
        unallocated.push({
          adName: r.ad_name,
          spend: r.spend,
          need: productKey(r.ad_name) === productKey(ADS_CSV.autoAdName) ? 'otomatis' : 'grup',
          ...(period ? { period } : {}),
        })
      }
    } else {
      periodsWithoutKeseluruhan.push(period)
      for (const rep of reps) {
        const totals = rep.rows.filter((r) => !r.product_code)
        totalSpend += (totals.length > 0 ? totals : rep.rows).reduce((s, r) => s + r.spend, 0)
      }
    }
  }
  const hasKeseluruhan = periodsWithoutKeseluruhan.length === 0

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
    const { targetRoas, shopeeTargetRoas } = targetRoasFromMargin(margin, batalShare)
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
    periodsWithoutKeseluruhan,
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

// --- Simulasi harga (sebelum jualan / ganti harga) ---------------------------------

/** Potongan Gratis Ongkir XTRA kalau ikut program (persen dari harga jual). */
export const XTRA_FEE_RATE = 0.04

export interface PriceSimInput {
  /** HPP per unit jual (paket: HPP per paket). */
  hpp: number
  /** Harga jual per unit. */
  price: number
  /** Biaya admin, pecahan (8,25% → 0.0825). */
  adminRate: number
  /** Ikut Gratis Ongkir XTRA. */
  xtra: boolean
  /** Biaya proses pesanan per order (Rp, flat). */
  processFee: number
  /** Packaging per order (Rp). */
  packaging: number
  /** ROAS yang biasa didapat di iklan. */
  realisticRoas: number
  /** ROAS aktual iklan produk ini (opsional). */
  actualRoas?: number | null
}

/** Saran harga: harga persis dan harga dibulatkan ke atas ke Rp1.000. null = tidak mungkin. */
export interface SuggestedPrice {
  exact: number
  rounded: number
}

export interface PriceSimResult {
  adminFee: number
  xtraFee: number
  processFee: number
  /** Total potongan Shopee per order. */
  totalFee: number
  /** Harga − potongan. */
  income: number
  /** Penghasilan − HPP − packaging (sebelum iklan). */
  profit: number
  margin: number
  /** false = harga ini sudah rugi tanpa iklan. */
  profitable: boolean
  /** ROAS minimal supaya iklan tidak rugi; null kalau sudah rugi tanpa iklan. */
  bepRoas: number | null
  /** Saran target ROAS (untung 5% setelah iklan, tanpa cadangan pesanan batal). null = tidak mungkin. */
  targetRoas: number | null
  /** Harga minimum supaya iklan balik modal di ROAS realistis. */
  priceBreakEven: SuggestedPrice | null
  /** Harga supaya masih untung 5% setelah iklan di ROAS realistis. */
  priceTargetProfit: SuggestedPrice | null
  /** Harga supaya untung 20% (sebelum iklan). */
  priceTargetMargin: SuggestedPrice | null
  /** Diisi kalau ROAS aktual diisi. */
  actual: { adCost: number; profitAfterAds: number } | null
}

/** Bulatkan ke atas ke Rp1.000 terdekat. */
export function roundUpToThousand(value: number): number {
  return Math.ceil(value / 1000 - 1e-9) * 1000
}

/**
 * Hitung untung per order dan saran harga, dengan potongan Shopee per komponen
 * (admin % + Gratis Ongkir XTRA % + biaya proses flat per order).
 */
export function simulatePrice(input: PriceSimInput): PriceSimResult {
  const { hpp, price, adminRate, xtra, processFee, packaging, realisticRoas, actualRoas } = input
  const xtraRate = xtra ? XTRA_FEE_RATE : 0
  const adminFee = price * adminRate
  const xtraFee = price * xtraRate
  const totalFee = adminFee + xtraFee + processFee
  const income = price - totalFee
  const profit = income - hpp - packaging
  const margin = price > 0 ? profit / price : 0
  const profitable = profit > 0

  // Harga = biaya tetap ÷ (1 − potongan % − porsi lain). Penyebut ≤ 0 → tidak mungkin.
  const fixedCost = hpp + processFee + packaging
  const pctLeft = 1 - adminRate - xtraRate
  const priceFor = (share: number): SuggestedPrice | null => {
    const denom = pctLeft - share
    if (denom <= 0) return null
    const exact = fixedCost / denom
    return { exact, rounded: roundUpToThousand(exact) }
  }
  const adShare = realisticRoas > 0 ? 1 / realisticRoas : Infinity

  const adCost = actualRoas && actualRoas > 0 ? price / actualRoas : null
  return {
    adminFee,
    xtraFee,
    processFee,
    totalFee,
    income,
    profit,
    margin,
    profitable,
    bepRoas: profitable ? price / profit : null,
    targetRoas: profitable ? targetRoasFromMargin(margin, 0).shopeeTargetRoas : null,
    priceBreakEven: priceFor(adShare),
    priceTargetProfit: priceFor(adShare + ADS_TARGET_PROFIT),
    priceTargetMargin: priceFor(PRICE_TARGET_MARGIN),
    actual: adCost !== null ? { adCost, profitAfterAds: profit - adCost } : null,
  }
}

// --- Grup iklan (beberapa produk, satu target ROAS) ------------------------------

export interface AdGroupRowInput {
  hpp: number
  price: number
  adminRate: number
  xtra: boolean
  /** Perkiraan terjual per bulan; null = belum diketahui (mis. produk baru). */
  qty: number | null
}

export interface AdGroupRowResult {
  /** Untung per order sebelum iklan (sama dengan Simulasi satu produk). */
  profit: number
  margin: number
  /** ROAS balik modal produk ini sendiri; null kalau sudah rugi tanpa iklan. */
  bepRoas: number | null
  /** Target ROAS produk ini sendiri (untung 5% setelah iklan); null = tidak mungkin. */
  targetRoas: number | null
  /** Porsi yang dipakai menghitung grup (qty, atau perkiraan kalau qty belum diketahui). */
  weight: number
  weightEstimated: boolean
}

export interface AdGroupResult {
  rows: AdGroupRowResult[]
  /** Perkiraan omzet & untung sebelum iklan per bulan dari porsi di atas. */
  gmv: number
  profit: number
  /** ROAS balik modal grup sesuai porsi; null kalau grup sudah rugi tanpa iklan. */
  mixBepRoas: number | null
  /** Target ROAS grup sesuai porsi penjualan (untung 5% setelah iklan); null = tidak mungkin. */
  mixTargetRoas: number | null
  /** Target ROAS yang membuat SETIAP produk tetap untung 5% (= target tertinggi); null kalau ada produk yang tidak mungkin. */
  safeTargetRoas: number | null
  /** Ada produk yang porsi penjualannya belum diketahui. */
  hasUnknownQty: boolean
  /** Yang disarankan untuk diisi di Shopee. */
  recommended: 'safe' | 'mix'
  recommendedRoas: number | null
}

/**
 * Satu target ROAS untuk beberapa produk sekaligus (Iklan Grup Shopee).
 *
 * Dengan satu ROAS R, biaya iklan tiap order = harga ÷ R, jadi untung grup per bulan
 * = Σ porsi × (untung per order − harga ÷ R). Target sesuai porsi memakai margin gabungan
 * (Σ porsi × untung ÷ Σ porsi × harga); target aman memakai target produk yang paling tinggi,
 * sehingga tidak bergantung pada porsi penjualan. Kalau ada produk yang porsinya belum
 * diketahui (produk baru), yang disarankan target aman.
 */
export function simulateAdGroup(input: {
  rows: AdGroupRowInput[]
  processFee: number
  packaging: number
}): AdGroupResult {
  const known = input.rows.map((r) => r.qty).filter((q): q is number => q !== null && q > 0)
  const fallbackWeight = known.length > 0 ? known.reduce((s, q) => s + q, 0) / known.length : 1
  const rows = input.rows.map((r): AdGroupRowResult => {
    const sim = simulatePrice({
      hpp: r.hpp,
      price: r.price,
      adminRate: r.adminRate,
      xtra: r.xtra,
      processFee: input.processFee,
      packaging: input.packaging,
      realisticRoas: 1,
    })
    const estimated = r.qty === null
    return {
      profit: sim.profit,
      margin: sim.margin,
      bepRoas: sim.bepRoas,
      targetRoas: sim.profitable ? targetRoasFromMargin(sim.margin, 0).shopeeTargetRoas : null,
      weight: estimated ? fallbackWeight : Math.max(0, r.qty ?? 0),
      weightEstimated: estimated,
    }
  })

  const gmv = input.rows.reduce((s, r, i) => s + r.price * rows[i].weight, 0)
  const profit = rows.reduce((s, r) => s + r.profit * r.weight, 0)
  const mixMargin = gmv > 0 ? profit / gmv : null
  const mixBepRoas = mixMargin !== null && profit > 0 ? gmv / profit : null
  const mixTargetRoas = mixMargin !== null && profit > 0 ? targetRoasFromMargin(mixMargin, 0).shopeeTargetRoas : null
  const safeTargetRoas =
    rows.length > 0 && rows.every((r) => r.targetRoas !== null) ? Math.max(...rows.map((r) => r.targetRoas as number)) : null
  const hasUnknownQty = rows.some((r) => r.weightEstimated)
  // Porsi belum diketahui, atau porsinya nol semua (target porsi tidak bisa dihitung) → target aman.
  const recommended = (hasUnknownQty || mixTargetRoas === null) && safeTargetRoas !== null ? 'safe' : 'mix'
  return {
    rows,
    gmv,
    profit,
    mixBepRoas,
    mixTargetRoas,
    safeTargetRoas,
    hasUnknownQty,
    recommended,
    recommendedRoas: recommended === 'safe' ? safeTargetRoas : mixTargetRoas,
  }
}

/** Untung per order sebelum dan sesudah iklan di ROAS grup R (biaya iklan = harga ÷ R). */
export function profitAtRoas(row: { price: number; profit: number }, roas: number): number {
  return row.profit - row.price / roas
}
