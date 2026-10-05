import { describe, expect, it } from 'vitest'
import { parseAdNumber, parseAdsCsv, parseCsv, stripAdSuffix } from '../src/lib/parsers/ads'
import { ParseError } from '../src/lib/parsers/common'

// Struktur sama persis dengan file Shopee; nama toko/produk dummy.
const META = (title: string, period = '01/07/2026 - 31/07/2026') =>
  [
    title,
    'Username,tokodummy',
    'Nama Toko,Toko Dummy',
    'ID Toko,123',
    'Waktu Laporan Dibuat,05/10/2026 22:10',
    `Periode,${period}`,
    '',
  ].join('\n')

const KESELURUHAN =
  '﻿' +
  META('Semua Laporan Iklan CPC - Shopee Indonesia') +
  '\n' +
  [
    'Urutan,Nama Iklan,Status,Jenis Iklan,Kode Produk,Tampilan Iklan,Mode Bidding,Penempatan Iklan,Tanggal Mulai,Tanggal Selesai,Dilihat,Jumlah Klik,Persentase Klik,Tambah ke Keranjang,Persentase Tambah ke Keranjang,Konversi,Konversi Langsung,Tingkat konversi,Tingkat Konversi Langsung,Biaya per Konversi,Biaya per Konversi Langsung,Produk Terjual,Terjual Langsung,Omzet Penjualan,Penjualan Langsung (GMV Langsung),Biaya,Efektifitas Iklan,Efektivitas Langsung,Persentase Biaya Iklan terhadap Penjualan dari Iklan (ACOS),Persentase Biaya Iklan terhadap Penjualan dari Iklan Langsung (ACOS Langsung),Jumlah Produk Dilihat,Jumlah Klik Produk,Persentase Klik Produk,Voucher Amount,Vouchered Sales',
    '1,Iklan Produk Otomatis,Dijeda,,-,-,Iklan Produk Otomatis,Semua Penempatan,13/07/2026 00:00:00,Tidak Terbatas,44013,2446,5.56%,-,-,129,128,5.27%,5.23%,6972.27,7026.74,140,139,10007884,9982023,899423,11.13,11.10,8.99%,9.01%,-,-,-,1298156,7603700',
    '2,Bedak Dummy - 12gr,Berjalan,Iklan Produk,111,-,GMV Max ROAS,Semua Penempatan,22/12/2024 00:00:00,Tidak Terbatas,5626,282,5.01%,61,21.63%,19,18,6.74%,6.38%,4846.94,5116.22,20,19,550100,521600,92092,5.97,5.66,16.74%,17.66%,-,-,-,77386,440000',
    '3,"Dot Dummy | 18PCS, Toples [2]",Dijeda,Iklan Produk,222,-,"Tahap 1: GMV Max Auto, Tahap 2: GMV Max ROAS",Semua Penempatan,14/07/2026 00:00:00,Tidak Terbatas,74,4,5.41%,1,25.00%,0,0,0.00%,0.00%,0.00,0.00,0,0,0,0,19540,0.00,0.00,0.00%,0.00%,-,-,-,0,0',
    '',
  ].join('\r\n')

const OTOMATIS =
  META('Iklan Produk Otomatis Indonesia') +
  '\n' +
  [
    'Urutan,Nama Produk,Kode Produk,Dilihat,Jumlah Klik,Persentase Klik,Konversi,Konversi Langsung,Tingkat konversi,Tingkat Konversi Langsung,Biaya per Konversi,Biaya per Konversi Langsung,Produk Terjual,Terjual Langsung,Omzet Penjualan,Penjualan Langsung (GMV Langsung),Biaya,Efektifitas Iklan,Efektivitas Langsung,Persentase Biaya Iklan terhadap Penjualan dari Iklan (ACOS),Persentase Biaya Iklan terhadap Penjualan dari Iklan Langsung (ACOS Langsung),Voucher Amount,Vouchered Sales',
    '1,Iklan Produk Otomatis,-,44013,2446,5.56%,129,128,5.27%,5.23%,6972.27,7026.74,140,139,10007884,9982023,899423,11.13,11.10,8.99%,9.01%,1298156,7603700',
    '2,"Dot Dummy | 18PCS, Toples",222,8097,334,4.12%,26,26,7.78%,7.78%,16135.65,16135.65,27,27,5350500,5350500,419527,12.75,12.75,7.84%,7.84%,776397,4558600',
    '3,Sabun Dummy,333,150,4,2.67%,0,0,0.00%,0.00%,0.00,0.00,0,0,0,0,2392,0.00,0.00,0.00%,0.00%,0,0',
  ].join('\n')

