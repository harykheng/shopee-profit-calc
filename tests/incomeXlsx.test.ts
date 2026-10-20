import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { ParseError } from '../src/lib/parsers/common'
import { parseIncomeXlsxWorkbook } from '../src/lib/parsers/incomeXlsx'
import { parseOrdersWorkbook } from '../src/lib/parsers/orders'

// Tata letak sama dengan export Shopee "Sudah Dilepas" (Juli 2026), semua data PALSU.
const HEADER = [
  'No.', 'Lihat berdasarkan', 'No. Pesanan', 'No. Pengajuan', 'ID Produk', 'Nama Produk',
  'Waktu Pesanan Dibuat', 'Tanggal Dana Dilepaskan', 'Metode Pelepasan Dana', 'Tipe Pesanan',
  'Total Penghasilan', 'Harga Produk', 'Jumlah Pengembalian Dana ke Pembeli', 'Ongkir Dibayar Pembeli',
  'Ongkos Kirim yang Dibayarkan ke Jasa Kirim', 'Potongan Ongkos Kirim dari Jasa Kirim', 'Gratis Ongkir dari Shopee',
  'Ongkos Kirim Pengembalian Barang', 'Return to Seller Fee', 'Pengembalian Biaya Kirim',
  'Voucher disponsor oleh Penjual', 'Cashback Koin disponsori Penjual', 'Diskon Produk dari Shopee',
  'Voucher co-fund disponsor oleh Penjual', 'Cashback Koin Co-fund disponsori Penjual', 'Biaya Administrasi',
  'Biaya Proses Pesanan', 'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori E)',
  'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)', 'Biaya Kampanye', 'Biaya Komisi AMS',
  'Biaya Isi Saldo Otomatis (dari Penghasilan)', 'Premi', 'FBS Fee', 'PPh 22', 'Username (Pembeli)',
  'Jumlah Dibayar Pembeli', 'Metode pembayaran pembeli',
]

type Amounts = Partial<Record<(typeof HEADER)[number], number | string>>

function line(kind: 'Order' | 'Sku', orderNo: string, released: string, a: Amounts, product = '-', productId = '-') {
  const v: Amounts = {
    'Lihat berdasarkan': kind,
    'No. Pesanan': orderNo,
    'No. Pengajuan': '',
    'ID Produk': productId,
    'Nama Produk': product,
    'Waktu Pesanan Dibuat': '2026-07-10',
    'Tanggal Dana Dilepaskan': released,
    'Metode Pelepasan Dana': 'Saldo Penjual',
    'Tipe Pesanan': 'Normal Order',
    'Username (Pembeli)': kind === 'Order' ? 'pembeli_dummy' : '',
    'Metode pembayaran pembeli': 'COD (Bayar di Tempat)',
    ...a,
  }
  return HEADER.map((h) => v[h] ?? 0)
}

// Pesanan 1: satu produk. Pesanan 2: dua produk (dipecah per baris Sku). Pesanan 3: retur penuh.
const P1 = { 'Total Penghasilan': 22881, 'Harga Produk': 27500, 'Ongkos Kirim yang Dibayarkan ke Jasa Kirim': -3500,
  'Gratis Ongkir dari Shopee': 3500, 'Biaya Administrasi': -2269, 'Biaya Proses Pesanan': -1250,
  'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)': -1100 }
const P2a = { 'Total Penghasilan': 44017, 'Harga Produk': 52000, 'Biaya Administrasi': -4290, 'Biaya Proses Pesanan': -833,
  'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)': -2860 }
const P2b = { 'Total Penghasilan': 22008, 'Harga Produk': 26000, 'Biaya Administrasi': -2145, 'Biaya Proses Pesanan': -417,
  'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)': -1430 }
const P2 = { 'Total Penghasilan': 66025, 'Harga Produk': 78000, 'Biaya Administrasi': -6435, 'Biaya Proses Pesanan': -1250,
  'Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)': -4290 }
