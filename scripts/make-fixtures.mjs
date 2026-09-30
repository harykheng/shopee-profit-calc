// Membuat file fixture DUMMY untuk test di tests/fixtures/.
// Struktur kolom / layout sama dengan file Shopee asli, tapi SEMUA data pembeli
// dan toko palsu. Jalankan: node scripts/make-fixtures.mjs
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const OUT = path.resolve(import.meta.dirname, '../tests/fixtures')
fs.mkdirSync(OUT, { recursive: true })

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

let buyerNo = 0
function row(fields) {
  buyerNo++
  const base = {
    'Shipped by Advance Fulfilment': 'N',
    'No. Resi': `DUMMYRESI${String(buyerNo).padStart(6, '0')}`,
    'Opsi Pengiriman': 'Reguler (Cashless)-Dummy Express',
    'Antar ke counter/ pick-up': 'Antar ke Counter',
    'Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)': '2026-08-03 23:59',
    'Waktu Pengiriman Diatur': '2026-08-02 10:00',
    'Waktu Pesanan Dibuat': '2026-08-01 08:00',
    'Waktu Pembayaran Dilakukan': '2026-08-01 08:05',
    'Metode Pembayaran': 'Online Payment',
    'Returned quantity': '0',
    'Total Diskon': '0', 'Diskon Dari Penjual': '0', 'Diskon Dari Shopee': '0',
    'Berat Produk': '100 gr', 'Jumlah Produk di Pesan': '1', 'Total Berat': '100 gr',
    'Voucher Ditanggung Penjual': '0', 'Cashback Koin': '0', 'Voucher Ditanggung Shopee': '0',
    'Paket Diskon': '0', 'Paket Diskon (Diskon dari Shopee)': '0',
    'Paket Diskon (Diskon dari Penjual)': '0', 'Potongan Koin Shopee': '0',
    'Diskon Kartu Kredit': '0', 'Ongkos Kirim Dibayar oleh Pembeli': '0',
    'Estimasi Potongan Biaya Pengiriman': '0', 'Ongkos Kirim Pengembalian Barang': '0',
    'Perkiraan Ongkos Kirim': '0',
    // Data pembeli PALSU
    'Username (Pembeli)': `pembeli_dummy_${buyerNo}`,
    'Nama Penerima': `Penerima Dummy ${buyerNo}`,
    'No. Telepon': `62800000000${String(buyerNo).padStart(2, '0')}`,
    'Alamat Pengiriman': `Jl. Contoh Dummy No. ${buyerNo}, Kota Contoh`,
    'Kota/Kabupaten': 'KOTA CONTOH',
    'Provinsi': 'PROVINSI CONTOH',
  }
  const r = { ...base, ...fields }
  if (r['Total Pembayaran'] === undefined) r['Total Pembayaran'] = r['Subtotal Pesanan']
  if (r['Harga Awal'] === undefined) r['Harga Awal'] = r['Harga Setelah Diskon']
  return HEADERS.map((h) => r[h] ?? '')
}

