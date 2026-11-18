// Membuat data sample PALSU untuk konten "laris belum tentu untung": 2 produk, 1 bulan (Oktober 2026).
//   Produk A: 100 terjual × Rp50.000, HPP Rp32.000, potongan Shopee Rp8.000/unit  → untung Rp1.000.000
//   Produk B:  60 terjual × Rp80.000, HPP Rp40.000, potongan Shopee Rp12.000/unit → untung Rp1.680.000
// Isi: export pesanan (.xlsx) + laporan penghasilan "Sudah Dilepas" (.xlsx). Potongan per unit diambil
// dari uang masuk asli per pesanan, jadi Rekap → Per produk menampilkan angka di atas persis.
//
// Jalankan: npm run sample:2produk -- "Nama Toko"   (default "Toko Demo 2 Produk")
// Hasil di folder sample-store/2-produk/ (di-gitignore). Semua data pembeli dan toko palsu.
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

const STORE = process.argv[2]?.trim() || 'Toko Demo 2 Produk'
const USERNAME = STORE.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tokodemo'
const OUT = path.resolve(import.meta.dirname, '../sample-store/2-produk')
fs.mkdirSync(OUT, { recursive: true })

let seed = 20261031
function rand() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1))

// Potongan per unit = admin + proses pesanan + Gratis Ongkir XTRA. Semua pesanan berisi 1 barang,
// supaya biaya proses per pesanan tidak menggeser potongan per unit.
const PRODUCTS = [
  { label: 'Produk A', name: 'Body Serum Brightening 100ml', sku: 'DEMO-A-SERUM', id: '25910001', price: 50000, hpp: 32000, sold: 100,
    fee: { admin: 4000, proses: 1250, xtra: 2750 } },
  { label: 'Produk B', name: 'Night Cream Retinol 30gr', sku: 'DEMO-B-CREAM', id: '25910002', price: 80000, hpp: 40000, sold: 60,
    fee: { admin: 6400, proses: 1250, xtra: 4350 } },
]
for (const p of PRODUCTS) p.feeTotal = p.fee.admin + p.fee.proses + p.fee.xtra

