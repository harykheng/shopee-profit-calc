// Membuat data sample PALSU untuk toko testing: 2 bulan (Agustus & September 2026)
// export pesanan (.xlsx), laporan penghasilan (.pdf), dan data iklan (.csv).
// Struktur file sama dengan file Shopee asli; semua angka saling cocok
// (pesanan selesai ↔ dana dilepas ↔ iklan), jadi Rekap bisa mencapai status final.
//
// Jalankan: npm run sample -- "Nama Toko"   (default "Toko Testing")
// Hasil di folder sample-store/ (di-gitignore). Semua data pembeli dan toko palsu.
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const STORE = process.argv[2]?.trim() || 'Toko Testing'
const USERNAME = STORE.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tokotesting'
const OUT = path.resolve(import.meta.dirname, '../sample-store')
fs.mkdirSync(OUT, { recursive: true })

// PRNG deterministik: hasil selalu sama setiap dijalankan.
let seed = 20260801
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
// Katalog produk. Tiga cara pengenalan SKU ikut diuji:
// SKU variasi (Nomor Referensi SKU), SKU Induk + variasi, dan tanpa SKU (nama).
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { name: 'Serum Vitamin C Glow 20ml', skuRef: 'TT-SRM-VITC', skuInduk: 'TT-SRM-VITC', price: 59000, list: 69000, hpp: 24000, weight: 10, gram: 60, adCode: '24810001' },
  { name: 'Toner Centella Calming 100ml', skuRef: 'TT-TNR-CICA', skuInduk: 'TT-TNR-CICA', price: 45000, list: 45000, hpp: 17500, weight: 8, gram: 130, adCode: '24810002' },
  { name: 'Sunscreen Aqua SPF50 PA++++ 50ml', skuRef: 'TT-SUN-50', skuInduk: 'TT-SUN-50', price: 52000, list: 58000, hpp: 21000, weight: 9, gram: 70, adCode: '24810003' },
  { name: 'Facial Wash Gentle Foam 100ml', skuRef: 'TT-FW-100', skuInduk: 'TT-FW-100', price: 32000, list: 32000, hpp: 11000, weight: 7, gram: 120, adCode: '24810004' },
  { name: 'Lip Tint Velvet Matte 4gr', skuInduk: 'TT-LIP', variants: ['Cherry', 'Rose', 'Nude'], price: 29000, list: 35000, hpp: 9500, weight: 9, gram: 20, adCode: '24810005' },
  { name: 'Masker Clay Mugwort 80gr', skuRef: 'TT-MSK-CLAY', skuInduk: 'TT-MSK-CLAY', price: 48000, list: 48000, hpp: 19000, weight: 5, gram: 100, adCode: '24810006' },
  { name: 'Body Lotion Niacinamide 250ml', skuRef: 'TT-BL-250', skuInduk: 'TT-BL-250', price: 42000, list: 42000, hpp: 15000, weight: 6, gram: 280, adCode: '24810007' },
  { name: 'Micellar Water Hydrating 300ml', skuRef: 'TT-MCW-300', skuInduk: 'TT-MCW-300', price: 38000, list: 42000, hpp: 18500, weight: 5, gram: 330, adCode: '24810008' },
  { name: '[PAKET HEMAT] Serum Vitamin C + Toner Centella', skuRef: 'TT-PKT-01', skuInduk: 'TT-PKT-01', price: 95000, list: 104000, hpp: 41500, weight: 3, gram: 190, adCode: '24810009' },
  { name: 'Sheet Mask Mix Isi 5', variants: ['Brightening', 'Hydrating'], price: 25000, list: 25000, hpp: 8000, weight: 6, gram: 120, adCode: '24810010' },
  { name: 'Bedak Tabur Loose Powder 20gr', price: 35000, list: 39000, hpp: 12500, weight: 4, gram: 40, adCode: '24810011' },
  { name: 'Hair Serum Argan Oil 50ml', skuRef: 'TT-HAIR-ARG', skuInduk: 'TT-HAIR-ARG', price: 36000, list: 36000, hpp: 13000, weight: 4, gram: 70, adCode: '24810012' },
]

const SEP = ' | ' // SKU_KEY_SEPARATOR di src/lib/shopeeColumns.ts
function appKey(p, variant) {
  if (p.skuRef) return p.skuRef
  if (p.skuInduk) return variant ? p.skuInduk + SEP + variant : p.skuInduk
  return variant ? p.name + SEP + variant : p.name
}

