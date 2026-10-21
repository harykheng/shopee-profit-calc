// Analisis iklan per produk: ROAS nyata, ROAS balik modal, ROAS saran, dan label.
// Fungsi murni (tanpa Supabase) supaya bisa dites.
import type { AdRow } from './parsers/ads'
import type { AdSource, StatusGroup } from './shopeeColumns'
import { ADS_CSV } from './shopeeColumns'

/** Target untung bersih setelah iklan (5% dari harga jual). Bawaan; tiap toko boleh mengubahnya (store_settings). */
export const ADS_TARGET_PROFIT = 0.05
/** Target untung harga jual setelah potongan Shopee, sebelum iklan & packaging. Bawaan; bisa diubah per toko. */
export const PRICE_TARGET_MARGIN = 0.2

/** Target untung yang dipakai semua hitungan saran (pecahan 0–1). */
export interface Targets {
  /** Untung bersih yang diinginkan setelah iklan, dari harga jual. */
  adsProfit: number
  /** Untung yang diinginkan dari harga jual, setelah potongan Shopee dan sebelum iklan. */
  priceMargin: number
}

export const DEFAULT_TARGETS: Targets = { adsProfit: ADS_TARGET_PROFIT, priceMargin: PRICE_TARGET_MARGIN }
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
  /** Qty yang diretur (pesanan tetap Selesai). Tidak diisi = 0. */
  returned_qty?: number
  subtotal: number
  /** HPP per unit (snapshot, atau HPP produk sekarang). */
  hpp: number | null
}

