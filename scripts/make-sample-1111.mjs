// Membuat data sample PALSU untuk Cek cepat iklan: evaluasi kampanye 11.11.
// Dua periode 7 hari yang bisa dibandingkan di Cek cepat:
//   - Minggu biasa : 1–7 Nov 2026 (harga normal)
//   - Minggu 11.11 : 8–14 Nov 2026 (harga promo 11.11, puncak pesanan 10–12 Nov)
// Isi: export pesanan (.xlsx) 1–14 Nov + data iklan (.csv) "Data Keseluruhan" & "Iklan Produk Otomatis"
// per periode. Katalog, SKU, dan HPP sama dengan `npm run sample`, jadi pakai toko yang sudah berisi
// data sample Agustus–September (HPP & potongan Shopee diambil dari sana).
//
// Jalankan: npm run sample:1111 -- "Nama Toko"   (default "Toko Testing")
// Hasil di folder sample-store/cek-cepat-1111/ (di-gitignore). Semua data pembeli dan toko palsu.
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

const STORE = process.argv[2]?.trim() || 'Toko Testing'
const USERNAME = STORE.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tokotesting'
const OUT = path.resolve(import.meta.dirname, '../sample-store/cek-cepat-1111')
fs.mkdirSync(OUT, { recursive: true })

// PRNG deterministik: hasil selalu sama setiap dijalankan.
let seed = 20261111
function rand() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1))
const pick = (weighted) => {
  const total = weighted.reduce((s, w) => s + w.weight, 0)
  let r = rand() * total
  for (const w of weighted) if ((r -= w.weight) < 0) return w
  return weighted[weighted.length - 1]
}

// ---------------------------------------------------------------------------
// Katalog: sama dengan scripts/make-sample-store.mjs (+ harga promo 11.11 & 1 produk baru).
// promo = harga setelah diskon selama 8–14 Nov. batal1111 = peluang batal di minggu 11.11.
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { name: 'Serum Vitamin C Glow 20ml', skuRef: 'TT-SRM-VITC', skuInduk: 'TT-SRM-VITC', price: 59000, promo: 49000, list: 69000, hpp: 24000, weight: 10, gram: 60, adCode: '24810001' },
  { name: 'Toner Centella Calming 100ml', skuRef: 'TT-TNR-CICA', skuInduk: 'TT-TNR-CICA', price: 45000, promo: 39000, list: 45000, hpp: 17500, weight: 8, gram: 130, adCode: '24810002' },
  { name: 'Sunscreen Aqua SPF50 PA++++ 50ml', skuRef: 'TT-SUN-50', skuInduk: 'TT-SUN-50', price: 52000, promo: 40000, list: 58000, hpp: 21000, weight: 9, gram: 70, adCode: '24810003' },
  { name: 'Facial Wash Gentle Foam 100ml', skuRef: 'TT-FW-100', skuInduk: 'TT-FW-100', price: 32000, promo: 32000, list: 32000, hpp: 11000, weight: 7, gram: 120, adCode: '24810004' },
  { name: 'Lip Tint Velvet Matte 4gr', skuInduk: 'TT-LIP', variants: ['Cherry', 'Rose', 'Nude'], price: 29000, promo: 25000, list: 35000, hpp: 9500, weight: 9, gram: 20, adCode: '24810005' },
  { name: 'Masker Clay Mugwort 80gr', skuRef: 'TT-MSK-CLAY', skuInduk: 'TT-MSK-CLAY', price: 48000, promo: 42000, list: 48000, hpp: 19000, weight: 5, gram: 100, adCode: '24810006' },
  { name: 'Body Lotion Niacinamide 250ml', skuRef: 'TT-BL-250', skuInduk: 'TT-BL-250', price: 42000, promo: 42000, list: 42000, hpp: 15000, weight: 6, gram: 280, adCode: '24810007' },
  { name: 'Micellar Water Hydrating 300ml', skuRef: 'TT-MCW-300', skuInduk: 'TT-MCW-300', price: 38000, promo: 33000, list: 42000, hpp: 18500, weight: 5, gram: 330, adCode: '24810008' },
  { name: '[PAKET HEMAT] Serum Vitamin C + Toner Centella', skuRef: 'TT-PKT-01', skuInduk: 'TT-PKT-01', price: 95000, promo: 79000, list: 104000, hpp: 41500, weight: 5, gram: 190, adCode: '24810009', batal1111: 0.22 },
  { name: 'Sheet Mask Mix Isi 5', variants: ['Brightening', 'Hydrating'], price: 25000, promo: 25000, list: 25000, hpp: 8000, weight: 6, gram: 120, adCode: '24810010' },
  { name: 'Bedak Tabur Loose Powder 20gr', price: 35000, promo: 35000, list: 39000, hpp: 12500, weight: 4, gram: 40, adCode: '24810011' },
  { name: 'Hair Serum Argan Oil 50ml', skuRef: 'TT-HAIR-ARG', skuInduk: 'TT-HAIR-ARG', price: 36000, promo: 36000, list: 36000, hpp: 13000, weight: 2, gram: 70, adCode: '24810012' },
  // Produk baru khusus 11.11: belum ada di toko, jadi HPP-nya kosong → label "Isi HPP" di Cek cepat.
  { name: 'Glow Kit 11.11 Edisi Terbatas', skuRef: 'TT-KIT-1111', skuInduk: 'TT-KIT-1111', price: 89000, promo: 89000, list: 99000, hpp: null, tempHpp: 45000, weight: 0, weight1111: 4, gram: 250, adCode: '24810013', from: 8 },
]

