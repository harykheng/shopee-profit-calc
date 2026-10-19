// Memuat data toko dan menghitung analisis iklan. Dipakai halaman Iklan, Cek cepat, dan bab Iklan di Rekap.
import {
  fetchAdRows,
  fetchFeeCategories,
  fetchIncomeDays,
  fetchItemsCreatedBetween,
  fetchProducts,
  fetchStoreSettings,
} from './api'
import {
  DEFAULT_FEE_RATE,
  analyzeAds,
  feeRateFromIncome,
  productKey,
  type AdReportRows,
  type AdsAnalysis,
  type Targets,
} from './adsMath'
import { productFeeComponents } from './feeCategories'
import { addMonths, formatMonth, monthEnd, wibDay } from './format'
import type { AdsParseResult } from './parsers/ads'
import { resolveSettings, targetsOf } from './storeSettings'
import type { AdReport } from './types'

export interface Period {
  key: string
  start: string
  end: string
  reports: AdReport[]
  /** Untuk gabungan: bulan-bulan (YYYY-MM-01) yang digabung. */
  months?: string[]
  /** Untuk gabungan: bulan di rentang yang belum punya data iklan 1 bulan penuh. */
  missingMonths?: string[]
}

export interface Loaded {
  /** Target untung toko yang dipakai untuk analisis ini (bawaan 5% setelah iklan, 20% sebelum iklan). */
  targets: Targets
  analysis: AdsAnalysis
  feeRate: number
  feeFrom: string | null
  hasOrders: boolean
  /** Untuk gabungan beberapa bulan: hasil per bulan. */
  perMonth?: { month: string; analysis: AdsAnalysis }[]
}

/** Muat & hitung analisis iklan satu periode tersimpan (dipakai halaman Iklan dan bab Iklan di Rekap). */
export function loadAdsAnalysis(storeId: number, period: Period): Promise<Loaded> {
  return buildAdsAnalysis(storeId, period.start, period.end, fetchAdRows(period.reports), period.months)
}

/** Data toko yang dibutuhkan analisis iklan untuk satu rentang tanggal (dimuat sekali). */
export interface AdsContext {
  start: string
  end: string
  items: Awaited<ReturnType<typeof fetchItemsCreatedBetween>>
  products: Awaited<ReturnType<typeof fetchProducts>>
  incomeDays: Awaited<ReturnType<typeof fetchIncomeDays>>
  categories: Awaited<ReturnType<typeof fetchFeeCategories>>
  settingsRow: Awaited<ReturnType<typeof fetchStoreSettings>> | null
}

export async function loadAdsContext(storeId: number, start: string, end: string): Promise<AdsContext> {
  const monthStart = `${start.slice(0, 7)}-01`
  const lastMonth = `${end.slice(0, 7)}-01`
  const [items, products, incomeDays, categories, settingsRow] = await Promise.all([
    fetchItemsCreatedBetween(storeId, start, end),
    fetchProducts(storeId),
    fetchIncomeDays(storeId, addMonths(monthStart, -3), monthEnd(lastMonth)),
    // Kategori admin belum tentu ada (SQL 20261014 belum dijalankan): tanpa itu, hanya isian manual yang dipakai.
    fetchFeeCategories(storeId).catch(() => []),
    // Belum ada pengaturan / SQL 20261015 belum dijalankan: target bawaan.
    fetchStoreSettings(storeId).catch(() => null),
  ])
  return { start, end, items, products, incomeDays, categories, settingsRow }
}

/**
 * Hitung analisis dari file iklan yang TIDAK disimpan (Cek cepat), memakai data toko yang sudah dimuat.
 * `tempHpp` = HPP sementara per nama listing untuk produk yang belum punya HPP. Tidak ada yang ditulis ke database.
 */
export function analyzeUnsavedAds(ctx: AdsContext, files: AdsParseResult[], tempHpp?: Map<string, number>): Loaded {
  const reports: AdReportRows[] = files.map((f) => ({ source: f.source, rows: f.rows, period: `${ctx.start}|${ctx.end}` }))
  return computeAdsAnalysis(ctx, reports, undefined, tempHpp)
}

async function buildAdsAnalysis(
  storeId: number,
  start: string,
  end: string,
  loadReports: Promise<AdReportRows[]>,
  months?: string[],
): Promise<Loaded> {
  const [reports, ctx] = await Promise.all([loadReports, loadAdsContext(storeId, start, end)])
  return computeAdsAnalysis(ctx, reports, months)
}

function computeAdsAnalysis(
  ctx: AdsContext,
  reports: AdReportRows[],
  months?: string[],
  tempHpp?: Map<string, number>,
): Loaded {
  const { start, end, items, products, incomeDays, categories, settingsRow } = ctx
  const monthStart = `${start.slice(0, 7)}-01`
  const lastMonth = `${end.slice(0, 7)}-01`
  const targets = targetsOf(resolveSettings(settingsRow))
  const feeComponents = productFeeComponents(products, categories)

  // Potongan Shopee: bulan periode iklan; kalau belum ada, 3 bulan sebelumnya; kalau tidak ada juga, 15%.
  const inPeriod = incomeDays.filter((d) => d.released_date >= monthStart)
  let feeRate = feeRateFromIncome(inPeriod)
  let feeFrom: string | null = null
  if (feeRate !== null) {
    feeFrom = monthStart === lastMonth ? formatMonth(monthStart) : `${formatMonth(monthStart)} – ${formatMonth(lastMonth)}`
  } else {
    feeRate = feeRateFromIncome(incomeDays)
    if (feeRate !== null) feeFrom = '3 bulan sebelumnya'
  }

  const hppBySku = new Map(products.map((p) => [p.sku, p.hpp === null ? null : Number(p.hpp)]))
  const fallback = new Map<string, number[]>()
  for (const p of products) {
    if (p.hpp === null) continue
    const k = productKey(p.product_name)
    fallback.set(k, [...(fallback.get(k) ?? []), Number(p.hpp)])
  }
  const fallbackHpp = new Map([...fallback].map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length]))

  const toLine = (i: (typeof items)[number]) => ({
    product_name: i.product_name,
    status_group: i.status_group,
    qty: Number(i.qty),
    returned_qty: Number(i.returned_qty ?? 0),
    subtotal: Number(i.subtotal),
    hpp: i.hpp_snapshot !== null ? Number(i.hpp_snapshot) : (hppBySku.get(i.sku) ?? null),
  })
  const rate = feeRate ?? DEFAULT_FEE_RATE
  const analysis = analyzeAds({ reports, orders: items.map(toLine), feeRate: rate, fallbackHpp, feeComponents, targets, tempHpp })
  // Gabungan: hitung juga per bulan (data iklan & pesanan bulan itu saja) untuk dibandingkan.
  const perMonth =
    months && months.length > 1
      ? months.map((m) => ({
          month: m,
          analysis: analyzeAds({
            reports: reports.filter((r) => r.period === `${m}|${monthEnd(m)}`),
            orders: items.filter((i) => i.created_at && wibDay(i.created_at).slice(0, 7) === m.slice(0, 7)).map(toLine),
            feeRate: rate,
            fallbackHpp,
            feeComponents,
            targets,
          }),
        }))
      : undefined
  return { targets, analysis, feeRate: rate, feeFrom, hasOrders: items.length > 0, perMonth }
}