export interface AdProductResult {
  code: string
  name: string
  spend: number
  clicks: number
  /** Terjual & omzet versi Shopee (termasuk pesanan batal dan retur). */
  adsSold: number
  adsGmv: number
  shopeeRoas: number | null
  /** Ada pesanan untuk produk ini di periode iklan. */
  hasOrders: boolean
  /** Porsi pesanan batal (0–1) dari data pesanan. */
  batalShare: number
  batalQty: number
  /** Qty yang diretur dari pesanan yang tidak batal. */
  returQty: number
  /** Porsi yang tidak jadi penjualan (0–1): batal + retur. Dipakai untuk ROAS nyata & cadangan target ROAS. */
  lostShare: number
  /** Setelah dikurangi pesanan batal dan retur. */
  netSold: number
  netGmv: number
  realRoas: number | null
  /** Harga jual rata-rata per barang (dari pesanan; kalau tidak ada, dari data iklan). */
  price: number | null
  /** Asal harga jual: rata-rata subtotal export pesanan, atau perkiraan omzet ÷ terjual dari data iklan. */
  priceSource: 'pesanan' | 'iklan' | null
  hpp: number | null
  /** HPP diambil dari isian sementara (Cek cepat), bukan dari halaman HPP. */
  hppTemp: boolean
  /** Sebagian pesanan belum ada HPP-nya. */
  hppIncomplete: boolean
  /** Potongan Shopee (0–1) yang dipakai untuk produk ini: asli dari laporan, atau rata-rata toko yang disesuaikan admin produk. */
  feeRate: number
  /**
   * 'aktual' = potongan asli produk ini dari laporan Excel "Sudah Dilepas" (dicocokkan lewat Kode Produk);
   * 'produk' = rata-rata toko digeser sesuai admin produk/kategori;
   * 'rata-rata' = rata-rata toko apa adanya (belum diisi, atau belum ada produk lain sebagai pembanding).
   */
  feeSource: 'aktual' | 'produk' | 'rata-rata'
  /** Sisa per barang setelah potongan Shopee dan HPP (sebelum iklan). */
  unitProfit: number | null
  margin: number | null
  /** ROAS minimal supaya tidak rugi. null = tidak mungkin (sudah rugi tanpa iklan). */
  bepRoas: number | null
  /** ROAS nyata supaya untung 5%. null = tidak mungkin (margin ≤ 5%). */
  targetRoas: number | null
  /** Angka target ROAS untuk diisi di Shopee (Shopee ikut menghitung pesanan batal dan retur). */
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
 * - `shopeeTargetRoas`: angka untuk diisi di Shopee, dengan cadangan pesanan batal & retur
 *   (Shopee ikut menghitung keduanya); null = tidak mungkin.
 * `margin` = untung per barang (sebelum iklan) ÷ harga jual; `batalShare` = porsi batal + retur (0–1).
 */
export function targetRoasFromMargin(
  margin: number | null,
  batalShare = 0,
  adsProfit = ADS_TARGET_PROFIT,
): { targetRoas: number | null; shopeeTargetRoas: number | null } {
  const rawTarget = margin !== null && margin > adsProfit ? 1 / (margin - adsProfit) : null
  const targetRoas = rawTarget !== null && rawTarget <= MAX_TARGET_ROAS ? rawTarget : null
  const shopeeTarget = targetRoas !== null && batalShare < 1 ? targetRoas / (1 - batalShare) : null
  const shopeeTargetRoas = shopeeTarget !== null && shopeeTarget <= MAX_TARGET_ROAS ? shopeeTarget : null
  return { targetRoas, shopeeTargetRoas }
}

/** Potongan per produk tidak boleh keluar dari rentang masuk akal setelah disesuaikan. */
const MAX_PRODUCT_FEE_RATE = 0.9

/** Minimal baris pesanan per produk sebelum potongan aslinya dipakai (1–2 pesanan bisa kebetulan kena voucher). */
export const MIN_LINES_FOR_ACTUAL_FEE = 3

/**
 * Potongan Shopee asli (0–1) per ID Produk (= Kode Produk di data iklan), dari laporan Excel "Sudah Dilepas".
 * Pakai bulan periode iklan; kalau di periode itu produknya kurang dari MIN_LINES_FOR_ACTUAL_FEE pesanan,
 * pakai semua bulan yang diberikan (biasanya ditambah 3 bulan sebelumnya). Masih kurang = tidak ada di hasil.
 */
export function actualFeeRates(
  rows: { month: string; product_id: string; lines: number; harga_produk: number; total_income: number }[],
  periodFrom: string,
): Map<string, number> {
  const sum = (list: typeof rows) => {
    const out = new Map<string, { lines: number; harga: number; income: number }>()
    for (const r of list) {
      const e = out.get(r.product_id) ?? { lines: 0, harga: 0, income: 0 }
      e.lines += Number(r.lines)
      e.harga += Number(r.harga_produk)
      e.income += Number(r.total_income)
      out.set(r.product_id, e)
    }
    return out
  }
  const inPeriod = sum(rows.filter((r) => r.month >= periodFrom))
  const all = sum(rows)
  const rates = new Map<string, number>()
  for (const [id, total] of all) {
    const e = (inPeriod.get(id)?.lines ?? 0) >= MIN_LINES_FOR_ACTUAL_FEE ? inPeriod.get(id)! : total
    if (e.lines < MIN_LINES_FOR_ACTUAL_FEE || e.harga <= 0) continue
    rates.set(id, Math.min(Math.max(1 - e.income / e.harga, 0), MAX_PRODUCT_FEE_RATE))
  }
  return rates
}

/**
 * Porsi potongan (admin + XTRA, 0–1) yang dipakai sebagai pembanding: rata-rata produk yang sudah
 * diketahui, ditimbang nilai penjualannya di periode ini. Itulah porsi yang "tertanam" di potongan
 * rata-rata toko, jadi selisih tiap produk terhadapnya yang menggeser potongan produk itu.
 */
export function referenceFeeComponent(
  components: Map<string, number>,
  salesByKey: Map<string, number>,
): number | null {
  if (components.size === 0) return null
  let weighted = 0
  let weights = 0
  for (const [key, c] of components) {
    const w = salesByKey.get(key) ?? 0
    weighted += w * c
    weights += w
  }
  if (weights > 0) return weighted / weights
  // Belum ada penjualan untuk produk yang diketahui: rata-rata biasa.
  return [...components.values()].reduce((s, c) => s + c, 0) / components.size
}

const ORDER: Record<AdVerdict, number> = { takedown: 0, kurang: 1, hpp_kosong: 2, hero: 3, aman: 4, belum_cukup: 5 }

export function analyzeAds(input: {
  reports: AdReportRows[]
  orders: AdOrderLine[]
  feeRate: number
  /** HPP per produk (nama listing) untuk produk tanpa pesanan di periode ini. */
  fallbackHpp?: Map<string, number>
  /**
   * Porsi potongan admin + XTRA (0–1) per nama produk, hanya untuk produk yang sudah diisi.
   * Potongan produk = rata-rata toko + (porsi produk − porsi pembanding). Produk yang tidak ada
   * di sini memakai rata-rata toko apa adanya. Kosong/tidak diisi = semua produk memakai rata-rata toko.
   */
  feeComponents?: Map<string, number>
  /** Target untung toko; kosong = bawaan. */
  targets?: Targets
  /** HPP sementara per nama listing (Cek cepat), dipakai hanya kalau HPP dari pesanan/produk kosong. */
  tempHpp?: Map<string, number>
  /** Potongan asli per Kode Produk (lihat actualFeeRates). Kalau ada, menggantikan feeRate + feeComponents. */
  actualFees?: Map<string, number>
}): AdsAnalysis {
  const { reports, orders, feeRate } = input
  const targets = input.targets ?? DEFAULT_TARGETS
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

  // --- Potongan per produk (lihat feeComponents).
  const salesByKey = new Map<string, number>()
  for (const [k, lines] of ordersByKey) {
    salesByKey.set(
      k,
      lines.filter((l) => l.status_group !== 'batal').reduce((s, l) => s + l.subtotal, 0),
    )
  }
  const components = input.feeComponents ?? new Map<string, number>()
  const refComponent = referenceFeeComponent(components, salesByKey)

  const products: AdProductResult[] = []
  for (const [code, a] of agg) {
    if (a.spend <= 0) continue
    const key = productKey(a.name)
    const component = components.get(key)
    const actualFee = input.actualFees?.get(code)
    const productFee =
      actualFee !== undefined
        ? actualFee
        : component !== undefined && refComponent !== null
          ? Math.min(Math.max(feeRate + component - refComponent, 0), MAX_PRODUCT_FEE_RATE)
          : feeRate
    const lines = ordersByKey.get(key) ?? []
    const allQty = lines.reduce((s, l) => s + l.qty, 0)
    const kept = lines.filter((l) => l.status_group !== 'batal')
    const keptQty = kept.reduce((s, l) => s + l.qty, 0)
    const batalQty = allQty - keptQty
    const batalShare = allQty > 0 ? batalQty / allQty : 0
    // Retur: pesanan tetap Selesai, tapi barangnya kembali dan uangnya tidak jadi. Shopee tetap menghitungnya
    // sebagai konversi iklan, jadi dikurangi seperti pesanan batal.
    const returQty = kept.reduce((s, l) => s + Math.min(Math.max(l.returned_qty ?? 0, 0), l.qty), 0)
    const lostShare = allQty > 0 ? (batalQty + returQty) / allQty : 0
    const netSold = a.sold * (1 - lostShare)
    const netGmv = a.gmv * (1 - lostShare)

    const keptSubtotal = kept.reduce((s, l) => s + l.subtotal, 0)
    const priceSource = keptQty > 0 ? 'pesanan' : a.sold > 0 ? 'iklan' : null
    const price = priceSource === 'pesanan' ? keptSubtotal / keptQty : priceSource === 'iklan' ? a.gmv / a.sold : null

    // HPP rata-rata tertimbang qty (pesanan yang tidak batal; kalau tidak ada, semua pesanan).
    const hppLines = (kept.length > 0 ? kept : lines).filter((l) => l.qty > 0)
    const withHpp = hppLines.filter((l) => l.hpp !== null)
    const hppQty = withHpp.reduce((s, l) => s + l.qty, 0)
    let hpp = hppQty > 0 ? withHpp.reduce((s, l) => s + l.qty * (l.hpp as number), 0) / hppQty : null
    if (hpp === null && hppLines.length === 0) hpp = input.fallbackHpp?.get(productKey(a.name)) ?? null
    const tempValue = hpp === null ? input.tempHpp?.get(productKey(a.name)) : undefined
    const hppTemp = tempValue !== undefined
    if (hppTemp) hpp = tempValue
    // Hanya relevan kalau ada barang yang benar-benar terjual.
    const hppIncomplete = kept.length > 0 && withHpp.length < hppLines.length

    const unitProfit = price !== null && hpp !== null ? price * (1 - productFee) - hpp : null
    const margin = unitProfit !== null && price ? unitProfit / price : null
    const bepRoas = margin !== null && margin > 0 ? 1 / margin : null
    const { targetRoas, shopeeTargetRoas } = targetRoasFromMargin(margin, lostShare, targets.adsProfit)
    const realRoas = a.spend > 0 ? netGmv / a.spend : null
    const profitAfterAds = unitProfit !== null ? netSold * unitProfit - a.spend : null
    // Penyebut ≤ 0 (potongan + target untung ≥ 100%) = tidak ada harga yang memenuhi target.
    const idealDenominator = 1 - productFee - targets.priceMargin
    const idealPrice =
      hpp !== null && margin !== null && margin < targets.priceMargin && idealDenominator > 0
        ? hpp / idealDenominator
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
      returQty,
      lostShare,
      netSold,
      netGmv,
      realRoas,
      price,
      priceSource,
      hpp,
      hppTemp,
      hppIncomplete,
      feeRate: productFee,
      // Dengan hanya satu produk yang diketahui tidak ada pembanding, jadi potongannya tidak bergeser:
      // jujur disebut rata-rata toko.
      feeSource: actualFee !== undefined ? 'aktual' : component !== undefined && components.size >= 2 ? 'produk' : 'rata-rata',
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
  /** Target untung toko; kosong = bawaan (5% setelah iklan, 20% sebelum iklan). */
  targets?: Targets
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
  const targets = input.targets ?? DEFAULT_TARGETS
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
    targetRoas: profitable ? targetRoasFromMargin(margin, 0, targets.adsProfit).shopeeTargetRoas : null,
    priceBreakEven: priceFor(adShare),
    priceTargetProfit: priceFor(adShare + targets.adsProfit),
    priceTargetMargin: priceFor(targets.priceMargin),
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
  /** Target untung toko; kosong = bawaan. */
  targets?: Targets
}): AdGroupResult {
  const targets = input.targets ?? DEFAULT_TARGETS
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
      targets,
    })
    const estimated = r.qty === null
    return {
      profit: sim.profit,
      margin: sim.margin,
      bepRoas: sim.bepRoas,
      targetRoas: sim.profitable ? targetRoasFromMargin(sim.margin, 0, targets.adsProfit).shopeeTargetRoas : null,
      weight: estimated ? fallbackWeight : Math.max(0, r.qty ?? 0),
      weightEstimated: estimated,
    }
  })

  const gmv = input.rows.reduce((s, r, i) => s + r.price * rows[i].weight, 0)
  const profit = rows.reduce((s, r) => s + r.profit * r.weight, 0)
  const mixMargin = gmv > 0 ? profit / gmv : null
  const mixBepRoas = mixMargin !== null && profit > 0 ? gmv / profit : null
  const mixTargetRoas =
    mixMargin !== null && profit > 0 ? targetRoasFromMargin(mixMargin, 0, targets.adsProfit).shopeeTargetRoas : null
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

