/**
 * Status langganan sebuah toko, dari stores.active_until.
 *
 * Aturannya sama dengan is_store_active() di database (migration 20261012000000):
 * langganan berlaku sampai akhir tanggal active_until, dihitung menurut WIB.
 * Ini hanya untuk tampilan; yang benar-benar menolak akses adalah RLS di database.
 */

export type SubscriptionState = 'unlimited' | 'active' | 'expired'

export interface SubscriptionStatus {
  state: SubscriptionState
  /** "YYYY-MM-DD", null kalau tidak dibatasi. */
  activeUntil: string | null
  /** Sisa hari termasuk hari active_until (0 = hari ini terakhir). null kalau tidak dibatasi. */
  daysLeft: number | null
}

/** Tanggal hari ini menurut WIB, "YYYY-MM-DD". */
export function wibToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function subscriptionStatus(
  activeUntil: string | null | undefined,
  now: Date = new Date(),
): SubscriptionStatus {
  if (!activeUntil) return { state: 'unlimited', activeUntil: null, daysLeft: null }
  const until = activeUntil.slice(0, 10)
  const daysLeft = dayNumber(until) - dayNumber(wibToday(now))
  return { state: daysLeft < 0 ? 'expired' : 'active', activeUntil: until, daysLeft }
}