const orders = [
  // Punya Nomor Referensi SKU
  row({ 'No. Pesanan': '260801DUMMY001', 'Status Pesanan': 'Selesai', 'SKU Induk': 'DUM-POND',
    'Nama Produk': "Pond's Dummy Day Cream 9gr", 'Nomor Referensi SKU': 'DUM-POND',
    'Harga Setelah Diskon': '37.200', 'Jumlah': '1', 'Subtotal Pesanan': '37.200',
    'Waktu Pesanan Selesai': '2026-08-05 10:17' }),
  // Satu pesanan, dua variasi dengan SKU Induk yang sama
  row({ 'No. Pesanan': '260801DUMMY002', 'Status Pesanan': 'Selesai', 'SKU Induk': 'DUM-DOT',
    'Nama Produk': 'Dot Bayi Dummy 1 Toples 18PCS', 'Nama Variasi': 'M',
    'Harga Setelah Diskon': '28.500', 'Jumlah': '2', 'Subtotal Pesanan': '57.000',
    'Jumlah Produk di Pesan': '3', 'Waktu Pesanan Selesai': '2026-08-06 09:00',
    'Catatan dari Pembeli': 'Catatan dummy dari pembeli' }),
  row({ 'No. Pesanan': '260801DUMMY002', 'Status Pesanan': 'Selesai', 'SKU Induk': 'DUM-DOT',
    'Nama Produk': 'Dot Bayi Dummy 1 Toples 18PCS', 'Nama Variasi': 'L (Regular)',
    'Harga Setelah Diskon': '28.500', 'Jumlah': '1', 'Subtotal Pesanan': '28.500',
    'Jumlah Produk di Pesan': '3', 'Waktu Pesanan Selesai': '2026-08-06 09:00' }),
  // Tanpa SKU sama sekali, tanpa variasi
  row({ 'No. Pesanan': '260802DUMMY003', 'Status Pesanan': 'Selesai',
    'Nama Produk': '[HARGA GROSIR] Sikat Gigi Dummy 12PCS', 'Harga Awal': '55.000',
    'Harga Setelah Diskon': '49.550', 'Jumlah': '4', 'Subtotal Pesanan': '198.200',
    'Waktu Pesanan Selesai': '2026-08-06 15:30' }),
  // Tanpa SKU, dengan variasi, sebagian diretur
  row({ 'No. Pesanan': '260802DUMMY004', 'Status Pesanan': 'Selesai',
    'Status Pembatalan/ Pengembalian': 'Permintaan Disetujui',
    'Nama Produk': '[GROSIR] Bedak Dummy Silver / Putih', 'Nama Variasi': 'Putih',
    'Harga Setelah Diskon': '25.000', 'Jumlah': '2', 'Returned quantity': '1',
    'Subtotal Pesanan': '50.000', 'Waktu Pesanan Selesai': '2026-08-17 11:00' }),
  // Status yang harus dilewati
  row({ 'No. Pesanan': '260803DUMMY005', 'Status Pesanan': 'Batal', 'SKU Induk': 'DUM-DOT',
    'Nama Produk': 'Dot Bayi Dummy 1 Toples 18PCS', 'Nama Variasi': 'S',
    'Harga Setelah Diskon': '28.500', 'Jumlah': '1', 'Subtotal Pesanan': '28.500' }),
  row({ 'No. Pesanan': '260803DUMMY006', 'Status Pesanan': 'Belum Bayar',
    'Nama Produk': '[HARGA GROSIR] Sikat Gigi Dummy 12PCS', 'Harga Setelah Diskon': '49.550',
    'Jumlah': '1', 'Subtotal Pesanan': '49.550' }),
  // Dua baris kembar (pesanan + produk sama) → digabung; selesai 23:59 WIB tetap Agustus
  row({ 'No. Pesanan': '260804DUMMY007', 'Status Pesanan': 'Selesai',
    'Nama Produk': '[HARGA GROSIR] Sikat Gigi Dummy 12PCS', 'Harga Setelah Diskon': '49.550',
    'Jumlah': '1', 'Subtotal Pesanan': '49.550', 'Waktu Pesanan Selesai': '2026-08-31 23:59' }),
  row({ 'No. Pesanan': '260804DUMMY007', 'Status Pesanan': 'Selesai',
    'Nama Produk': '[HARGA GROSIR] Sikat Gigi Dummy 12PCS', 'Harga Setelah Diskon': '49.550',
    'Jumlah': '1', 'Subtotal Pesanan': '49.550', 'Waktu Pesanan Selesai': '2026-08-31 23:59' }),
  row({ 'No. Pesanan': '260805DUMMY008', 'Status Pesanan': 'Sedang Dikirim',
    'Nama Produk': "Pond's Dummy Day Cream 9gr", 'SKU Induk': 'DUM-POND',
    'Nomor Referensi SKU': 'DUM-POND', 'Harga Setelah Diskon': '37.200', 'Jumlah': '1',
    'Subtotal Pesanan': '37.200' }),
  // Angka sebagai sel numerik (bukan teks)
  row({ 'No. Pesanan': '260805DUMMY009', 'Status Pesanan': 'Selesai', 'SKU Induk': 'DUM-DOT',
    'Nama Produk': 'Dot Bayi Dummy 1 Toples 18PCS', 'Nama Variasi': 'S',
    'Harga Setelah Diskon': 25000, 'Jumlah': 3, 'Subtotal Pesanan': 75000,
    'Waktu Pesanan Selesai': '2026-08-20 08:00' }),
  // Selesai tapi waktu selesai kosong → dilewati sebagai data rusak
  row({ 'No. Pesanan': '260806DUMMY010', 'Status Pesanan': 'Selesai',
    'Nama Produk': "Pond's Dummy Day Cream 9gr", 'SKU Induk': 'DUM-POND',
    'Nomor Referensi SKU': 'DUM-POND', 'Harga Setelah Diskon': '37.200', 'Jumlah': '1',
    'Subtotal Pesanan': '37.200' }),
]

