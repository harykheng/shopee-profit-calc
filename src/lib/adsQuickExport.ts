// Ringkasan Cek cepat iklan sebagai file Markdown, untuk dibagikan ke Claude (atau AI lain) supaya pemakai bisa
// bertanya lebih dalam. Fungsi murni: tidak ada data pembeli, hanya angka per produk yang sudah dihitung aplikasi.
import type { AdProductResult, AdVerdict, AdsAnalysis, Targets } from './adsMath'
import { formatDate, formatNumber, formatPercent, formatRupiah } from './format'

/** Label Cek cepat (versi keputusan lanjut / stop). Dipakai di tampilan dan di file .md. */
export const QUICK_VERDICT: Record<AdVerdict, { label: string; note: string }> = {
  hero: { label: 'Lanjut', note: 'ROAS jauh di atas target. Iklan jalan bagus.' },
  aman: { label: 'Lanjut', note: 'ROAS sudah di atas target untung.' },
  kurang: { label: 'Lanjut, pantau', note: 'Sudah balik modal, tapi belum mencapai target untung.' },
  takedown: { label: 'Stop', note: 'Biaya iklan sudah lebih besar dari untung yang dihasilkan.' },
  belum_cukup: { label: 'Belum cukup data', note: 'Penjualannya masih terlalu sedikit untuk dinilai.' },
  hpp_kosong: { label: 'Isi HPP', note: 'HPP belum diisi, jadi untungnya belum bisa dihitung.' },
}

/** Urutan tampil produk: yang perlu tindakan dulu. */
export const QUICK_ORDER: AdVerdict[] = ['takedown', 'kurang', 'hpp_kosong', 'belum_cukup', 'aman', 'hero']

/** Produk berbiaya iklan, urut sesuai QUICK_ORDER lalu biaya terbesar. */
export function quickProducts(analysis: AdsAnalysis): AdProductResult[] {
  return [...analysis.products]
    .filter((p) => p.spend > 0)
    .sort((a, b) => QUICK_ORDER.indexOf(a.verdict) - QUICK_ORDER.indexOf(b.verdict) || b.spend - a.spend)
}

export interface QuickExportPeriod {
  start: string
  end: string
  days: number
  analysis: AdsAnalysis
  targets: Targets
  hasOrders: boolean
}

export const formatRoas = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '–'
    : new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)

const periodText = (p: { start: string; end: string; days: number }) =>
  `${formatDate(p.start)} – ${formatDate(p.end)} (${p.days} hari)`

/** Isi sel tabel Markdown: tanpa garis tegak dan baris baru yang merusak tabel. */
const cell = (text: string) => text.replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim()

const FEE_SOURCE: Record<AdProductResult['feeSource'], string> = {
  aktual: 'asli produk ini',
  produk: 'rata-rata toko, disesuaikan admin produk',
  'rata-rata': 'rata-rata toko',
}

/** Tabel Markdown; `textCols` kolom pertama rata kiri, sisanya (angka) rata kanan. */
function table(out: string[], head: string[], textCols: number, rows: string[][]) {
  out.push(`| ${head.join(' | ')} |`)
  out.push(`|${head.map((_, i) => (i < textCols ? '---' : '---:')).join('|')}|`)
  for (const r of rows) out.push(`| ${r.join(' | ')} |`)
}

/** Nama file .md: huruf kecil, tanpa spasi/tanda baca. */
export function quickExportFileName(storeName: string, end: string): string {
  const slug = storeName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `cek-cepat-iklan-${slug || 'toko'}-${end}.md`
}

/**
 * Bangun file Markdown dari hasil Cek cepat. `periods` urut lama → baru (maks. 2); yang terakhir dirinci per
 * produk, yang sebelumnya dipakai sebagai pembanding.
 */