// ---------------------------------------------------------------------------
// Tanggal (semua WIB)
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')
const dayStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const dtStr = (d) => `${dayStr(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
const addMin = (d, m) => new Date(d.getTime() + m * 60_000)
const wib = (y, mo, d, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi))

const PERIODS = [
  { key: 'biasa', label: 'Minggu biasa', from: 1, to: 7 },
  { key: '1111', label: 'Minggu 11.11', from: 8, to: 14 },
]
const periodOf = (day) => PERIODS.find((p) => day >= p.from && day <= p.to)
/** Pesanan per hari: minggu biasa stabil, minggu 11.11 memuncak di tanggal 11. */
const ORDERS_PER_DAY = { 1: 22, 2: 24, 3: 21, 4: 23, 5: 25, 6: 22, 7: 27, 8: 34, 9: 46, 10: 72, 11: 138, 12: 64, 13: 38, 14: 32 }
/** Export pesanan diambil 15 Nov pagi: pesanan minggu 11.11 banyak yang belum selesai. */
const CUTOFF = wib(2026, 11, 15, 8, 0)

// ---------------------------------------------------------------------------
// Pesanan
// ---------------------------------------------------------------------------
let orderSeq = 0
const exportRows = []
/** Per periode & produk: qty semua pesanan (termasuk batal, seperti hitungan Shopee). */
const qtyByPeriod = new Map(PERIODS.map((p) => [p.key, new Map()]))

const COURIERS = ['Reguler (Cashless)-SPX Standard', 'Reguler (Cashless)-J&T Express', 'Hemat Kargo-SPX Hemat', 'Reguler (Cashless)-JNE Reguler']
const PAYMENTS = ['ShopeePay', 'SPayLater', 'COD (Bayar di Tempat)', 'Transfer Bank', 'Online Payment']

for (let d = 1; d <= 14; d++) {
  const period = periodOf(d)
  const promo = period.key === '1111'
  const catalog = PRODUCTS.filter((p) => !p.from || d >= p.from).map((p) => ({ ...p, weight: promo ? (p.weight1111 ?? p.weight) : p.weight }))
  for (let k = 0; k < ORDERS_PER_DAY[d]; k++) {
    orderSeq++
    // Tanggal 11: banyak pesanan di jam 00–02 (flash sale tengah malam).
    const hour = d === 11 && rand() < 0.35 ? randInt(0, 2) : randInt(6, 23)
    const created = wib(2026, 11, d, hour, randInt(0, 59))
    const orderNo = `2611${pad(d)}TT${String(orderSeq).padStart(5, '0')}`
    const payment = PAYMENTS[randInt(0, PAYMENTS.length - 1)]

    const lineCount = pick([{ n: 1, weight: 66 }, { n: 2, weight: 25 }, { n: 3, weight: 9 }]).n
    const chosen = []
    while (chosen.length < lineCount) {
      const p = pick(catalog)
      const variant = p.variants ? p.variants[randInt(0, p.variants.length - 1)] : ''
      if (chosen.some((c) => c.p.name === p.name && c.variant === variant)) continue
      chosen.push({ p, variant, qty: pick([{ q: 1, weight: 75 }, { q: 2, weight: 19 }, { q: 3, weight: 6 }]).q })
    }

    // Status: minggu 11.11 lebih banyak batal (checkout karena promo, lalu berubah pikiran / COD ditolak).
    const batalChance = Math.max(...chosen.map((c) => (promo ? (c.p.batal1111 ?? 0.08) : 0.035)))
    let status = 'Selesai'
    let completed = addMin(created, randInt(2 * 1440, 5 * 1440))
    if (rand() < batalChance) status = 'Batal'
    if (status === 'Selesai' && completed >= CUTOFF) status = rand() < 0.15 && d >= 13 ? 'Perlu Dikirim' : 'Sedang Dikirim'
    if (status !== 'Selesai') completed = null

    const voucher = status !== 'Batal' && rand() < (promo ? 0.45 : 0.15) ? (promo ? 11000 : 2000) : 0
    const totalQty = chosen.reduce((s, c) => s + c.qty, 0)
    const priceOf = (p) => (promo ? p.promo : p.price)
    const orderSub = chosen.reduce((s, c) => s + priceOf(c.p) * c.qty, 0)
    const returnLine = status === 'Selesai' && rand() < 0.02 ? randInt(0, chosen.length - 1) : -1

    chosen.forEach((c, i) => {
      const returned = i === returnLine ? 1 : 0
      const unit = priceOf(c.p)
      exportRows.push({
        'No. Pesanan': orderNo,
        'Status Pesanan': status,
        'Status Pembatalan/ Pengembalian': returned ? 'Permintaan Disetujui' : status === 'Batal' ? 'Dibatalkan oleh Pembeli' : '',
        'No. Resi': status === 'Batal' || status === 'Perlu Dikirim' ? '' : `SPXID0${String(4100000000 + orderSeq)}`,
        'Opsi Pengiriman': COURIERS[orderSeq % COURIERS.length],
        'Waktu Pesanan Dibuat': dtStr(created),
        'Waktu Pembayaran Dilakukan': dtStr(addMin(created, randInt(1, 30))),
        'Metode Pembayaran': payment,
        'SKU Induk': c.p.skuInduk ?? '',
        'Nama Produk': c.p.name,
        'Nomor Referensi SKU': c.p.skuRef ?? '',
        'Nama Variasi': c.variant,
        'Harga Awal': c.p.list,
        'Harga Setelah Diskon': unit,
        'Jumlah': c.qty,
        'Returned quantity': returned,
        'Subtotal Pesanan': unit * c.qty,
        'Total Diskon': (c.p.list - unit) * c.qty,
        'Diskon Dari Penjual': (c.p.list - unit) * c.qty,
        'Berat Produk': `${c.p.gram} gr`,
        'Jumlah Produk di Pesan': totalQty,
        'Total Berat': `${chosen.reduce((s, x) => s + x.p.gram * x.qty, 0)} gr`,
        'Voucher Ditanggung Penjual': voucher,
        'Total Pembayaran': orderSub - voucher,
        'Waktu Pesanan Selesai': completed ? dtStr(completed) : '',
        buyerNo: orderSeq,
      })
      const q = qtyByPeriod.get(period.key)
      q.set(c.p.name, (q.get(c.p.name) ?? 0) + c.qty)
    })
  }
}

// ---------------------------------------------------------------------------
// Export pesanan (.xlsx) — 51 kolom, urutan sama dengan export Shopee
// ---------------------------------------------------------------------------
const HEADERS = [
  'No. Pesanan', 'Status Pesanan', 'Shipped by Advance Fulfilment', 'Booking SN',
  'Status Pembatalan/ Pengembalian', 'No. Resi', 'Opsi Pengiriman', 'Antar ke counter/ pick-up',
  'Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)', 'Waktu Pengiriman Diatur',
  'Waktu Pesanan Dibuat', 'Waktu Pembayaran Dilakukan', 'Tipe Pesanan', 'Metode Pembayaran',
  'SKU Induk', 'Nama Produk', 'Nomor Referensi SKU', 'Nama Variasi', 'Harga Awal',
  'Harga Setelah Diskon', 'Jumlah', 'Returned quantity', 'Subtotal Pesanan', 'Total Diskon',
  'Diskon Dari Penjual', 'Diskon Dari Shopee', 'Berat Produk', 'Jumlah Produk di Pesan',
  'Total Berat', 'Voucher Ditanggung Penjual', 'Cashback Koin', 'Voucher Ditanggung Shopee',
  'Paket Diskon', 'Paket Diskon (Diskon dari Shopee)', 'Paket Diskon (Diskon dari Penjual)',
  'Potongan Koin Shopee', 'Diskon Kartu Kredit', 'Ongkos Kirim Dibayar oleh Pembeli',
  'Estimasi Potongan Biaya Pengiriman', 'Ongkos Kirim Pengembalian Barang', 'Total Pembayaran',
  'Perkiraan Ongkos Kirim', 'Catatan dari Pembeli', 'Catatan', 'Username (Pembeli)',
  'Nama Penerima', 'No. Telepon', 'Alamat Pengiriman', 'Kota/Kabupaten', 'Provinsi',
  'Waktu Pesanan Selesai',
]
const fmtId = (n) => Number(n).toLocaleString('id-ID') // "59.000" seperti export Shopee

const rows = exportRows.map((r) => {
  const n = r.buyerNo
  const full = {
    'Shipped by Advance Fulfilment': 'N',
    'Antar ke counter/ pick-up': 'Antar ke Counter',
    'Tipe Pesanan': '-',
    'Diskon Dari Shopee': 0, 'Cashback Koin': 0, 'Voucher Ditanggung Shopee': 0,
    'Paket Diskon': 0, 'Paket Diskon (Diskon dari Shopee)': 0, 'Paket Diskon (Diskon dari Penjual)': 0,
    'Potongan Koin Shopee': 0, 'Diskon Kartu Kredit': 0, 'Ongkos Kirim Dibayar oleh Pembeli': 0,
    'Estimasi Potongan Biaya Pengiriman': 0, 'Ongkos Kirim Pengembalian Barang': 0, 'Perkiraan Ongkos Kirim': 0,
    // Data pembeli PALSU
    'Username (Pembeli)': `pembeli_dummy_1111_${n}`,
    'Nama Penerima': `Penerima Dummy ${n}`,
    'No. Telepon': `628001${String(n).padStart(6, '0')}`,
    'Alamat Pengiriman': `Jl. Contoh Dummy No. ${n % 200}, Kota Contoh`,
    'Kota/Kabupaten': 'KOTA CONTOH',
    'Provinsi': 'PROVINSI CONTOH',
    ...r,
  }
  for (const k of ['Harga Awal', 'Harga Setelah Diskon', 'Subtotal Pesanan', 'Total Diskon', 'Diskon Dari Penjual', 'Voucher Ditanggung Penjual', 'Total Pembayaran']) {
    full[k] = fmtId(full[k])
  }
  return HEADERS.map((h) => (full[h] === undefined ? '' : String(full[h])))
})
const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows])
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'orders')
fs.writeFileSync(path.join(OUT, '1-pesanan-1-14-nov-2026.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

// ---------------------------------------------------------------------------
// Data iklan (.csv) per periode.
// Skenario (ROAS = angka di Shopee, belum dikurangi batal):
//   Serum      : ROAS naik, tetap Lanjut walau diskon dalam → bintang 11.11
//   Sunscreen  : ROAS NAIK (3,4 → 3,6), tapi karena harga promo labelnya turun jadi "Lanjut, pantau"
//   Paket Hemat: ROAS 11.11 kelihatan bagus (3,6), tapi batal tinggi → ROAS nyata di bawah balik modal → Stop
//   Micellar   : diskon bikin balik modal naik → Stop
//   Hair Serum : iklan dadakan 11.11, belum ada yang terjual → Stop
//   Glow Kit   : produk baru, HPP belum ada → Isi HPP (HPP sementara Rp45.000 → Lanjut)
// ---------------------------------------------------------------------------
const byName = (n) => PRODUCTS.find((p) => p.name.startsWith(n))
/** [produk, porsi qty lewat iklan, ROAS Shopee minggu biasa, ROAS Shopee minggu 11.11]. null = tidak beriklan. */
const MANUAL_ADS = [
  [byName('Serum Vitamin C'), 0.45, 9.0, 11.5],
  [byName('Sunscreen'), 0.4, 3.4, 3.6],
  [byName('Micellar'), 0.35, 3.0, 3.3],
  [byName('[PAKET HEMAT]'), 0.45, 3.2, 3.6],
  [byName('Glow Kit'), 0.5, null, 4.6],
  [byName('Hair Serum'), 0, null, 'nol'],
]
const AUTO_ADS = [
  [byName('Toner'), 0.3, 7.0, 6.2],
  [byName('Facial Wash'), 0.25, 6.0, 5.5],
  [byName('Lip Tint'), 0.3, 6.5, 8.0],
  [byName('Masker Clay'), 0.25, 2.8, 2.7],
]

const csvCell = (v) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
const csvLine = (cells) => cells.map(csvCell).join(',')
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(2) : '0.00') + '%'
const dmy = (d) => `${pad(d)}/11/2026`
const meta = (title, period) => [
  title,
  `Username,${USERNAME}`,
  `Nama Toko,${csvCell(STORE)}`,
  'ID Toko,730000001',
  `Waktu Laporan Dibuat,${dmy(period.to + 1)} 08:30`,
  `Periode,${dmy(period.from)} - ${dmy(period.to)}`,
  '',
]

function adStats(p, share, roas, period) {
  if (roas === null) return null
  const price = period.key === '1111' ? p.promo : p.price
  if (roas === 'nol') {
    // Iklan tanpa penjualan: klik ada, terjual 0.
    const clicks = randInt(70, 90)
    return { views: Math.round(clicks / 0.022), clicks, sold: 0, gmv: 0, spend: clicks * 340 }
  }
  const qty = qtyByPeriod.get(period.key).get(p.name) ?? 0
  const sold = Math.max(1, Math.round(qty * share))
  const gmv = sold * price
  const spend = Math.round(gmv / roas)
  const clicks = Math.round(sold / (0.035 + rand() * 0.025))
  const views = Math.round(clicks / (0.03 + rand() * 0.02))
  return { views, clicks, sold, gmv, spend }
}
const sumStats = (list) =>
  list.reduce((s, x) => ({ views: s.views + x.views, clicks: s.clicks + x.clicks, sold: s.sold + x.sold, gmv: s.gmv + x.gmv, spend: s.spend + x.spend }), { views: 0, clicks: 0, sold: 0, gmv: 0, spend: 0 })

/** File keseluruhan punya kolom "Tambah ke Keranjang" setelah Persentase Klik. */
function withCart(perfCells, s) {
  const cart = Math.round(s.clicks * 0.18)
  return [...perfCells.slice(0, 3), cart, pct(cart, s.clicks), ...perfCells.slice(3)]
}
const perf = (s) => [
  s.views, s.clicks, pct(s.clicks, s.views), s.sold, s.sold, pct(s.sold, s.clicks), pct(s.sold, s.clicks),
  s.sold ? (s.spend / s.sold).toFixed(2) : '0.00', s.sold ? (s.spend / s.sold).toFixed(2) : '0.00',
  s.sold, s.sold, s.gmv, s.gmv, s.spend,
  s.spend ? (s.gmv / s.spend).toFixed(2) : '0.00', s.spend ? (s.gmv / s.spend).toFixed(2) : '0.00',
  pct(s.spend, s.gmv), pct(s.spend, s.gmv),
]

const summary = {}
for (const period of PERIODS) {
  const col = period.key === '1111' ? 3 : 2
  const manual = MANUAL_ADS.map((a) => ({ p: a[0], s: adStats(a[0], a[1], a[col], period) })).filter((a) => a.s)
  const auto = AUTO_ADS.map((a) => ({ p: a[0], s: adStats(a[0], a[1], a[col], period) })).filter((a) => a.s)
  const autoTotal = sumStats(auto.map((a) => a.s))
  const all = sumStats([autoTotal, ...manual.map((a) => a.s)])
  summary[period.key] = all
  const start = period.key === '1111' ? '08/11/2026 00:00:00' : '01/08/2026 00:00:00'

  const keseluruhan = [
    ...meta('Semua Laporan Iklan CPC - Shopee Indonesia', period),
    csvLine(['Urutan', 'Nama Iklan', 'Status', 'Jenis Iklan', 'Kode Produk', 'Tampilan Iklan', 'Mode Bidding', 'Penempatan Iklan', 'Tanggal Mulai', 'Tanggal Selesai', 'Dilihat', 'Jumlah Klik', 'Persentase Klik', 'Tambah ke Keranjang', 'Persentase Tambah ke Keranjang', 'Konversi', 'Konversi Langsung', 'Tingkat konversi', 'Tingkat Konversi Langsung', 'Biaya per Konversi', 'Biaya per Konversi Langsung', 'Produk Terjual', 'Terjual Langsung', 'Omzet Penjualan', 'Penjualan Langsung (GMV Langsung)', 'Biaya', 'Efektifitas Iklan', 'Efektivitas Langsung', 'Persentase Biaya Iklan terhadap Penjualan dari Iklan (ACOS)', 'Persentase Biaya Iklan terhadap Penjualan dari Iklan Langsung (ACOS Langsung)', 'Jumlah Produk Dilihat', 'Jumlah Klik Produk', 'Persentase Klik Produk', 'Voucher Amount', 'Vouchered Sales']),
    csvLine([1, 'Iklan Produk Otomatis', 'Berjalan', '', '-', '-', 'Iklan Produk Otomatis', 'Semua Penempatan', '01/08/2026 00:00:00', 'Tidak Terbatas', ...withCart(perf(autoTotal), autoTotal), '-', '-', '-', 0, 0]),
    ...manual.map((a, i) =>
      csvLine([i + 2, a.p.name, 'Berjalan', 'Iklan Produk', a.p.adCode, '-', 'GMV Max ROAS', 'Semua Penempatan', a.p.from || a.p.name.startsWith('Hair') ? '08/11/2026 00:00:00' : start, 'Tidak Terbatas', ...withCart(perf(a.s), a.s), '-', '-', '-', 0, 0]),
    ),
    '',
  ].join('\r\n')

  const otomatis = [
    ...meta('Iklan Produk Otomatis Indonesia', period),
    csvLine(['Urutan', 'Nama Produk', 'Kode Produk', 'Dilihat', 'Jumlah Klik', 'Persentase Klik', 'Konversi', 'Konversi Langsung', 'Tingkat konversi', 'Tingkat Konversi Langsung', 'Biaya per Konversi', 'Biaya per Konversi Langsung', 'Produk Terjual', 'Terjual Langsung', 'Omzet Penjualan', 'Penjualan Langsung (GMV Langsung)', 'Biaya', 'Efektifitas Iklan', 'Efektivitas Langsung', 'Persentase Biaya Iklan terhadap Penjualan dari Iklan (ACOS)', 'Persentase Biaya Iklan terhadap Penjualan dari Iklan Langsung (ACOS Langsung)', 'Voucher Amount', 'Vouchered Sales']),
    csvLine([1, 'Iklan Produk Otomatis', '-', ...perf(autoTotal), 0, 0]),
    ...auto.map((a, i) => csvLine([i + 2, a.p.name, a.p.adCode, ...perf(a.s), 0, 0])),
    '',
  ].join('\r\n')

  const tag = `${pad(period.from)}-${pad(period.to)}-nov`
  fs.writeFileSync(path.join(OUT, `2-iklan-keseluruhan-${tag}.csv`), '﻿' + keseluruhan)
  fs.writeFileSync(path.join(OUT, `2-iklan-otomatis-${tag}.csv`), '﻿' + otomatis)
}

// ---------------------------------------------------------------------------
// Petunjuk
// ---------------------------------------------------------------------------
const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID')
const ordersIn = (p) => new Set(exportRows.filter((r) => periodOf(Number(r['Waktu Pesanan Dibuat'].slice(8, 10))) === p).map((r) => r['No. Pesanan'])).size
const roasOf = (s) => (s.gmv / s.spend).toFixed(2).replace('.', ',')
const kit = byName('Glow Kit')
const readme = `DATA SAMPLE CEK CEPAT: EVALUASI 11.11 (PALSU, aman untuk konten & testing)
=========================================================================