const pad = (n) => String(n).padStart(2, '0')
const dayStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const dtStr = (d) => `${dayStr(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
const addMin = (d, m) => new Date(d.getTime() + m * 60_000)

// Pesanan dibuat 1–26 Okt, selesai 2–4 hari kemudian (semua masih di Oktober), dana cair hari itu juga.
const orders = []
for (const p of PRODUCTS) {
  for (let k = 0; k < p.sold; k++) orders.push({ p, created: new Date(Date.UTC(2026, 9, randInt(1, 26), randInt(7, 22), randInt(0, 59))) })
}
orders.sort((a, b) => a.created - b.created)
orders.forEach((o, i) => {
  o.no = `2610${pad(o.created.getUTCDate())}DM${String(i + 1).padStart(5, '0')}`
  o.completed = addMin(o.created, randInt(2 * 1440, 4 * 1440))
  o.paid = addMin(o.created, randInt(1, 30))
})

// ---------------------------------------------------------------------------
// Export pesanan (.xlsx): kolom & urutan sama dengan export Shopee
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
const fmtId = (n) => Number(n).toLocaleString('id-ID')
const COURIERS = ['Reguler (Cashless)-SPX Standard', 'Reguler (Cashless)-J&T Express', 'Hemat Kargo-SPX Hemat']
const PAYMENTS = ['ShopeePay', 'SPayLater', 'COD (Bayar di Tempat)', 'Transfer Bank']

const orderSheet = orders.map((o, i) => {
  const n = i + 1
  const v = {
    'No. Pesanan': o.no, 'Status Pesanan': 'Selesai', 'Shipped by Advance Fulfilment': 'N',
    'No. Resi': `SPXID0${4200000000 + n}`, 'Opsi Pengiriman': COURIERS[n % COURIERS.length],
    'Antar ke counter/ pick-up': 'Antar ke Counter', 'Waktu Pesanan Dibuat': dtStr(o.created),
    'Waktu Pembayaran Dilakukan': dtStr(o.paid), 'Tipe Pesanan': '-', 'Metode Pembayaran': PAYMENTS[n % PAYMENTS.length],
    'SKU Induk': o.p.sku, 'Nama Produk': o.p.name, 'Nomor Referensi SKU': o.p.sku, 'Nama Variasi': '',
    'Harga Awal': fmtId(o.p.price), 'Harga Setelah Diskon': fmtId(o.p.price), 'Jumlah': 1, 'Returned quantity': 0,
    'Subtotal Pesanan': fmtId(o.p.price), 'Total Diskon': '0', 'Diskon Dari Penjual': '0', 'Diskon Dari Shopee': 0,
    'Berat Produk': '100 gr', 'Jumlah Produk di Pesan': 1, 'Total Berat': '100 gr', 'Voucher Ditanggung Penjual': '0',
    'Cashback Koin': 0, 'Voucher Ditanggung Shopee': 0, 'Paket Diskon': 0, 'Paket Diskon (Diskon dari Shopee)': 0,
    'Paket Diskon (Diskon dari Penjual)': 0, 'Potongan Koin Shopee': 0, 'Diskon Kartu Kredit': 0,
    'Ongkos Kirim Dibayar oleh Pembeli': 0, 'Estimasi Potongan Biaya Pengiriman': 0, 'Ongkos Kirim Pengembalian Barang': 0,
    'Total Pembayaran': fmtId(o.p.price), 'Perkiraan Ongkos Kirim': 0,
    // Data pembeli PALSU
    'Username (Pembeli)': `pembeli_dummy_demo_${n}`, 'Nama Penerima': `Penerima Dummy ${n}`,
    'No. Telepon': `628002${String(n).padStart(6, '0')}`, 'Alamat Pengiriman': `Jl. Contoh Dummy No. ${n % 200}, Kota Contoh`,
    'Kota/Kabupaten': 'KOTA CONTOH', 'Provinsi': 'PROVINSI CONTOH', 'Waktu Pesanan Selesai': dtStr(o.completed),
  }
  return HEADERS.map((h) => (v[h] === undefined ? '' : String(v[h])))
})
const wbOrders = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wbOrders, XLSX.utils.aoa_to_sheet([HEADERS, ...orderSheet]), 'orders')
fs.writeFileSync(path.join(OUT, '1-pesanan-2026-10.xlsx'), XLSX.write(wbOrders, { type: 'buffer', bookType: 'xlsx' }))

// ---------------------------------------------------------------------------
// Penghasilan "Sudah Dilepas" (.xlsx): tata letak sama dengan export Shopee (lihat tests/incomeXlsx.test.ts)
// ---------------------------------------------------------------------------
const INCOME_HEADER = [
  'No.', 'Lihat berdasarkan', 'No. Pesanan', 'No. Pengajuan', 'ID Produk', 'Nama Produk',
  'Waktu Pesanan Dibuat', 'Tanggal Dana Dilepaskan', 'Metode Pelepasan Dana', 'Tipe Pesanan',
  'Total Penghasilan', 'Harga Produk', 'Jumlah Pengembalian Dana ke Pembeli', 'Ongkir Dibayar Pembeli',
  'Ongkos Kirim yang Dibayarkan ke Jasa Kirim', 'Potongan Ongkos Kirim dari Jasa Kirim', 'Gratis Ongkir dari Shopee',
  'Ongkos Kirim Pengembalian Barang', 'Return to Seller Fee', 'Pengembalian Biaya Kirim',
  'Voucher disponsor oleh Penjual', 'Cashback Koin disponsori Penjual', 'Diskon Produk dari Shopee',
  'Voucher co-fund disponsor oleh Penjual', 'Cashback Koin Co-fund disponsori Penjual', 'Biaya Administrasi',
  'Biaya Proses Pesanan', 'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)', 'Biaya Kampanye', 'Biaya Komisi AMS',
  'Biaya Isi Saldo Otomatis (dari Penghasilan)', 'Premi', 'FBS Fee', 'PPh 22', 'Username (Pembeli)',
  'Jumlah Dibayar Pembeli', 'Metode pembayaran pembeli',
]
let lineNo = 0
const incomeRows = []
for (const [i, o] of orders.entries()) {
  const amounts = {
    'Total Penghasilan': o.p.price - o.p.feeTotal,
    'Harga Produk': o.p.price,
    'Biaya Administrasi': -o.p.fee.admin,
    'Biaya Proses Pesanan': -o.p.fee.proses,
    'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)': -o.p.fee.xtra,
  }
  for (const kind of ['Order', 'Sku']) {
    const v = {
      'No.': ++lineNo, 'Lihat berdasarkan': kind, 'No. Pesanan': o.no, 'No. Pengajuan': '',
      'ID Produk': kind === 'Sku' ? o.p.id : '-', 'Nama Produk': kind === 'Sku' ? o.p.name : '-',
      'Waktu Pesanan Dibuat': dayStr(o.created), 'Tanggal Dana Dilepaskan': dayStr(o.completed),
      'Metode Pelepasan Dana': 'Saldo Penjual', 'Tipe Pesanan': 'Normal Order',
      'Username (Pembeli)': kind === 'Order' ? `pembeli_dummy_demo_${i + 1}` : '',
      'Jumlah Dibayar Pembeli': kind === 'Order' ? o.p.price : 0, 'Metode pembayaran pembeli': PAYMENTS[(i + 1) % PAYMENTS.length],
      ...amounts,
    }
    incomeRows.push(INCOME_HEADER.map((h) => v[h] ?? 0))
  }
}
const totalIncome = orders.reduce((s, o) => s + o.p.price - o.p.feeTotal, 0)
const omzet = orders.reduce((s, o) => s + o.p.price, 0)
const wbIncome = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wbIncome, XLSX.utils.aoa_to_sheet([
  ['Laporan Penghasilan'], [], [], [], ['Rincian Laporan'],
  ['Username (Penjual)', USERNAME], ['Dari', '2026-10-01'], ['ke', '2026-10-31'], [],
  ['Ringkasan Penghasilan', null, null, 'Rp'],
  ['1. Total Pendapatan', null, null, omzet],
  ['3. Total yang Dilepas', null, null, totalIncome],
]), 'Summary')
XLSX.utils.book_append_sheet(wbIncome, XLSX.utils.aoa_to_sheet([
  ['Ringkasan Biaya Penyesuaian'], ['Total Penyesuaian', null, null, null, 0],
]), 'Adjustment')
XLSX.utils.book_append_sheet(wbIncome, XLSX.utils.aoa_to_sheet([['No.', 'No. Pesanan', 'Biaya Platform']]), 'Seller Fee')
XLSX.utils.book_append_sheet(wbIncome, XLSX.utils.aoa_to_sheet([['Informasi Pesanan'], [''], INCOME_HEADER, ...incomeRows]), 'Penghasilan')
fs.writeFileSync(path.join(OUT, '2-penghasilan-2026-10.xlsx'), XLSX.write(wbIncome, { type: 'buffer', bookType: 'xlsx' }))

// ---------------------------------------------------------------------------
// HPP + petunjuk
// ---------------------------------------------------------------------------
const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID')
const sqlStr = (s) => `'${s.replaceAll("'", "''")}'`
fs.writeFileSync(path.join(OUT, '3-isi-hpp.sql'), [
  `-- Isi HPP ${STORE} (jalankan di Supabase SQL Editor SETELAH upload export pesanan).`,
  `-- Alternatif: isi manual di halaman HPP aplikasi.`,
  'update public.products p set hpp = v.hpp, updated_at = now()',
  'from (values',
  PRODUCTS.map((p, i) => `  (${sqlStr(p.sku)}, ${p.hpp})${i < PRODUCTS.length - 1 ? ',' : ''}`).join('\n'),
  ') as v(sku, hpp)',
  `where p.sku = v.sku and p.store_id = (select id from public.stores where name = ${sqlStr(STORE)} order by id desc limit 1);`,
  '',
].join('\n'))