const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...orders])
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'orders')
fs.writeFileSync(path.join(OUT, 'orders_dummy.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

// ---------------------------------------------------------------------------
// Laporan penghasilan (.pdf) — layout meniru "Catatan Transaksi Penghasilan"
// ---------------------------------------------------------------------------
const MINUS = '−' // Shopee memakai tanda minus unicode
const fmt = (n) => (n < 0 ? MINUS + String(-n) : String(n))

// [tanggal, subtotal pesanan, ongkir, voucher, biaya platform, gratis ongkir, layanan]
const daily = [
  ['2026/08/01', 120000, 0, -300, -12000, -4800, 0], // pesanan bulan Juli (tidak ada di export)
  ['2026/08/05', 37200, 0, 0, -3720, -1488, 0],
  ['2026/08/06', 283700, 0, -600, -28370, -11348, 0],
  ['2026/08/17', 25000, 0, 0, -2500, -1000, 0], // 50.000 dikurangi refund 25.000
  ['2026/08/20', 75000, 0, -300, -7500, -3000, 0],
  ['2026/08/31', 99100, 0, 0, -9910, -3964, 0],
].map((r) => [...r, r.slice(1).reduce((a, b) => a + b, 0)])
const totals = daily[0].slice(1).map((_, i) => daily.reduce((s, r) => s + r[i + 1], 0))
const refund = -25000

const pdf = await PDFDocument.create()
pdf.registerFontkit(fontkit)
const fontBytes = fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
const font = await pdf.embedFont(fontBytes, { subset: true })
pdf.setTitle('Dummy income report')
pdf.setProducer('make-fixtures')
pdf.setCreator('make-fixtures')
pdf.setCreationDate(new Date('2026-09-01T00:00:00Z'))
pdf.setModificationDate(new Date('2026-09-01T00:00:00Z'))

const COLS = [40, 110, 180, 240, 300, 370, 440, 510]
function newPage() {
  const page = pdf.addPage([595, 842])
  let y = 800
  const text = (s, x, size = 9) => page.drawText(s, { x, y, size, font })
  return {
    line(s, x = 40) { text(s, x); y -= 14 },
    // Tulis sel dari kanan ke kiri supaya test membuktikan pengurutan per posisi X.
    cells(values) { [...values].map((v, i) => [v, COLS[i]]).reverse().forEach(([v, x]) => text(v, x)); y -= 14 },
    // Dua teks dengan Y sedikit berbeda (masih satu baris visual).
    split(a, b, xb) { text(a, 40); page.drawText(b, { x: xb, y: y - 1, size: 9, font }); y -= 14 },
    gap() { y -= 8 },
  }
}

let p = newPage()
p.line('Catatan Transaksi Penghasilan')
p.line('Toko Dummy Beauty 1234567890123456')
p.split('Catatan Transaksi untuk 2026-08-01 sampai', 'Username :tokodummy', 330)
p.split('Jl. Contoh Dummy No. 1, Kota Contoh', '2026-08-31', 330)
p.line('Rekening Bank :********0000')
p.gap()
p.line('Ringkasan Dana yang Dilepaskan')
p.line(`Subtotal Pesanan ${fmt(totals[0])}`)
p.line(`Harga Produk ${fmt(totals[0] - refund)}`)
p.line(`Jumlah Pengembalian Dana ${fmt(refund)}`)
p.line(`Subtotal Ongkos Kirim ${fmt(totals[1])}`)
p.line(`Voucher & Subsidi ${fmt(totals[2])}`)
p.line(`Biaya Platform ${fmt(totals[3])}`)
p.line(`Biaya Gratis Ongkir XTRA ${fmt(totals[4])}`)
p.line(`Subtotal Biaya Layanan Tambahan ${fmt(totals[5])}`)
p.line('Total Penghasilan')
p.line(`Rp${totals[6].toLocaleString('en-US')}`)
p.gap()

const tableHeader = () => {
  p.line('Rincian Dana Dilepaskan')
  p.line('Tanggal Dana Subtotal Subtotal Ongkos Voucher & Biaya Biaya Gratis Ongkir Subtotal Biaya Layanan Total Penghasilan')
}
const totalRow = () =>
  p.cells(['Total Penghasilan', ...totals.slice(0, -1).map(fmt), `Rp${totals[6].toLocaleString('en-US')}`])

tableHeader()
daily.slice(0, 3).forEach((r) => p.cells([r[0], ...r.slice(1).map(fmt)]))
totalRow()

p = newPage()
tableHeader()
daily.slice(3).forEach((r) => p.cells([r[0], ...r.slice(1).map(fmt)]))
totalRow()
p.gap()
p.line('Ringkasan Biaya Penyesuaian Jumlah')
p.line('Tidak ada riwayat transaksi minggu ini.')
p.line('Rincian Biaya Penyesuaian')
p.line('Tidak ada riwayat transaksi minggu ini.')

fs.writeFileSync(path.join(OUT, 'income_dummy.pdf'), await pdf.save())
console.log('Fixture dibuat di', OUT)