Toko: "${STORE}". Katalog, SKU, dan HPP SAMA dengan data sample Agustus–September
(npm run sample). Pakai toko yang sudah berisi data itu supaya HPP & potongan Shopee terisi.
Akun harus berlangganan (Cek cepat tidak bisa dipakai selama uji coba).

Dua periode untuk dibandingkan:
  Minggu biasa  1–7 Nov 2026   harga normal          ${ordersIn(PERIODS[0])} pesanan
  Minggu 11.11  8–14 Nov 2026  harga promo 11.11     ${ordersIn(PERIODS[1])} pesanan (puncak 11 Nov)
Export pesanan dianggap di-download 15 Nov pagi: pesanan minggu 11.11 banyak yang masih dikirim.

Cara pakai
----------
1. Halaman Iklan → Cek cepat → pilih SEMUA file di folder ini sekaligus:
     1-pesanan-1-14-nov-2026.xlsx
     2-iklan-keseluruhan-01-07-nov.csv   2-iklan-otomatis-01-07-nov.csv
     2-iklan-keseluruhan-08-14-nov.csv   2-iklan-otomatis-08-14-nov.csv
   (Export pesanan ikut DISIMPAN ke toko, seperti di halaman Upload.)
2. Hasil muncul berdampingan: "Sebelumnya" (minggu biasa) dan "Terbaru" (minggu 11.11).
3. Glow Kit 11.11 berlabel "Isi HPP". Isi HPP sementara ${rupiah(kit.tempHpp)} untuk melihat labelnya berubah.
4. Opsional: tekan "Download untuk Claude (.md)" untuk bahan tanya-jawab di konten.