export function buildQuickExport(input: { storeName: string; createdAt: string; periods: QuickExportPeriod[] }): string {
  const { storeName, createdAt, periods } = input
  const latest = periods[periods.length - 1]
  if (!latest) return ''
  const previous = periods.length > 1 ? periods[0] : null
  const target = latest.targets.adsProfit * 100
  const out: string[] = []

  out.push(`# Cek cepat iklan Shopee: ${cell(storeName)}`)
  out.push('')
  out.push(
    `Dibuat ${formatDate(createdAt)} dari aplikasi hitung untung toko. Periode terbaru: ${periodText(latest)}` +
      (previous ? `. Pembanding: ${periodText(previous)}.` : '.'),
  )
  out.push('')
  out.push('Saya penjual Shopee. Tolong bantu saya membaca hasil iklan di bawah dan memutuskan langkah berikutnya.')
  out.push('Jawab dalam Bahasa Indonesia yang sederhana.')
  out.push('')

  out.push('## Penting dibaca dulu')
  out.push('')
  out.push(
    `- **Data ini hanya ${latest.days} hari, jadi angkanya cenderung terlalu bagus.** Pesanan yang batal atau ` +
      'diretur biasanya baru kelihatan 1–2 minggu kemudian dan belum ikut dikurangi. Pakai untuk melihat arah, ' +
      'bukan untung akhir. Jangan menyarankan menaikkan budget besar-besaran hanya dari data ini.',
  )
  if (!latest.hasOrders) {
    out.push(
      '- **Export pesanan untuk tanggal ini belum di-upload**, jadi pesanan batal dan retur belum dikurangi sama ' +
        'sekali. ROAS nyata di bawah = ROAS Shopee dan harga jual diperkirakan dari data iklan.',
    )
  }
  out.push(
    '- **Semua angka sudah dihitung aplikasi** dengan HPP, potongan Shopee, dan target untung toko saya. ' +
      'Tolong pakai definisi di bagian "Cara membaca angka", jangan menghitung ulang dengan definisi ROAS umum.',
  )
  out.push('')

  out.push('## Cara membaca angka')
  out.push('')
  out.push('- **ROAS Shopee** = omzet iklan versi Shopee ÷ biaya iklan. Shopee ikut menghitung pesanan batal dan retur.')
  out.push('- **ROAS nyata** = omzet iklan setelah dikurangi pesanan batal dan retur ÷ biaya iklan.')
  out.push(
    '- **Untung per barang (sebelum iklan)** = harga jual × (1 − potongan Shopee) − HPP. ' +
      '**Margin** = untung per barang ÷ harga jual.',
  )
  out.push('- **Balik modal butuh ROAS** = 1 ÷ margin. ROAS nyata di bawah angka ini = iklan rugi.')
  out.push(
    `- **Target ROAS nyata** = 1 ÷ (margin − ${formatPercent(target)}): ROAS supaya untung bersih ` +
      `${formatPercent(target)} dari harga jual setelah iklan (target toko saya).`,
  )
  out.push(
    '- **Target ROAS isi di Shopee** = target ROAS nyata ÷ (1 − porsi batal & retur). Angka ini yang diisi di ' +
      'pengaturan target ROAS Shopee, karena Shopee menghitung pesanan batal dan retur.',
  )
  out.push('- **Untung setelah iklan** = terjual (nyata) × untung per barang − biaya iklan.')
  out.push(
    '- **Vonis**: Stop = ROAS nyata di bawah balik modal (atau sudah habis biaya tanpa penjualan); Lanjut, pantau = ' +
      'sudah balik modal tapi belum capai target; Lanjut = di atas target; Belum cukup data = terjual kurang dari 3; ' +
      'Isi HPP = modal belum diketahui.',
  )
  out.push('- "–" = belum bisa dihitung; "tidak mungkin" = margin terlalu tipis, iklan tidak bisa untung di harga ini.')
  out.push('')

  out.push('## Ringkasan')
  out.push('')
  const summaryRows: [string, (a: AdsAnalysis) => string][] = [
    ['Biaya iklan', (a) => formatRupiah(a.totalSpend)],
    ['Omzet iklan (Shopee)', (a) => formatRupiah(a.adsGmv)],
    ['Omzet iklan (nyata)', (a) => formatRupiah(a.netGmv)],
    ['ROAS nyata', (a) => formatRoas(a.realRoas)],
    ['Untung sebelum iklan', (a) => formatRupiah(a.profitBeforeAds)],
    ['Untung setelah iklan', (a) => formatRupiah(a.profitAfterAds)],
    ['Produk terjual tanpa HPP', (a) => formatNumber(a.productsWithoutProfit)],
  ]
  if (previous) {
    out.push(`| | ${periodText(previous)} | ${periodText(latest)} |`)
    out.push('|---|---:|---:|')
    for (const [label, f] of summaryRows) out.push(`| ${label} | ${f(previous.analysis)} | ${f(latest.analysis)} |`)
  } else {
    out.push(`| | ${periodText(latest)} |`)
    out.push('|---|---:|')
    for (const [label, f] of summaryRows) out.push(`| ${label} | ${f(latest.analysis)} |`)
  }
  if (latest.analysis.spendFrom === 'rincian') {
    out.push('')
    out.push('Catatan: file "Data Keseluruhan" tidak ikut, jadi biaya iklan total mungkin belum lengkap.')
  }
  out.push('')

  const products = quickProducts(latest.analysis)
  const before = new Map((previous?.analysis.products ?? []).map((p) => [p.code, p]))
  out.push(`## Per produk: ${periodText(latest)}`)
  out.push('')
  if (products.length === 0) {
    out.push('Belum ada produk dengan biaya iklan di periode ini.')
  } else {
    out.push('Dua tabel dengan urutan produk yang sama: hasil iklannya dulu, lalu untung dan target ROAS-nya.')
    out.push('')
    out.push('### Hasil iklan')
    out.push('')
    table(
      out,
      [
        'Produk',
        'Kode Produk',
        'Vonis',
        'Biaya iklan',
        'Klik',
        'Biaya per klik',
        'Klik jadi pesanan',
        'Terjual nyata',
        'Terjual Shopee',
        'ROAS Shopee',
        'ROAS nyata',
        ...(previous ? ['ROAS nyata sebelumnya'] : []),
      ],
      3,
      products.map((p) => {
        const prev = before.get(p.code)
        return [
          cell(p.name),
          cell(p.code),
          QUICK_VERDICT[p.verdict].label,
          formatRupiah(p.spend),
          formatNumber(p.clicks),
          p.clicks > 0 ? formatRupiah(p.spend / p.clicks) : '–',
          p.clicks > 0 ? formatPercent((p.adsSold / p.clicks) * 100) : '–',
          formatNumber(Math.round(p.netSold)),
          formatNumber(p.adsSold),
          formatRoas(p.shopeeRoas),
          formatRoas(p.realRoas),
          ...(previous ? [prev ? formatRoas(prev.realRoas) : 'tidak diiklankan'] : []),
        ]
      }),
    )
    out.push('')
    out.push('### Untung & target ROAS')
    out.push('')
    table(
      out,
      [
        'Produk',
        'Harga jual',
        'HPP',
        'Potongan Shopee',
        'Margin',
        'Untung per barang',
        'Balik modal butuh ROAS',
        'Target ROAS nyata',
        'Target ROAS isi di Shopee',
        'Untung setelah iklan',
      ],
      1,
      products.map((p) => {
        const tgt = (v: number | null) => (v !== null ? formatRoas(v) : p.margin === null ? '–' : 'tidak mungkin')
        return [
          cell(p.name),
          p.price === null ? '–' : `${formatRupiah(p.price)}${p.priceSource === 'iklan' ? ' (perkiraan)' : ''}`,
          p.hpp === null ? '–' : `${formatRupiah(p.hpp)}${p.hppTemp ? ' (sementara)' : ''}${p.hppIncomplete ? ' (sebagian)' : ''}`,
          `${formatPercent(p.feeRate * 100)} (${FEE_SOURCE[p.feeSource]})`,
          p.margin === null ? '–' : formatPercent(p.margin * 100),
          formatRupiah(p.unitProfit),
          p.bepRoas !== null ? formatRoas(p.bepRoas) : p.unitProfit === null ? '–' : 'tidak mungkin',
          tgt(p.targetRoas),
          tgt(p.shopeeTargetRoas),
          formatRupiah(p.profitAfterAds),
        ]
      }),
    )
    if (products.some((p) => p.hppTemp)) {
      out.push('')
      out.push('"(sementara)" = HPP perkiraan yang saya isi sendiri karena HPP resminya belum ada.')
    }
    if (products.some((p) => p.priceSource === 'iklan')) {
      out.push('')
      out.push('"(perkiraan)" = harga jual dihitung dari omzet ÷ terjual di data iklan, karena belum ada data pesanan.')
    }
  }
  out.push('')

  if (latest.analysis.unallocated.length > 0) {
    out.push('## Biaya iklan yang belum terbagi ke produk')
    out.push('')
    for (const u of latest.analysis.unallocated) {
      const need = u.need === 'grup' ? 'Semua Data Grup Iklan' : 'Rincian Iklan Produk Otomatis'
      out.push(`- ${cell(u.adName)}: ${formatRupiah(u.spend)} (file "${need}" belum ikut)`)
    }
    out.push('')
  }

  out.push('## Yang ingin saya tanyakan')
  out.push('')
  out.push('Mulai dari sini, lalu saya akan bertanya lebih lanjut:')
  out.push('')
  out.push('1. Produk mana yang sebaiknya saya stop, pantau, atau lanjutkan, dengan memperhitungkan datanya baru beberapa hari?')
  out.push('2. Untuk produk yang belum capai target, apa yang bisa dicoba dulu: target ROAS, harga, atau foto/judul (lihat klik jadi pesanan dan biaya per klik)?')
  if (previous) out.push('3. Apa yang berubah dibanding periode sebelumnya, dan apakah perubahannya cukup berarti?')
  out.push('')
  return out.join('\n')
}