const GRUP =
  META('Grup Iklan - Shopee {Country}', '01/09/2026 - 07/09/2026') +
  '\n' +
  [
    'Urutan,Nama Iklan/Produk,Status,Jenis Iklan,Kode Produk,Mode Bidding,Tanggal Mulai,Tanggal Selesai,Dilihat,Jumlah Klik,Persentase Klik,Konversi,Konversi Langsung,Tingkat konversi,Tingkat Konversi Langsung,Biaya per Konversi,Biaya per Konversi Langsung,Produk Terjual,Terjual Langsung,Omzet Penjualan,Penjualan Langsung (GMV Langsung),Biaya,Efektifitas Iklan,Efektivitas Langsung,Persentase Biaya Iklan terhadap Penjualan dari Iklan (ACOS),Persentase Biaya Iklan terhadap Penjualan dari Iklan Langsung (ACOS Langsung),Voucher Amount,Vouchered Sales',
    '1,Grup Iklan 04/09/2026 - 1,Berjalan,Iklan Produk,-,GMV Max ROAS,04/09/2026 00:00:00,Tidak Terbatas,100,10,0%,1,1,0%,0%,0,0,2,2,60000,60000,8000,7.5,7.5,0%,0%,0,0',
    '2,Produk A,-,Iklan Produk,444,-,-,-,60,6,0%,1,1,0%,0%,0,0,1,1,30000,30000,5000,6,6,0%,0%,0,0',
    '3,Produk B,-,Iklan Produk,555,-,-,-,40,4,0%,1,1,0%,0%,0,0,1,1,30000,30000,3000,10,10,0%,0%,0,0',
    '4,Grup Iklan 28/09/2026 - 1,Berjalan,Iklan Produk,-,GMV Max ROAS,28/09/2026 00:00:00,Tidak Terbatas,0,0,0%,0,0,0%,0%,0,0,0,0,0,0,1500,0,0,0%,0%,0,0',
    '5,Produk C,-,Iklan Produk,666,-,-,-,0,0,0%,0,0,0%,0%,0,0,0,0,0,0,1500,0,0,0%,0%,0,0',
  ].join('\n')

describe('parseCsv / angka', () => {
  it('membaca tanda kutip dan koma di dalam sel', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ])
  })
  it('mendukung titik koma sebagai pemisah', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
  it('angka iklan: titik = desimal, koma/titik berulang = ribuan', () => {
    expect(parseAdNumber('899423')).toBe(899423)
    expect(parseAdNumber('6972.27')).toBe(6972)
    expect(parseAdNumber('1,036,055')).toBe(1036055)
    expect(parseAdNumber('1.036.055')).toBe(1036055)
    expect(parseAdNumber('-')).toBe(0)
    expect(parseAdNumber('')).toBe(0)
    expect(parseAdNumber('abc')).toBeNull()
  })
  it('menghapus akhiran [2]', () => {
    expect(stripAdSuffix('Dot Dummy | 18PCS [2]')).toBe('Dot Dummy | 18PCS')
    expect(stripAdSuffix('[HARGA GROSIR] Sabun')).toBe('[HARGA GROSIR] Sabun')
  })
})

describe('parseAdsCsv', () => {
  it('Data Keseluruhan: satu baris per iklan, total semua biaya', () => {
    const r = parseAdsCsv(KESELURUHAN)
    expect(r.source).toBe('keseluruhan')
    expect(r.shopName).toBe('Toko Dummy')
    expect(r.periodStart).toBe('2026-07-01')
    expect(r.periodEnd).toBe('2026-07-31')
    expect(r.totalSpend).toBe(899423 + 92092 + 19540)
    expect(r.rows).toHaveLength(3)
    expect(r.rows[0]).toMatchObject({ ad_name: 'Iklan Produk Otomatis', product_code: '', product_name: '', spend: 899423, sold: 140, gmv: 10007884 })
    expect(r.rows[2]).toMatchObject({
      ad_name: 'Dot Dummy | 18PCS, Toples [2]',
      product_code: '222',
      product_name: 'Dot Dummy | 18PCS, Toples',
      spend: 19540,
    })
    expect(r.warnings).toEqual([])
  })

  it('Rincian otomatis: baris total tidak dobel dengan baris produk', () => {
    const r = parseAdsCsv(OTOMATIS)
    expect(r.source).toBe('otomatis')
    expect(r.totalSpend).toBe(899423)
    expect(r.productCount).toBe(2)
    expect(r.rows[1]).toMatchObject({ ad_name: 'Iklan Produk Otomatis', product_code: '222', sold: 27, gmv: 5350500, spend: 419527 })
  })

  it('Grup iklan: produk ikut grup di atasnya', () => {
    const r = parseAdsCsv(GRUP)
    expect(r.source).toBe('grup')
    expect(r.periodStart).toBe('2026-09-01')
    expect(r.periodEnd).toBe('2026-09-07')
    expect(r.totalSpend).toBe(9500)
    expect(r.rows.map((x) => [x.ad_name, x.product_code])).toEqual([
      ['Grup Iklan 04/09/2026 - 1', ''],
      ['Grup Iklan 04/09/2026 - 1', '444'],
      ['Grup Iklan 04/09/2026 - 1', '555'],
      ['Grup Iklan 28/09/2026 - 1', ''],
      ['Grup Iklan 28/09/2026 - 1', '666'],
    ])
  })

  it('menolak file yang bukan data iklan', () => {
    expect(() => parseAdsCsv('No. Pesanan,Status Pesanan\n1,Selesai')).toThrow(ParseError)
  })

  it('menolak file tanpa periode', () => {
    expect(() => parseAdsCsv(OTOMATIS.replace('Periode,01/07/2026 - 31/07/2026', ''))).toThrow(/Periode/)
  })

  it('melewati baris yang angkanya rusak dengan peringatan', () => {
    const r = parseAdsCsv(OTOMATIS.replace(',2392,', ',dua ribu,'))
    expect(r.rows).toHaveLength(2)
    expect(r.warnings.map((w) => w.code)).toEqual(['invalid_rows'])
  })
})
