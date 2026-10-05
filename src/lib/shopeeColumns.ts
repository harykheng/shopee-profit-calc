/**
 * Semua pemetaan format file Shopee ada di file ini.
 *
 * Kalau Shopee mengganti nama kolom / format laporan, cukup perbaiki di sini:
 * tambahkan nama header baru ke daftar alias (nama lama boleh tetap ada).
 * Pencocokan header tidak peka huruf besar/kecil dan spasi berlebih.
 */

// ---------------------------------------------------------------------------
// Export pesanan (Seller Centre → Pesanan Saya → Export), file .xlsx
// ---------------------------------------------------------------------------

export const ORDER_COLUMNS = {
  orderNo: ['No. Pesanan'],
  status: ['Status Pesanan'],
  returnStatus: ['Status Pembatalan/ Pengembalian', 'Status Pembatalan/Pengembalian'],
  skuRef: ['Nomor Referensi SKU'],
  skuInduk: ['SKU Induk'],
  productName: ['Nama Produk'],
  variantName: ['Nama Variasi'],
  qty: ['Jumlah'],
  returnedQty: ['Returned quantity', 'Jumlah Dikembalikan'],
  subtotal: ['Subtotal Pesanan'],
  completedAt: ['Waktu Pesanan Selesai'],
  /** Opsional; dipakai untuk tabel "Pesanan masuk" (berdasarkan tanggal pesanan dibuat). */
  createdAt: ['Waktu Pesanan Dibuat'],
} as const

export type OrderColumnKey = keyof typeof ORDER_COLUMNS

/** Kolom wajib; kalau salah satu tidak ada, file ditolak. */
export const REQUIRED_ORDER_COLUMNS: OrderColumnKey[] = [
  'orderNo',
  'status',
  'productName',
  'qty',
  'subtotal',
  'completedAt',
]

/** Status pesanan selesai. Hanya item ini yang dihitung modal & profitnya. */
export const COMPLETED_STATUSES = ['Selesai']

/**
 * Status yang dianggap batal / tidak jadi (dicocokkan sebagian, huruf besar/kecil
 * diabaikan; mis. "batal" cocok dengan "Batal" dan "Dibatalkan").
 * Status lain (mis. "Perlu Dikirim", "Sedang Dikirim") dianggap masih diproses.
 */
export const CANCELLED_STATUS_KEYWORDS = ['batal', 'belum bayar']

/** Kelompok status: selesai (dihitung profit), proses (belum selesai), batal. */
export type StatusGroup = 'selesai' | 'proses' | 'batal'

export function statusGroup(status: string): StatusGroup {
  const s = status.trim().toLowerCase()
  if (COMPLETED_STATUSES.some((c) => c.toLowerCase() === s)) return 'selesai'
  if (CANCELLED_STATUS_KEYWORDS.some((k) => s.includes(k))) return 'batal'
  return 'proses'
}

/** Berapa baris teratas yang diperiksa untuk mencari baris header. */
export const HEADER_SEARCH_ROWS = 20

/**
 * Kolom berisi data pribadi pembeli. Parser TIDAK PERNAH membaca kolom ini;
 * daftar ini hanya sebagai dokumentasi dan dipakai test untuk memastikan
 * isinya tidak bocor ke hasil parsing.
 */
export const BUYER_PRIVATE_COLUMNS = [
  'Username (Pembeli)',
  'Nama Penerima',
  'No. Telepon',
  'Alamat Pengiriman',
  'Kota/Kabupaten',
  'Provinsi',
  'Catatan dari Pembeli',
  'No. Resi',
  'Booking SN',
]

/** Pemisah pada kunci SKU gabungan, mis. "HBH-021 | M". */
export const SKU_KEY_SEPARATOR = ' | '

// ---------------------------------------------------------------------------
// Laporan penghasilan bulanan (Keuangan → Penghasilan Saya), file .pdf
// "Catatan Transaksi Penghasilan"
// ---------------------------------------------------------------------------