// ---------------------------------------------------------------------------
// Tanggal (semua WIB)
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')
const dayStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const dtStr = (d) => `${dayStr(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
const addMin = (d, m) => new Date(d.getTime() + m * 60_000)
const wib = (y, mo, d, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi))

const MONTHS = [
  { key: '2026-08', label: 'Agustus 2026', y: 2026, m: 8, days: 31, perDay: [6, 12] },
  { key: '2026-09', label: 'September 2026', y: 2026, m: 9, days: 30, perDay: [8, 15] },
]
/** Batas data: export diambil 1 Oktober pagi. Pesanan yang belum selesai sebelum ini masih diproses. */
const CUTOFF = wib(2026, 10, 1, 0, 0)

// ---------------------------------------------------------------------------
// Pesanan
// ---------------------------------------------------------------------------
let orderSeq = 0
let buyerNo = 0
/** Per bulan pembuatan: baris export. */
const exportRows = new Map(MONTHS.map((m) => [m.key, []]))
/** Per tanggal dana dilepas: rincian penghasilan. */
const releases = new Map()
/** Per bulan & produk: qty dan omzet selesai (untuk data iklan yang masuk akal). */
const soldByMonth = new Map(MONTHS.map((m) => [m.key, new Map()]))

function addRelease(day, v) {
  const r = releases.get(day) ?? { sub: 0, ongkir: 0, voucher: 0, platform: 0, xtra: 0, layanan: 0 }
  for (const k of Object.keys(v)) r[k] += v[k]
  releases.set(day, r)
}

const COURIERS = ['Reguler (Cashless)-SPX Standard', 'Reguler (Cashless)-J&T Express', 'Hemat Kargo-SPX Hemat', 'Reguler (Cashless)-JNE Reguler']
const PAYMENTS = ['ShopeePay', 'SPayLater', 'COD (Bayar di Tempat)', 'Transfer Bank', 'Online Payment']

for (const month of MONTHS) {
  for (let d = 1; d <= month.days; d++) {
    const count = randInt(...month.perDay) + (d % 7 === 0 ? 4 : 0) // lonjakan tiap ~minggu (payday/flash sale)
    for (let k = 0; k < count; k++) {
      orderSeq++
      buyerNo++
      const created = wib(month.y, month.m, d, randInt(6, 23), randInt(0, 59))
      const orderNo = `${String(month.y).slice(2)}${pad(month.m)}${pad(d)}TT${String(orderSeq).padStart(5, '0')}`
      const payment = PAYMENTS[randInt(0, PAYMENTS.length - 1)]

      // Isi keranjang: 1–3 produk berbeda.
      const lineCount = pick([{ n: 1, weight: 70 }, { n: 2, weight: 22 }, { n: 3, weight: 8 }]).n
      const chosen = []
      while (chosen.length < lineCount) {
        const p = pick(PRODUCTS)
        const variant = p.variants ? p.variants[randInt(0, p.variants.length - 1)] : ''
        if (chosen.some((c) => c.p === p && c.variant === variant)) continue
        chosen.push({ p, variant, qty: pick([{ q: 1, weight: 78 }, { q: 2, weight: 17 }, { q: 3, weight: 5 }]).q })
      }

      // Status
      const roll = rand()
      let status = 'Selesai'
      let completed = addMin(created, randInt(2 * 1440, 6 * 1440))
      if (roll < 0.04) status = 'Batal'
      else if (roll < 0.05) status = 'Belum Bayar'
      if (status === 'Selesai' && completed >= CUTOFF) {
        status = completed.getTime() - CUTOFF.getTime() > 3 * 86_400_000 ? 'Perlu Dikirim' : 'Sedang Dikirim'
      }
      if (status !== 'Selesai') completed = null
      if (status === 'Belum Bayar' && created < wib(2026, 9, 28)) status = 'Batal' // belum bayar lama → batal otomatis

      const voucher = status === 'Selesai' && rand() < 0.2 ? (rand() < 0.5 ? 2000 : 5000) : 0
      const totalQty = chosen.reduce((s, c) => s + c.qty, 0)
      const orderSub = chosen.reduce((s, c) => s + c.p.price * c.qty, 0)

      // Retur sebagian (≈2% pesanan selesai, hanya baris dengan qty ≥ 1)
      const returnLine = status === 'Selesai' && rand() < 0.02 ? randInt(0, chosen.length - 1) : -1

      let refund = 0
      chosen.forEach((c, i) => {
        const returned = i === returnLine ? 1 : 0
        refund += returned * c.p.price
        const sub = c.p.price * c.qty
        exportRows.get(month.key).push({
          'No. Pesanan': orderNo,
          'Status Pesanan': status,
          'Status Pembatalan/ Pengembalian': returned ? 'Permintaan Disetujui' : status === 'Batal' ? 'Dibatalkan oleh Pembeli' : '',
          'No. Resi': status === 'Batal' || status === 'Belum Bayar' || status === 'Perlu Dikirim' ? '' : `SPXID0${String(4000000000 + orderSeq)}`,
          'Opsi Pengiriman': COURIERS[orderSeq % COURIERS.length],
          'Waktu Pesanan Dibuat': dtStr(created),
          'Waktu Pembayaran Dilakukan': status === 'Belum Bayar' ? '' : dtStr(addMin(created, randInt(1, 30))),
          'Metode Pembayaran': payment,
          'SKU Induk': c.p.skuInduk ?? '',
          'Nama Produk': c.p.name,
          'Nomor Referensi SKU': c.p.skuRef ?? '',
          'Nama Variasi': c.variant,
          'Harga Awal': c.p.list,
          'Harga Setelah Diskon': c.p.price,
          'Jumlah': c.qty,
          'Returned quantity': returned,
          'Subtotal Pesanan': sub,
          'Total Diskon': (c.p.list - c.p.price) * c.qty,
          'Diskon Dari Penjual': (c.p.list - c.p.price) * c.qty,
          'Berat Produk': `${c.p.gram} gr`,
          'Jumlah Produk di Pesan': totalQty,
          'Total Berat': `${chosen.reduce((s, x) => s + x.p.gram * x.qty, 0)} gr`,
          'Voucher Ditanggung Penjual': voucher,
          'Total Pembayaran': orderSub - voucher,
          'Waktu Pesanan Selesai': completed ? dtStr(completed) : '',
          buyerNo,
        })
        if (completed) {
          const sold = soldByMonth.get(completed.toISOString().slice(0, 7))
          if (sold) {
            const e = sold.get(c.p) ?? { qty: 0, gmv: 0 }
            e.qty += c.qty - returned
            e.gmv += c.p.price * (c.qty - returned)
            sold.set(c.p, e)
          }
        }
      })

      if (completed) {
        // Dana dilepas di hari pesanan selesai; selesai ≥23:00 kadang tercatat besoknya
        // (kecuali di akhir bulan, supaya bulan tetap utuh).
        let release = completed
        const lastDay = completed.getUTCDate() === new Date(Date.UTC(completed.getUTCFullYear(), completed.getUTCMonth() + 1, 0)).getUTCDate()
        if (completed.getUTCHours() >= 23 && !lastDay && rand() < 0.5) release = addMin(completed, 120)
        const net = orderSub - refund
        addRelease(dayStr(release), {
          sub: net,
          voucher: -voucher,
          platform: -(Math.round(net * 0.08) + 1250),
          xtra: -Math.min(Math.round(net * 0.04), 10000),
          layanan: payment === 'SPayLater' ? -Math.round(net * 0.01) : 0,
        })
      }
    }
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

for (const month of MONTHS) {
  const rows = exportRows.get(month.key).map((r) => {
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
      'Username (Pembeli)': `pembeli_dummy_${n}`,
      'Nama Penerima': `Penerima Dummy ${n}`,
      'No. Telepon': `628000${String(n).padStart(6, '0')}`,
      'Alamat Pengiriman': `Jl. Contoh Dummy No. ${n % 200}, Kota Contoh`,
      'Kota/Kabupaten': 'KOTA CONTOH',
      'Provinsi': 'PROVINSI CONTOH',
      ...r,
    }
    // Kolom uang ditulis sebagai teks "59.000" seperti file Shopee.
    for (const k of ['Harga Awal', 'Harga Setelah Diskon', 'Subtotal Pesanan', 'Total Diskon', 'Diskon Dari Penjual', 'Voucher Ditanggung Penjual', 'Total Pembayaran']) {
      full[k] = fmtId(full[k])
    }
    return HEADERS.map((h) => (full[h] === undefined ? '' : String(full[h])))
  })
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'orders')
  fs.writeFileSync(
    path.join(OUT, `1-pesanan-${month.key}.xlsx`),
    XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
  )
}

// ---------------------------------------------------------------------------
// Laporan penghasilan (.pdf) — layout meniru "Catatan Transaksi Penghasilan"
// ---------------------------------------------------------------------------
const MINUS = '−' // Shopee memakai tanda minus unicode
const fmt = (n) => (n < 0 ? MINUS + String(-n) : String(n))
const rp = (n) => (n < 0 ? MINUS : '') + 'Rp' + Math.abs(n).toLocaleString('en-US')
const fontBytes = fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')

/** Biaya penyesuaian (kompensasi) per bulan. */
const ADJUSTMENTS = {
  '2026-09': [{ date: '2026/09/18', description: 'Penyesuaian/Kompensasi Barang Hilang', amount: 52000 }],
}

const incomeTotals = {}
for (const month of MONTHS) {
  const daily = [...releases.entries()]
    .filter(([day]) => day.startsWith(month.key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, r]) => {
      const vals = [r.sub, r.ongkir, r.voucher, r.platform, r.xtra, r.layanan]
      return [day.replaceAll('-', '/'), ...vals, vals.reduce((a, b) => a + b, 0)]
    })
  const totals = daily[0].slice(1).map((_, i) => daily.reduce((s, r) => s + r[i + 1], 0))
  const refundTotal = -[...exportRows.values()]
    .flat()
    .filter((r) => r['Returned quantity'] > 0 && r['Waktu Pesanan Selesai'].startsWith(month.key))
    .reduce((s, r) => s + r['Harga Setelah Diskon'] * r['Returned quantity'], 0)
  incomeTotals[month.key] = totals[6]

  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(fontBytes, { subset: true })
  pdf.setTitle(`Catatan Transaksi Penghasilan ${month.label}`)
  pdf.setProducer('make-sample-store')
  pdf.setCreator('make-sample-store')

  const COLS = [40, 110, 180, 240, 300, 370, 440, 510]
  const newPage = () => {
    const page = pdf.addPage([595, 842])
    let y = 800
    const text = (s, x, size = 9) => page.drawText(s, { x, y, size, font })
    return {
      line(s, x = 40) { text(s, x); y -= 14 },
      cells(values) { values.forEach((v, i) => text(v, COLS[i])); y -= 14 },
      split(a, b, xb) { text(a, 40); page.drawText(b, { x: xb, y: y - 1, size: 9, font }); y -= 14 },
      gap() { y -= 8 },
    }
  }
  const lastDay = `${month.key}-${pad(month.days)}`
  let p = newPage()
  p.line('Catatan Transaksi Penghasilan')
  p.line(`${STORE} 7300000000000001`)
  p.split(`Catatan Transaksi untuk ${month.key}-01 sampai`, `Username :${USERNAME}`, 330)
  p.split('Jl. Contoh Dummy No. 1, Kota Contoh', lastDay, 330)
  p.line('Rekening Bank :********0000')
  p.gap()
  p.line('Ringkasan Dana yang Dilepaskan')
  p.line(`Subtotal Pesanan ${fmt(totals[0])}`)
  p.line(`Harga Produk ${fmt(totals[0] - refundTotal)}`)
  p.line(`Jumlah Pengembalian Dana ${fmt(refundTotal)}`)
  p.line(`Subtotal Ongkos Kirim ${fmt(totals[1])}`)
  p.line(`Voucher & Subsidi ${fmt(totals[2])}`)
  p.line(`Biaya Platform ${fmt(totals[3])}`)
  p.line(`Biaya Gratis Ongkir XTRA ${fmt(totals[4])}`)
  p.line(`Subtotal Biaya Layanan Tambahan ${fmt(totals[5])}`)
  p.line('Total Penghasilan')
  p.line(rp(totals[6]))
  p.gap()

  const tableHeader = () => {
    p.line('Rincian Dana Dilepaskan')
    p.line('Tanggal Dana Subtotal Subtotal Ongkos Voucher & Biaya Biaya Gratis Ongkir Subtotal Biaya Layanan Total Penghasilan')
  }
  const totalRow = () => p.cells(['Total Penghasilan', ...totals.slice(0, -1).map(fmt), rp(totals[6])])
  const PER_PAGE = 20
  for (let i = 0; i < daily.length; i += PER_PAGE) {
    if (i > 0) p = newPage()
    tableHeader()
    daily.slice(i, i + PER_PAGE).forEach((r) => p.cells([r[0], ...r.slice(1, -1).map(fmt), rp(r[7])]))
    totalRow()
  }
  p.gap()
  const adj = ADJUSTMENTS[month.key] ?? []
  if (adj.length === 0) {
    p.line('Ringkasan Biaya Penyesuaian Jumlah')
    p.line('Tidak ada riwayat transaksi minggu ini.')
    p.line('Rincian Biaya Penyesuaian')
    p.line('Tidak ada riwayat transaksi minggu ini.')
  } else {
    const sum = adj.reduce((s, a) => s + a.amount, 0)
    p.line('Ringkasan Biaya Penyesuaian Jumlah')
    p.line(`Total Penghasilan pada Biaya Penyesuaian (IDR) ${rp(sum)}`)
    p.line('Rincian Biaya Penyesuaian')
    p.line('Tanggal Pelepasan Dana Tipe Penyesuaian | Deskripsi Total Penghasilan pada Biaya Penyesuaian (IDR)')
    for (const a of adj) p.line(`${a.date} ${a.description} ${a.amount.toLocaleString('en-US')}`)
    p.line(`Total Penghasilan pada Biaya Penyesuaian (IDR) ${rp(sum)}`)
  }
  fs.writeFileSync(path.join(OUT, `2-penghasilan-${month.key}.pdf`), await pdf.save())
}

// ---------------------------------------------------------------------------
// Data iklan (.csv): "Data Keseluruhan" + "Rincian Iklan Produk Otomatis" per bulan.
// Skenario: Serum = Hero, Sunscreen & Masker = Aman, Micellar = Takedown, Paket = ROAS kurang.
// ---------------------------------------------------------------------------
const byName = (n) => PRODUCTS.find((p) => p.name.startsWith(n))
/** Iklan produk manual: [produk, porsi terjual lewat iklan, ROAS yang dituju]. */
const MANUAL_ADS = [
  [byName('Serum Vitamin C'), 0.45, 12],
  [byName('Sunscreen'), 0.35, 2.8],
  [byName('Micellar'), 0.3, 2.0],
  [byName('[PAKET HEMAT]'), 0.4, 2.75],
]
/** Produk di dalam Iklan Produk Otomatis. */
const AUTO_ADS = [
  [byName('Toner'), 0.3, 8],
  [byName('Facial Wash'), 0.25, 7],
  [byName('Lip Tint'), 0.3, 9],
  [byName('Masker Clay'), 0.2, 2.8],
]

const csvCell = (v) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
const csvLine = (cells) => cells.map(csvCell).join(',')
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(2) : '0.00') + '%'
const meta = (title, month) => [
  title,
  `Username,${USERNAME}`,
  `Nama Toko,${csvCell(STORE)}`,
  'ID Toko,730000001',
  'Waktu Laporan Dibuat,01/10/2026 09:15',
  `Periode,01/${pad(month.m)}/${month.y} - ${pad(month.days)}/${pad(month.m)}/${month.y}`,
  '',
]

function adStats(p, share, roas, month) {
  const sold = soldByMonth.get(month.key).get(p) ?? { qty: 0, gmv: 0 }
  const adSold = Math.max(1, Math.round(sold.qty * share))
  // "Produk Terjual" versi Shopee ikut menghitung pesanan batal → sedikit lebih tinggi.
  const shopeeSold = adSold + Math.round(adSold * 0.04)
  const gmv = shopeeSold * p.price
  const spend = Math.round(gmv / roas)
  const clicks = Math.round(shopeeSold / (0.04 + rand() * 0.03))
  const views = Math.round(clicks / (0.03 + rand() * 0.03))
  return { views, clicks, sold: shopeeSold, gmv, spend }
}

const sumStats = (list) =>
  list.reduce((s, x) => ({ views: s.views + x.views, clicks: s.clicks + x.clicks, sold: s.sold + x.sold, gmv: s.gmv + x.gmv, spend: s.spend + x.spend }), { views: 0, clicks: 0, sold: 0, gmv: 0, spend: 0 })

const adsSpend = {}
for (const month of MONTHS) {
  const manual = MANUAL_ADS.map(([p, share, roas]) => ({ p, ...adStats(p, share, roas, month) }))
  const auto = AUTO_ADS.map(([p, share, roas]) => ({ p, ...adStats(p, share, roas, month) }))
  const autoTotal = sumStats(auto)
  adsSpend[month.key] = autoTotal.spend + sumStats(manual).spend

  const perf = (s) => [
    s.views, s.clicks, pct(s.clicks, s.views), s.sold, s.sold, pct(s.sold, s.clicks), pct(s.sold, s.clicks),
    s.sold ? (s.spend / s.sold).toFixed(2) : '0.00', s.sold ? (s.spend / s.sold).toFixed(2) : '0.00',
    s.sold, s.sold, s.gmv, s.gmv, s.spend,
    s.spend ? (s.gmv / s.spend).toFixed(2) : '0.00', s.spend ? (s.gmv / s.spend).toFixed(2) : '0.00',
    pct(s.spend, s.gmv), pct(s.spend, s.gmv),
  ]

  const keseluruhan = [
    ...meta('Semua Laporan Iklan CPC - Shopee Indonesia', month),
    csvLine(['Urutan', 'Nama Iklan', 'Status', 'Jenis Iklan', 'Kode Produk', 'Tampilan Iklan', 'Mode Bidding', 'Penempatan Iklan', 'Tanggal Mulai', 'Tanggal Selesai', 'Dilihat', 'Jumlah Klik', 'Persentase Klik', 'Tambah ke Keranjang', 'Persentase Tambah ke Keranjang', 'Konversi', 'Konversi Langsung', 'Tingkat konversi', 'Tingkat Konversi Langsung', 'Biaya per Konversi', 'Biaya per Konversi Langsung', 'Produk Terjual', 'Terjual Langsung', 'Omzet Penjualan', 'Penjualan Langsung (GMV Langsung)', 'Biaya', 'Efektifitas Iklan', 'Efektivitas Langsung', 'Persentase Biaya Iklan terhadap Penjualan dari Iklan (ACOS)', 'Persentase Biaya Iklan terhadap Penjualan dari Iklan Langsung (ACOS Langsung)', 'Jumlah Produk Dilihat', 'Jumlah Klik Produk', 'Persentase Klik Produk', 'Voucher Amount', 'Vouchered Sales']),
    csvLine([1, 'Iklan Produk Otomatis', 'Berjalan', '', '-', '-', 'Iklan Produk Otomatis', 'Semua Penempatan', '01/08/2026 00:00:00', 'Tidak Terbatas', ...withCart(perf(autoTotal), autoTotal), '-', '-', '-', 0, 0]),
    ...manual.map((a, i) =>
      csvLine([i + 2, a.p.name, 'Berjalan', 'Iklan Produk', a.p.adCode, '-', 'GMV Max ROAS', 'Semua Penempatan', '01/08/2026 00:00:00', 'Tidak Terbatas', ...withCart(perf(a), a), '-', '-', '-', 0, 0]),
    ),
    '',
  ].join('\r\n')

  const otomatis = [
    ...meta('Iklan Produk Otomatis Indonesia', month),
    csvLine(['Urutan', 'Nama Produk', 'Kode Produk', 'Dilihat', 'Jumlah Klik', 'Persentase Klik', 'Konversi', 'Konversi Langsung', 'Tingkat konversi', 'Tingkat Konversi Langsung', 'Biaya per Konversi', 'Biaya per Konversi Langsung', 'Produk Terjual', 'Terjual Langsung', 'Omzet Penjualan', 'Penjualan Langsung (GMV Langsung)', 'Biaya', 'Efektifitas Iklan', 'Efektivitas Langsung', 'Persentase Biaya Iklan terhadap Penjualan dari Iklan (ACOS)', 'Persentase Biaya Iklan terhadap Penjualan dari Iklan Langsung (ACOS Langsung)', 'Voucher Amount', 'Vouchered Sales']),
    csvLine([1, 'Iklan Produk Otomatis', '-', ...perf(autoTotal), 0, 0]),
    ...auto.map((a, i) => csvLine([i + 2, a.p.name, a.p.adCode, ...perf(a), 0, 0])),
    '',
  ].join('\r\n')

  fs.writeFileSync(path.join(OUT, `3-iklan-keseluruhan-${month.key}.csv`), '﻿' + keseluruhan)
  fs.writeFileSync(path.join(OUT, `3-iklan-otomatis-${month.key}.csv`), '﻿' + otomatis)
}

/** File keseluruhan punya kolom "Tambah ke Keranjang" setelah Persentase Klik. */
function withCart(perfCells, s) {
  const cart = Math.round(s.clicks * 0.18)
  return [...perfCells.slice(0, 3), cart, pct(cart, s.clicks), ...perfCells.slice(3)]
}

// ---------------------------------------------------------------------------
// Daftar HPP + SQL pengisi HPP + petunjuk
// ---------------------------------------------------------------------------
const hppRows = PRODUCTS.flatMap((p) => (p.variants && !p.skuRef ? p.variants : ['']).map((v) => ({ p, v, key: appKey(p, v) })))
const sqlStr = (s) => `'${s.replaceAll("'", "''")}'`
const sql = [
  `-- Isi HPP semua produk ${STORE} sekaligus (jalankan di Supabase SQL Editor SETELAH upload export pesanan).`,
  `-- Alternatif: isi manual di halaman HPP aplikasi.`,
  'update public.products p',
  'set hpp = v.hpp, updated_at = now()',
  'from (values',
  hppRows.map((r, i) => `  (${sqlStr(r.key)}, ${r.p.hpp})${i < hppRows.length - 1 ? ',' : ''}`).join('\n'),
  ') as v(sku, hpp)',
  `where p.sku = v.sku and p.store_id = (select id from public.stores where name = ${sqlStr(STORE)} order by id desc limit 1);`,
  '',
].join('\n')
fs.writeFileSync(path.join(OUT, '4-isi-hpp.sql'), sql)

