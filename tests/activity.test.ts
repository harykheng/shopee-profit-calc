import { describe, expect, it } from 'vitest'
import { activityDetail, activityStage, activityVerdict, countTried, normalizeSource, type ActivitySummary } from '../src/lib/activity'

const base: ActivitySummary = {
  store_id: 1,
  source: null,
  registered_at: '2026-11-10T03:00:00Z',
  logins: 0,
  active_days: 0,
  last_active_at: null,
  uploads: 0,
  first_upload_at: null,
  report_views: 0,
  first_view_at: null,
  payments: 0,
  first_paid_at: null,
}

describe('activityStage / activityVerdict', () => {
  it('belum dipakai sama sekali', () => {
    expect(activityStage(base)).toBe('idle')
    expect(activityVerdict(base)).toEqual({ label: 'Belum dipakai', followUp: true })
  })
  it('langkah terjauh yang menentukan', () => {
    expect(activityStage({ ...base, logins: 2 })).toBe('logged_in')
    expect(activityStage({ ...base, logins: 2, uploads: 1 })).toBe('uploaded')
    expect(activityStage({ ...base, logins: 2, uploads: 1, report_views: 3 })).toBe('viewed')
    expect(activityStage({ ...base, payments: 1 })).toBe('paid')
    expect(activityVerdict({ ...base, uploads: 1 }).followUp).toBe(true)
    expect(activityVerdict({ ...base, report_views: 1 }).followUp).toBe(false)
  })
})

describe('activityDetail', () => {
  const now = new Date('2026-11-16T05:00:00Z')
  it('hanya yang ada isinya', () => {
    expect(activityDetail(base, now)).toBe('')
    expect(
      activityDetail({ ...base, logins: 3, active_days: 2, uploads: 1, report_views: 4, last_active_at: '2026-11-15T05:00:00Z' }, now),
    ).toBe('Masuk 3× · 2 hari aktif · Upload 1× · Buka Rekap 4× · terakhir aktif kemarin')
  })
  it('bayar ditulis kalau lebih dari sekali (perpanjang)', () => {
    expect(activityDetail({ ...base, payments: 1 }, now)).toBe('')
    expect(activityDetail({ ...base, payments: 3 }, now)).toBe('Bayar 3×')
  })
})

describe('countTried', () => {
  it('menghitung yang sudah upload atau lebih', () => {
    const m = new Map<number, ActivitySummary>([
      [1, { ...base, store_id: 1, logins: 1 }],
      [2, { ...base, store_id: 2, uploads: 1 }],
      [3, { ...base, store_id: 3, report_views: 1 }],
    ])
    expect(countTried([1, 2, 3, 4], m)).toBe(2)
  })
})

describe('normalizeSource', () => {
  it('kosong jadi null, spasi dirapikan, dipotong 40 karakter', () => {
    expect(normalizeSource('   ')).toBeNull()
    expect(normalizeSource('  Grup   FB  ')).toBe('Grup FB')
    expect(normalizeSource('x'.repeat(50))).toHaveLength(40)
  })
})
