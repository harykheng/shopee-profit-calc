// Calon iklan: produk yang BELUM diiklankan tapi sudah laku tanpa iklan dan untungnya cukup untuk membayar iklan.
// Fungsi murni (tanpa Supabase) supaya bisa dites.
//
// Batasan yang disengaja: aplikasi tidak punya data dilihat/klik/konversi per produk, jadi hasil ini hanya menjawab
// "untungnya cukup untuk diiklankan?", bukan "pasti laku kalau diiklankan". Bukti permintaan yang dipakai hanya
// penjualan tanpa iklan di periode yang sama.
import {
  DEFAULT_TARGETS,
  MIN_SALES_FOR_VERDICT,
  orderLineStats,
  productKey,
  referenceFeeComponent,
  resolveProductFee,
  targetRoasFromMargin,
  type AdOrderLine,
  type AdProductResult,
  type AdsAnalysis,
  type Targets,
} from './adsMath'

/** Batal + retur di atas porsi ini: iklan ikut membayar pesanan yang tidak jadi, jadi tidak disarankan dulu. */
export const MAX_LOST_SHARE_FOR_ADS = 0.2

export type CandidateStatus =
  /** Target ROAS ≤ ROAS nyata iklan toko periode ini. */
  | 'layak'
  /** Target ROAS lebih tinggi dari ROAS nyata iklan toko: butuh iklan yang lebih bagus dari rata-rata. */
  | 'berat'
  /** Untung per barang ≤ target untung setelah iklan: iklan pasti di bawah target. */
  | 'tidak_mungkin'
  | 'banyak_retur'
  | 'hpp_kosong'
  /** Terjual kurang dari MIN_SALES_FOR_VERDICT. */
  | 'sedikit'

export interface AdCandidate {
  name: string
  /** Terjual bersih (tanpa batal & retur) di periode ini, tanpa iklan. */
  sold: number
  price: number | null
  hpp: number | null
  hppIncomplete: boolean
  feeRate: number
  feeSource: AdProductResult['feeSource']
  unitProfit: number | null
  margin: number | null
  lostShare: number
  /** ROAS nyata minimal supaya untung sesuai target toko setelah iklan. */
  targetRoas: number | null
  /** Angka untuk diisi di Shopee (dengan cadangan batal & retur). */
  shopeeTargetRoas: number | null
  status: CandidateStatus
}

export interface AdCandidates {
  /** ROAS nyata iklan toko periode ini, sebagai patokan ROAS yang biasanya tercapai. null = belum ada pembanding. */
  referenceRoas: number | null
  /** Semua produk terjual yang belum diiklankan, urut: layak, berat, lalu sisanya. */
  candidates: AdCandidate[]
  /**
   * Ada biaya iklan yang belum dirinci per produk (mis. GMV Max/grup tanpa file rinciannya), jadi sebagian produk
   * di sini mungkin sebenarnya sudah ikut diiklankan.
   */
  maybeAdvertised: boolean
}

const STATUS_ORDER: Record<CandidateStatus, number> = {
  layak: 0,
  berat: 1,
  tidak_mungkin: 2,
  banyak_retur: 3,
  hpp_kosong: 4,
  sedikit: 5,
}

export function findAdCandidates(input: {
  orders: AdOrderLine[]
  /** Hasil analyzeAds periode yang sama: produk yang sudah diiklankan dilewati. */
  analysis: AdsAnalysis
  feeRate: number
  /** Porsi admin + XTRA per nama produk (sama dengan analyzeAds). */
  feeComponents?: Map<string, number>
  /** Potongan asli per ID Produk (actualFeeRates). */
  actualFees?: Map<string, number>
  /** ID Produk per kunci nama produk (productKey), dari laporan penghasilan. */
  productIds?: Map<string, string>
  targets?: Targets
}): AdCandidates {
  const targets = input.targets ?? DEFAULT_TARGETS
  const a = input.analysis
  // Iklan yang punya biaya, termasuk yang belum ada penjualannya.
  const advertised = new Set(a.products.filter((p) => p.spend > 0).map((p) => productKey(p.name)))
  const referenceRoas = a.realRoas !== null && a.realRoas > 0 ? a.realRoas : null

  const byKey = new Map<string, { name: string; lines: AdOrderLine[] }>()
  for (const o of input.orders) {
    const k = productKey(o.product_name)
    const e = byKey.get(k)
    if (e) e.lines.push(o)
    else byKey.set(k, { name: o.product_name.replace(/\s*\[\d+\]\s*$/, '').trim(), lines: [o] })
  }

  const components = input.feeComponents ?? new Map<string, number>()
  const salesByKey = new Map<string, number>()
  for (const [k, { lines }] of byKey) {
    salesByKey.set(k, lines.filter((l) => l.status_group !== 'batal').reduce((s, l) => s + l.subtotal, 0))
  }
  const refComponent = referenceFeeComponent(components, salesByKey)

  const candidates: AdCandidate[] = []
  for (const [key, { name, lines }] of byKey) {
    if (advertised.has(key)) continue
    const stats = orderLineStats(lines)
    const sold = stats.keptQty - stats.returQty
    if (sold <= 0) continue
    const id = input.productIds?.get(key)
    const fee = resolveProductFee({
      feeRate: input.feeRate,
      actualFee: id !== undefined ? input.actualFees?.get(id) : undefined,
      component: components.get(key),
      refComponent,
      componentsCount: components.size,
    })
    const { price, hpp } = stats
    const unitProfit = price !== null && hpp !== null ? price * (1 - fee.rate) - hpp : null
    const margin = unitProfit !== null && price ? unitProfit / price : null
    const { targetRoas, shopeeTargetRoas } = targetRoasFromMargin(margin, stats.lostShare, targets.adsProfit)

    let status: CandidateStatus
    if (sold < MIN_SALES_FOR_VERDICT) status = 'sedikit'
    else if (unitProfit === null) status = 'hpp_kosong'
    else if (targetRoas === null || shopeeTargetRoas === null) status = 'tidak_mungkin'
    else if (stats.lostShare > MAX_LOST_SHARE_FOR_ADS) status = 'banyak_retur'
    else status = referenceRoas === null || targetRoas <= referenceRoas ? 'layak' : 'berat'

    candidates.push({
      name,
      sold,
      price,
      hpp,
      hppIncomplete: stats.hppIncomplete,
      feeRate: fee.rate,
      feeSource: fee.source,
      unitProfit,
      margin,
      lostShare: stats.lostShare,
      targetRoas,
      shopeeTargetRoas,
      status,
    })
  }

  candidates.sort((x, y) => {
    const byStatus = STATUS_ORDER[x.status] - STATUS_ORDER[y.status]
    if (byStatus !== 0) return byStatus
    // Layak: yang paling laku tanpa iklan dulu (bukti permintaan), lalu yang target ROAS-nya paling ringan.
    if (x.status === 'layak') return y.sold - x.sold || (x.targetRoas ?? 0) - (y.targetRoas ?? 0)
    // Berat: yang paling dekat ke ROAS toko dulu.
    if (x.status === 'berat') return (x.targetRoas ?? 0) - (y.targetRoas ?? 0)
    return y.sold - x.sold
  })

  return { referenceRoas, candidates, maybeAdvertised: a.unallocated.length > 0 }
}