// --- Saran harga dari modal (produk baru, harga belum ditentukan) ---------------

export type PriceLadderTag = 'balik_modal' | 'disarankan' | 'untung_20'

export interface PriceLadderRow {
  price: number
  tags: PriceLadderTag[]
  /** Untung per order sebelum iklan dan marginnya. */
  profit: number
  margin: number
  /** ROAS balik modal; null kalau harga ini sudah rugi tanpa iklan. */
  bepRoas: number | null
  /** Target ROAS untuk diisi di Shopee (untung 5% setelah iklan); null = tidak mungkin. */
  targetRoas: number | null
  /** Untung per order kalau iklan mendapat ROAS realistis. */
  profitAtRealistic: number
}

/**
 * Pilihan harga jual untuk satu modal: harga balik modal & harga yang disarankan
 * (untung 5% setelah iklan di ROAS realistis), harga untung 20%, lalu beberapa harga
 * di atasnya (+10%, +20%, +50% dari harga yang disarankan). Semua dibulatkan ke atas ke Rp1.000.
 */
export function priceLadder(input: Omit<PriceSimInput, 'price' | 'actualRoas'>): {
  recommended: number | null
  rows: PriceLadderRow[]
} {
  const base = simulatePrice({ ...input, price: 1 })
  const be = base.priceBreakEven?.rounded ?? null
  const rec = base.priceTargetProfit?.rounded ?? null
  const m20 = base.priceTargetMargin?.rounded ?? null
  const anchor = rec ?? m20
  const candidates = new Set<number>()
  for (const p of [be, rec, m20]) if (p !== null && p > 0) candidates.add(p)
  if (anchor !== null) for (const f of [1.1, 1.2, 1.5]) candidates.add(roundUpToThousand(anchor * f))
  const rows = [...candidates]
    .sort((a, b) => a - b)
    .map((price): PriceLadderRow => {
      const r = simulatePrice({ ...input, price })
      const tags: PriceLadderTag[] = []
      if (price === be) tags.push('balik_modal')
      if (price === rec) tags.push('disarankan')
      if (price === m20) tags.push('untung_20')
      return {
        price,
        tags,
        profit: r.profit,
        margin: r.margin,
        bepRoas: r.bepRoas,
        targetRoas: r.targetRoas,
        profitAtRealistic: r.profit - price / input.realisticRoas,
      }
    })
  return { recommended: rec, rows }
}
