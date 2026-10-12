import { describe, expect, it } from 'vitest'
import { expiryNotice, subscriptionStatus, wibToday } from '../src/lib/subscription'

// 12 Okt 2026, jam WIB tertentu → UTC dikurangi 7 jam.
const wib = (date: string, time = '12:00:00') => new Date(`${date}T${time}+07:00`)

describe('wibToday', () => {
  it('pakai tanggal WIB, bukan UTC', () => {
    // 00:30 WIB tanggal 13 = 17:30 UTC tanggal 12
    expect(wibToday(wib('2026-10-13', '00:30:00'))).toBe('2026-10-13')
    // 23:59 WIB tanggal 12 masih tanggal 12
    expect(wibToday(wib('2026-10-12', '23:59:59'))).toBe('2026-10-12')
  })
})

describe('subscriptionStatus', () => {
  it('null / kosong = tidak dibatasi (toko keluarga)', () => {
    expect(subscriptionStatus(null)).toEqual({ state: 'unlimited', activeUntil: null, daysLeft: null })
    expect(subscriptionStatus(undefined).state).toBe('unlimited')
    expect(subscriptionStatus('').state).toBe('unlimited')
  })

  it('masih berlaku kalau active_until di masa depan', () => {
    const s = subscriptionStatus('2026-10-20', wib('2026-10-12'))
    expect(s).toEqual({ state: 'active', activeUntil: '2026-10-20', daysLeft: 8 })
  })

  it('hari terakhir (active_until = hari ini) masih aktif', () => {
    const s = subscriptionStatus('2026-10-12', wib('2026-10-12', '23:59:59'))
    expect(s.state).toBe('active')
    expect(s.daysLeft).toBe(0)
  })

  it('kemarin = habis', () => {
    const s = subscriptionStatus('2026-10-11', wib('2026-10-12', '00:00:01'))
    expect(s.state).toBe('expired')
    expect(s.daysLeft).toBe(-1)
  })

  it('batas tengah malam WIB: 23:59 masih aktif, 00:00 hari berikutnya habis', () => {
    expect(subscriptionStatus('2026-10-12', wib('2026-10-12', '23:59:59')).state).toBe('active')
    expect(subscriptionStatus('2026-10-12', wib('2026-10-13', '00:00:00')).state).toBe('expired')
  })

  it('jam 00:30 WIB (masih tanggal sebelumnya di UTC) dihitung sebagai hari baru', () => {
    expect(subscriptionStatus('2026-10-12', new Date('2026-10-12T17:30:00Z')).state).toBe('expired')
  })

  it('menerima timestamp date dari database dengan tambahan waktu', () => {
    expect(subscriptionStatus('2026-10-20T00:00:00', wib('2026-10-12')).activeUntil).toBe('2026-10-20')
  })

  it('lintas bulan dan tahun', () => {
    expect(subscriptionStatus('2027-01-02', wib('2026-12-30')).daysLeft).toBe(3)
  })
})

describe('expiryNotice', () => {
  const notice = (until: string | null) => expiryNotice(subscriptionStatus(until, wib('2026-10-12')))

  it('tidak dibatasi atau masih lama: tidak ada pengingat', () => {
    expect(notice(null)).toBeNull()
    expect(notice('2026-10-20')).toBeNull() // 8 hari lagi
  })

  it('mulai H-7', () => {
    expect(notice('2026-10-19')).toBe('berakhir 7 hari lagi')
    expect(notice('2026-10-15')).toBe('berakhir 3 hari lagi')
  })

  it('besok dan hari ini punya kalimat sendiri', () => {
    expect(notice('2026-10-13')).toBe('berakhir besok')
    expect(notice('2026-10-12')).toBe('berakhir hari ini')
  })

  it('sudah habis: bukan urusan banner pengingat', () => {
    expect(notice('2026-10-11')).toBeNull()
  })
})