const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID')
const orderCount = (key) => new Set(exportRows.get(key).map((r) => r['No. Pesanan'])).size
const readme = `DATA SAMPLE "${STORE}" (PALSU, aman untuk testing)
=====================================================

Urutan upload di aplikasi (pilih toko "${STORE}"):

1. Upload → Export pesanan:   1-pesanan-2026-08.xlsx  lalu  1-pesanan-2026-09.xlsx
   (${orderCount('2026-08')} + ${orderCount('2026-09')} pesanan; ada yang Batal, Sedang/Perlu Dikirim, dan retur)
2. Upload → Laporan penghasilan:  2-penghasilan-2026-08.pdf  lalu  2-penghasilan-2026-09.pdf
   Total penghasilan: Agustus ${rupiah(incomeTotals['2026-08'])}, September ${rupiah(incomeTotals['2026-09'])}
   (September punya biaya penyesuaian kompensasi barang hilang Rp52.000)
3. HPP: isi di halaman HPP (tabel di bawah) ATAU jalankan 4-isi-hpp.sql di Supabase SQL Editor.
   PENTING: HPP dikunci saat pesanan di-upload. Karena HPP diisi SESUDAH upload, buka Rekap lalu
   tekan "Hitung ulang HPP" untuk Agustus dan September.
4. Iklan: upload keempat file 3-iklan-*.csv sekaligus.
   Biaya iklan Shopee: Agustus ${rupiah(adsSpend['2026-08'])}, September ${rupiah(adsSpend['2026-09'])}
   Label yang seharusnya muncul (setelah HPP terisi):
   Hero = Serum, Toner, Facial Wash, Lip Tint · Aman = Sunscreen, Masker Clay
   ROAS terlalu kecil = Paket Hemat · Takedown = Micellar Water
5. Biaya: isi bebas, mis. Packaging Rp350.000, Meta Ads Rp0, Lain-lain Rp100.000.

Setelah semua langkah, Rekap Agustus dan September harus berstatus final.
Pesanan yang dibuat akhir September dan belum selesai tidak masuk profit (benar begitu).

HPP per produk
--------------
${hppRows.map((r) => `${(r.p.name + (r.v ? ` (${r.v})` : '')).padEnd(52)} ${rupiah(r.p.hpp)}`).join('\n')}

Peringatan yang memang SENGAJA muncul saat upload pesanan:
- Lip Tint dikenali dari SKU Induk + variasi (tidak punya SKU variasi).
- Sheet Mask dan Bedak Tabur tidak punya SKU (dikenali dari nama).
- Beberapa item punya barang retur.

Dibuat ulang dengan: npm run sample -- "${STORE}"
`
fs.writeFileSync(path.join(OUT, 'BACA-DULU.txt'), readme)
console.log(readme)
console.log('File dibuat di', OUT)