Ringkasan angka di laporan Shopee (sebelum dikurangi batal)
----------------------------------------------------------
                 Biaya iklan     Omzet iklan     ROAS Shopee
Minggu biasa     ${rupiah(summary.biasa.spend).padEnd(15)} ${rupiah(summary.biasa.gmv).padEnd(15)} ${roasOf(summary.biasa)}
Minggu 11.11     ${rupiah(summary['1111'].spend).padEnd(15)} ${rupiah(summary['1111'].gmv).padEnd(15)} ${roasOf(summary['1111'])}

Cerita untuk konten (label yang seharusnya muncul di minggu 11.11)
-----------------------------------------------------------------
- Serum Vitamin C   : harga promo Rp59.000 → Rp49.000, ROAS tetap tinggi → Lanjut. Bintang 11.11.
- Sunscreen         : ROAS Shopee NAIK (3,4 → 3,6), tapi harga promo Rp40.000 menaikkan ROAS balik modal
                      → label turun dari Lanjut ke "Lanjut, pantau". ROAS naik ≠ untung naik.
- Paket Hemat       : ROAS Shopee 3,6 kelihatan bagus, tapi ±1 dari 5 pesanan batal → ROAS nyata di
                      bawah balik modal → Stop.
- Micellar Water    : diskon Rp38.000 → Rp33.000 membuat untung per botol tipis → Stop.
- Hair Serum        : iklan dadakan untuk 11.11, banyak klik tapi 0 terjual → Stop.
- Glow Kit 11.11    : produk baru, HPP belum ada → Isi HPP (dengan HPP sementara ${rupiah(kit.tempHpp)} → Lanjut).
- Iklan otomatis    : Toner, Facial Wash, Lip Tint tetap Lanjut; Masker Clay di kisaran balik modal.

Pesan utama: omzet & ROAS 11.11 naik, tapi diskon + pesanan batal memakan untung. Angka beberapa hari
cenderung terlalu bagus: retur 11.11 baru kelihatan 1–2 minggu lagi.

HPP Glow Kit SENGAJA tidak ada di toko (produk baru). Semua nama pembeli, nomor, dan alamat palsu.

Dibuat ulang dengan: npm run sample:1111 -- "${STORE}"
`
fs.writeFileSync(path.join(OUT, 'BACA-DULU.txt'), readme)
console.log(readme)
console.log('File dibuat di', OUT)
