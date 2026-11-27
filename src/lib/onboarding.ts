// Panduan pengguna baru: Upload laporan Shopee → Masukkan HPP → Lihat hasil keuntungan. Fungsi murni.
//
// Langkah dihitung dari data toko (bukan dari klik), supaya tetap benar di perangkat lain. Satu-satunya
// yang diingat browser adalah tanda kecil per toko (lihat `OnboardingMark`) untuk dua hal: panduan tetap
// tampil selama HPP diisi sebagian, dan kartu "3 dari 3 selesai" tampil di hari langkahnya selesai.
// Kalau tanda itu hilang (mode privat, ganti perangkat), panduan tetap muncul untuk toko yang benar-benar
// baru, hanya kartu selesai yang tidak.

export interface SetupCounts {
  hasOrders: boolean
  hasIncome: boolean
  /** Jumlah produk (muncul otomatis dari export pesanan). */
  productCount: number
  /** Jumlah produk yang HPP-nya masih kosong. */
  missingHppCount: number
}

export type OnboardingStepNo = 1 | 2 | 3

export interface OnboardingSteps {
  ordersDone: boolean
  incomeDone: boolean
  uploadDone: boolean
  hppDone: boolean
  /** Langkah yang sedang dikerjakan. 3 = upload dan HPP sudah lengkap, tinggal lihat hasil. */
  current: OnboardingStepNo
  /** 0–2: langkah 3 selesai begitu Rekap dibuka, jadi tidak dihitung di sini. */
  doneCount: number
  productCount: number
  missingHppCount: number
}

export function onboardingSteps(c: SetupCounts): OnboardingSteps {
  const uploadDone = c.hasOrders && c.hasIncome
  const hppDone = c.productCount > 0 && c.missingHppCount === 0
  const current: OnboardingStepNo = !uploadDone ? 1 : !hppDone ? 2 : 3
  return {
    ordersDone: c.hasOrders,
    incomeDone: c.hasIncome,
    uploadDone,
    hppDone,
    current,
    doneCount: (uploadDone ? 1 : 0) + (uploadDone && hppDone ? 1 : 0),
    productCount: c.productCount,
    missingHppCount: c.missingHppCount,
  }
}

/** Tanda di browser per toko: null = belum pernah melihat panduan di perangkat ini. */
export type OnboardingMark = { kind: 'started' } | { kind: 'done'; day: string } | null

export function parseMark(raw: string | null): OnboardingMark {
  if (raw === 'started') return { kind: 'started' }
  const m = raw?.match(/^done:(\d{4}-\d{2}-\d{2})$/)
  return m ? { kind: 'done', day: m[1] } : null
}

export function formatMark(mark: Exclude<OnboardingMark, null>): string {
  return mark.kind === 'started' ? 'started' : `done:${mark.day}`
}

export function onboardingMarkKey(storeId: number): string {
  return `onboarding:${storeId}`
}

export type OnboardingView =
  /** Panduan 3 langkah tampil. */
  | { kind: 'guide'; steps: OnboardingSteps }
  /** Baru selesai hari ini: kartu "3 dari 3 selesai" + tombol lihat hasil. */
  | { kind: 'finished' }
  /** Toko lama, atau sudah selesai di hari sebelumnya. */
  | { kind: 'none' }

/**
 * Tampilan panduan dan tanda baru yang perlu disimpan (null = tidak berubah).
 *
 * - Belum ada export pesanan atau laporan penghasilan → panduan. Toko yang sudah berjalan selalu punya
 *   keduanya, jadi tidak pernah melihatnya.
 * - Sudah upload, HPP belum lengkap → panduan hanya kalau toko ini memang baru: belum ada satu pun HPP,
 *   atau panduan sudah pernah tampil di perangkat ini. Toko lama yang punya produk baru tanpa HPP diurus
 *   pengingat bulanan, bukan panduan ini.
 * - Upload dan HPP lengkap → kartu selesai di hari itu (hanya kalau panduan pernah tampil di sini).
 */
export function onboardingView(c: SetupCounts, mark: OnboardingMark, today: string): { view: OnboardingView; mark: OnboardingMark } {
  const steps = onboardingSteps(c)
  const brandNewHpp = c.missingHppCount === c.productCount
  const showGuide = !steps.uploadDone || (!steps.hppDone && (brandNewHpp || mark?.kind === 'started'))
  if (showGuide) {
    return { view: { kind: 'guide', steps }, mark: mark?.kind === 'started' ? null : { kind: 'started' } }
  }
  if (mark?.kind === 'started') return { view: { kind: 'finished' }, mark: { kind: 'done', day: today } }
  if (mark?.kind === 'done' && mark.day === today) return { view: { kind: 'finished' }, mark: null }
  return { view: { kind: 'none' }, mark: null }
}