const P3 = { 'Total Penghasilan': 0, 'Harga Produk': 27500, 'Jumlah Pengembalian Dana ke Pembeli': -27500,
  'Ongkos Kirim yang Dibayarkan ke Jasa Kirim': -6500, 'Gratis Ongkir dari Shopee': 6500, 'No. Pengajuan': '239100000000001' }

function orderRows() {
  return [
    line('Order', 'DUMMY0001', '2026-07-18', P1),
    line('Sku', 'DUMMY0001', '2026-07-18', P1, 'Bedak Dummy 12g', '111'),
    line('Order', 'DUMMY0002', '2026-07-18', P2),
    line('Sku', 'DUMMY0002', '2026-07-18', P2a, 'Bedak Tabur Dummy 40g', '222'),
    line('Sku', 'DUMMY0002', '2026-07-18', P2b, 'Bedak Tabur Dummy 40g', '222'),
    line('Order', 'DUMMY0003', '2026-07-31', P3),
    line('Sku', 'DUMMY0003', '2026-07-31', { ...P3, 'No. Pengajuan': '-' }, 'Bedak Dummy 12g', '111'),
  ]
}

function workbook(opts: { rows?: unknown[][]; total?: number; adjustments?: boolean } = {}) {
  const rows = opts.rows ?? orderRows()
  const total = opts.total ?? 22881 + 66025
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Laporan Penghasilan'], [], [], [], ['Rincian Laporan'],
      ['Username (Penjual)', 'tokodummy'], ['Dari', '2026-07-01'], ['ke', '2026-07-31'], [],
      ['Ringkasan Penghasilan', null, null, 'Rp'],
      ['1. Total Pendapatan', null, null, 133000],
      ['3. Total yang Dilepas', null, null, total],
    ]),
    'Summary',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      opts.adjustments === false
        ? [['Ringkasan Biaya Penyesuaian'], ['Total Penyesuaian', null, null, null, 0]]
        : [
            ['Catatan: penyesuaian dummy'],
            ['Username (Penjual)', 'tokodummy'],
            ['Dari', '2026-07-01', 'ke', '2026-07-31'],
            [], ['Ringkasan Biaya Penyesuaian'],
            ['Total Penyesuaian', null, null, null, 22881],
            [null, 'Penyesuaian/Kompensasi Pengembalian Barang/Dana', null, 22881],
            [], ['Rincian Transaksi Penyesuaian'],
            ['No.', 'Tanggal Penyesuaian Dibuat', 'Tipe Penyesuaian | Deskripsi', 'Alasan Penyesuaian',
              'Biaya Penyesuaian', 'No. Pesanan Terhubung', 'Tanggal Dana Dilepaskan'],
            [1, '2026-07-30', 'Penyesuaian/Kompensasi Pengembalian Barang/Dana', null, 22881, 'DUMMY0003', '2026-07-31'],
            [],
            ['Total Biaya', null, null, null, 22881],
          ],
    ),
    'Adjustment',
  )
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No.', 'No. Pesanan', 'Biaya Platform']]), 'Seller Fee')
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['Informasi Pesanan'], [''], HEADER, ...rows]),
    'Penghasilan',
  )
  return wb
}