const table = PRODUCTS.map((p) => {
  const profit = p.sold * (p.price - p.hpp - p.feeTotal)
  return `${p.label.padEnd(9)} ${p.name.padEnd(30)} ${String(p.sold).padStart(4)}  ${rupiah(p.price).padEnd(9)} ${rupiah(p.sold * p.price).padEnd(12)} ${rupiah(p.hpp).padEnd(9)} ${rupiah(p.feeTotal).padEnd(9)} ${rupiah(profit)}`
}).join('\n')
const readme = `DATA SAMPLE "LARIS BELUM TENTU UNTUNG" (PALSU, aman untuk konten & testing)
==========================================================================

Toko: "${STORE}" (sebaiknya toko KOSONG, supaya Rekap hanya berisi 2 produk ini).
Bulan: Oktober 2026. Semua ${orders.length} pesanan Selesai, 1 barang per pesanan, tanpa retur/batal/voucher.

                                         Unit  Harga     Omzet        HPP       Potongan  Untung
${table}

Potongan per unit: A = admin Rp4.000 + proses Rp1.250 + Gratis Ongkir XTRA Rp2.750 (16%)
                   B = admin Rp6.400 + proses Rp1.250 + Gratis Ongkir XTRA Rp4.350 (15%)
Untung = sebelum iklan & biaya toko (laba kontribusi).

Urutan
------
1. Upload → Export pesanan: 1-pesanan-2026-10.xlsx
   Upload → Laporan penghasilan: 2-penghasilan-2026-10.xlsx   (total cair ${rupiah(totalIncome)})
2. HPP: isi di halaman HPP (A ${rupiah(PRODUCTS[0].hpp)}, B ${rupiah(PRODUCTS[1].hpp)}) ATAU jalankan 3-isi-hpp.sql.
   PENTING: HPP dikunci saat pesanan di-upload. Kalau HPP diisi SESUDAH upload, buka Rekap Oktober lalu
   tekan "Hitung ulang HPP".
3. Rekap Oktober → tab "Per produk":
   - urut "Terlaris": Produk A di atas (100 terjual)
   - urut "Untung": Produk B di atas (${rupiah(PRODUCTS[1].sold * (PRODUCTS[1].price - PRODUCTS[1].hpp - PRODUCTS[1].feeTotal))} vs ${rupiah(PRODUCTS[0].sold * (PRODUCTS[0].price - PRODUCTS[0].hpp - PRODUCTS[0].feeTotal))})
4. Biaya (opsional): kosongkan supaya untung bersih bulan = jumlah untung kedua produk.

Dibuat ulang dengan: npm run sample:2produk -- "${STORE}"
`
fs.writeFileSync(path.join(OUT, 'BACA-DULU.txt'), readme)
console.log(readme)
console.log('File dibuat di', OUT)
