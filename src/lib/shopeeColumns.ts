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

/** Hanya item dengan status ini yang disimpan & dihitung modalnya. */
export const COMPLETED_STATUSES = ['Selesai']

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
  /**
   * Urutan kolom angka di tabel harian, setelah kolom tanggal.
   * Nama di kanan = kolom di tabel `income`.
   */
  dailyColumns: [
    'subtotal_pesanan', // Subtotal Pesanan
    'subtotal_ongkir', // Subtotal Ongkos Kirim
    'voucher_subsidi', // Voucher & Subsidi
    'biaya_platform', // Biaya Platform
    'biaya_gratis_ongkir', // Biaya Gratis Ongkir XTRA
    'biaya_layanan_tambahan', // Subtotal Biaya Layanan Tambahan
    'total_income', // Total Penghasilan (IDR)
  ],
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

export type IncomeColumn = (typeof INCOME_PDF.dailyColumns)[number]