describe('parseIncomeXlsxWorkbook — export "Sudah Dilepas"', () => {
  const r = parseIncomeXlsxWorkbook(workbook())

  it('reads header info and period', () => {
    expect(r.source).toBe('xlsx')
    expect(r.shopName).toBe('tokodummy')
    expect(r.periodStart).toBe('2026-07-01')
    expect(r.periodEnd).toBe('2026-07-31')
    expect(r.warnings).toEqual([])
  })

  it('aggregates Order rows per release date, grouped like the PDF', () => {
    expect(r.days).toEqual([
      {
        released_date: '2026-07-18',
        subtotal_pesanan: 27500 + 78000,
        subtotal_ongkir: 0,
        voucher_subsidi: 0,
        biaya_platform: -2269 - 1250 - 6435 - 1250,
        biaya_gratis_ongkir: -1100 - 4290,
        biaya_layanan_tambahan: 0,
        total_income: 22881 + 66025,
      },
      {
        released_date: '2026-07-31',
        subtotal_pesanan: 0,
        subtotal_ongkir: 0,
        voucher_subsidi: 0,
        biaya_platform: 0,
        biaya_gratis_ongkir: 0,
        biaya_layanan_tambahan: 0,
        total_income: 0,
      },
    ])
    expect(r.totalIncome).toBe(88906)
    expect(r.summary).toEqual({ hargaProduk: 133000, pengembalianDana: -27500 })
  })

  it('keeps one line per product, with real fees per product', () => {
    expect(r.orders.map((o) => [o.order_no, o.line_no, o.product_id, o.total_income, o.biaya_admin])).toEqual([
      ['DUMMY0001', 1, '111', 22881, -2269],
      ['DUMMY0002', 1, '222', 44017, -4290],
      ['DUMMY0002', 2, '222', 22008, -2145],
      ['DUMMY0003', 1, '111', 0, 0],
    ])
    // Nomor retur dari baris Order dipakai kalau baris Sku-nya kosong.
    expect(r.orders[3].return_no).toBe('239100000000001')
    expect(r.orders[3].pengembalian_dana).toBe(-27500)
  })

  it('never keeps buyer data', () => {
    expect(JSON.stringify(r)).not.toContain('pembeli_dummy')
    expect(JSON.stringify(r)).not.toContain('COD')
  })

  it('reads adjustments with the release date and linked order', () => {
    expect(r.adjustments).toEqual([
      { date: '2026-07-31', description: 'Penyesuaian/Kompensasi Pengembalian Barang/Dana', amount: 22881, orderNo: 'DUMMY0003' },
    ])
    expect(r.adjustmentsComplete).toBe(true)
  })

  it('accepts a file without adjustments', () => {
    expect(parseIncomeXlsxWorkbook(workbook({ adjustments: false })).adjustments).toEqual([])
  })

  it('rejects a file whose total does not match the order rows', () => {
    expect(() => parseIncomeXlsxWorkbook(workbook({ total: 1 }))).toThrow(ParseError)
  })

  it('puts unknown fee columns into biaya lain, with a warning', () => {
    const rows = orderRows()
    // Kolom biaya baru yang belum dikenal: −500 di pesanan 1 (Order & Sku).
    const header = [...HEADER, 'Biaya Baru Dummy']
    const extra = (row: unknown[], v: number) => [...row, v]
    const totalCol = HEADER.indexOf('Total Penghasilan')
    const withFee = rows.map((row, i) => {
      if (i > 1) return extra(row, 0)
      const copy = [...row]
      copy[totalCol] = (copy[totalCol] as number) - 500
      return extra(copy, -500)
    })
    const wb = workbook({ total: 22881 + 66025 - 500 })
    wb.Sheets['Penghasilan'] = XLSX.utils.aoa_to_sheet([['Informasi Pesanan'], [''], header, ...withFee])
    const res = parseIncomeXlsxWorkbook(wb)
    expect(res.days[0].biaya_layanan_tambahan).toBe(-500)
    expect(res.orders[0].biaya_lain).toBe(-500)
    expect(res.warnings.map((w) => w.code)).toContain('fee_columns_unknown')
  })

  it('falls back to one line per order when Sku rows do not add up', () => {
    const rows = orderRows()
    rows.splice(4, 1) // buang satu baris produk pesanan 2
    const res = parseIncomeXlsxWorkbook(workbook({ rows }))
    expect(res.orders.filter((o) => o.order_no === 'DUMMY0002')).toMatchObject([{ line_no: 1, total_income: 66025 }])
    expect(res.warnings.map((w) => w.code)).toContain('sku_rows_mismatch')
    expect(res.totalIncome).toBe(88906)
  })

  it('gives a clear message when an order export is chosen instead', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No. Pesanan', 'Status Pesanan', 'Nama Produk']]), 'orders')
    expect(() => parseIncomeXlsxWorkbook(wb)).toThrow(/export pesanan/)
  })
})

describe('parseOrdersWorkbook — wrong box', () => {
  it('points the income file to box 2', () => {
    expect(() => parseOrdersWorkbook(workbook())).toThrow(/kotak "2\. Laporan penghasilan"/)
  })
})
