// Pengingat rutinitas bulanan: "bulan lalu belum lengkap". Fungsi murni (tanpa Supabase).
import { addMonths, formatMonth } from './format'
import { monthTodos, type MonthStatus } from './monthStatus'

export interface ReminderItem {
  key: string
  /** Kalimat untuk pelanggan. */
  text: string
  /** Label tombol/tautan ke halaman yang menyelesaikannya. */
  action: string
  /** Halaman tujuan (sama dengan Route di router.ts; ditulis ulang agar berkas ini tidak bergantung pada browser). */
  route: 'upload' | 'hpp' | 'biaya'
  params?: Record<string, string>
}

export interface MonthlyReminder {
  month: string
  /** 'missing' = bulan lalu sama sekali belum ada data; 'incomplete' = ada data tapi belum lengkap. */
  kind: 'missing' | 'incomplete'
  title: string
  items: ReminderItem[]
}

/** Dari status sebuah bulan ke daftar langkah berikutnya, lengkap dengan halaman tujuannya. */
export function reminderItems(status: MonthStatus, month: string): ReminderItem[] {
  return monthTodos(status).map((t): ReminderItem => {
    switch (t.key) {
      case 'income':
        return { key: t.key, text: 'Laporan penghasilan belum di-upload.', action: 'Upload laporan', route: 'upload' }
      case 'orders':
        return {
          key: t.key,
          text: `Ada uang cair yang pesanannya belum di-upload. Upload export pesanan ${formatMonth(addMonths(month, -1))}.`,
          action: 'Upload pesanan',
          route: 'upload',
        }
      case 'noincome':
        return {
          key: t.key,
          text: 'Ada pesanan yang tidak ada di laporan penghasilan. Pastikan laporannya lengkap.',
          action: 'Upload laporan',
          route: 'upload',
        }
      case 'hpp':
        return { key: t.key, text: 'Ada barang yang HPP-nya masih kosong.', action: 'Isi HPP', route: 'hpp', params: { kosong: '1' } }
      default:
        return { key: t.key, text: 'Biaya (iklan, packaging, dll.) belum diisi.', action: 'Isi biaya', route: 'biaya', params: { bulan: month } }
    }
  })
}

/**
 * Pengingat untuk `month` (biasanya bulan lalu), atau null kalau tidak perlu.
 * - `status`: status bulan itu; null kalau bulan itu belum punya data sama sekali.
 * - `hadEarlierData`: toko ini pernah punya data di bulan sebelumnya. Tanpa itu, bulan kosong tidak
 *   diingatkan: pelanggan baru yang mulai di tengah bulan tidak boleh langsung "ditagih".
 */
export function buildReminder(input: {
  month: string
  status: MonthStatus | null
  hadEarlierData: boolean
}): MonthlyReminder | null {
  const { month, status, hadEarlierData } = input
  const label = formatMonth(month)
  if (status === null) {
    if (!hadEarlierData) return null
    return {
      month,
      kind: 'missing',
      title: `Data ${label} belum di-upload`,
      items: [
        { key: 'income', text: 'Laporan penghasilan bulan ini belum ada.', action: 'Upload laporan', route: 'upload' },
        { key: 'orders', text: 'Export pesanan (Excel) bulan ini belum ada.', action: 'Upload pesanan', route: 'upload' },
      ],
    }
  }
  if (status.final) return null
  const items = reminderItems(status, month)
  if (items.length === 0) return null
  return { month, kind: 'incomplete', title: `Rekap ${label} belum lengkap`, items }
}

/** Kunci penyimpanan "ingatkan besok" untuk satu toko dan satu bulan. */
export const reminderDismissKey = (storeId: number, month: string) => `profit-shopee:reminder:${storeId}:${month}`