export const INCOME_PDF = {
  /** Teks yang wajib ada supaya file dikenali sebagai laporan penghasilan. */
  marker: 'Catatan Transaksi Penghasilan',
  /** Judul tabel harian. */
  dailySection: 'Rincian Dana Dilepaskan',
  /** Kalimat periode, mis. "Catatan Transaksi untuk 2026-08-01 sampai 2026-08-31". */
  periodLabel: 'Catatan Transaksi untuk',
  /** Judul bagian ringkasan bulanan (di atas tabel harian). */
  summarySection: 'Ringkasan Dana yang Dilepaskan',
  /**
   * Tabel harian: kolom pertama selalu Subtotal Pesanan, kolom terakhir selalu
   * Total Penghasilan. Kolom biaya di antaranya MUNCUL/HILANG tergantung bulan
   * (mis. "Biaya Layanan" hanya ada kalau ada biaya SPayLater), dengan urutan
   * yang sama seperti di ringkasan. Kolom dikenali dari label di ringkasan,
   * lalu dicek dengan baris total. Beberapa label boleh masuk ke kolom yang sama.
   * Label baru dari Shopee cukup ditambahkan di sini.
   */
  feeColumns: [
    { label: 'Subtotal Ongkos Kirim', column: 'subtotal_ongkir' },
    { label: 'Voucher & Subsidi', column: 'voucher_subsidi' },
    { label: 'Biaya Platform', column: 'biaya_platform' },
    { label: 'Biaya Gratis Ongkir XTRA', column: 'biaya_gratis_ongkir' },
    { label: 'Biaya Layanan', column: 'biaya_layanan_tambahan' },
    { label: 'Subtotal Biaya Layanan Tambahan', column: 'biaya_layanan_tambahan' },
  ],
  /** Kolom biaya yang tidak dikenali dijumlahkan ke sini (total tetap benar). */
  fallbackFeeColumn: 'biaya_layanan_tambahan',
  /** Label baris total di bawah tabel harian. */
  totalLabel: 'Total Penghasilan',
  /** Label di ringkasan bulanan yang ditampilkan di preview. */
  summaryLabels: {
    hargaProduk: 'Harga Produk',
    pengembalianDana: 'Jumlah Pengembalian Dana',
  },
  /** Bagian biaya penyesuaian; kalau tidak kosong, tampilkan peringatan. */
  adjustmentsSection: 'Rincian Biaya Penyesuaian',
  noAdjustmentsText: 'Tidak ada riwayat',
} as const

/** Kolom angka di tabel `income` (satu baris per tanggal dana dilepas). */
export const INCOME_COLUMNS = [
  'subtotal_pesanan',
  'subtotal_ongkir',
  'voucher_subsidi',
  'biaya_platform',
  'biaya_gratis_ongkir',
  'biaya_layanan_tambahan',
  'total_income',
] as const

export type IncomeColumn = (typeof INCOME_COLUMNS)[number]

// ---------------------------------------------------------------------------
// Data iklan (Iklan Saya → Download Data), file .csv
// Ada beberapa jenis file; jenisnya dikenali dari kolom nama di header.
// ---------------------------------------------------------------------------

export const ADS_CSV = {
  /** Label baris info di atas tabel (kolom pertama → isi di kolom kedua). */
  shopNameLabel: 'Nama Toko',
  /** Isi mis. "01/07/2026 - 31/07/2026" (tanggal/bulan/tahun). */
  periodLabel: 'Periode',
  /**
   * Jenis file, dicek berurutan: header yang punya kolom `nameColumn` ini.
   * - keseluruhan: satu baris per iklan (total semua iklan → dipakai untuk Biaya).
   * - otomatis: rincian per produk dari "Iklan Produk Otomatis".
   * - grup: baris grup iklan, diikuti baris produk di dalam grup itu.
   */
  kinds: [
    { source: 'grup', nameColumn: 'Nama Iklan/Produk', label: 'Semua Data Grup Iklan' },
    { source: 'keseluruhan', nameColumn: 'Nama Iklan', label: 'Data Keseluruhan (semua iklan)' },
    { source: 'otomatis', nameColumn: 'Nama Produk', label: 'Rincian Iklan Produk Otomatis' },
  ],
  columns: {
    productCode: ['Kode Produk'],
    views: ['Dilihat'],
    clicks: ['Jumlah Klik'],
    /** Versi Shopee: ikut menghitung pesanan yang kemudian batal. */
    sold: ['Produk Terjual'],
    gmv: ['Omzet Penjualan'],
    spend: ['Biaya'],
  },
  /** Nama iklan untuk Iklan Produk Otomatis (baris total di file otomatis & keseluruhan). */
  autoAdName: 'Iklan Produk Otomatis',
  /** Isi "Kode Produk" untuk baris yang bukan satu produk (total iklan / grup). */
  noProductCode: '-',
} as const

export type AdSource = (typeof ADS_CSV.kinds)[number]['source']
