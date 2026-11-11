import { describe, expect, it } from 'vitest'
import {
  linkInviteMessage,
  linkProblem,
  linkSummary,
  signupCodeFromHash,
  signupUrl,
  toLinkState,
  validateSignup,
} from '../src/lib/trialLinks'

describe('signupUrl & signupCodeFromHash', () => {
  it('kode ikut di bagian # dan bisa dibaca lagi', () => {
    const url = signupUrl('https://app.studioharel.id/', 'Ab-_12xyz')
    expect(url).toBe('https://app.studioharel.id/#/coba?kode=Ab-_12xyz')
    expect(signupCodeFromHash(new URL(url).hash)).toBe('Ab-_12xyz')
  })

  it('bukan halaman daftar → null; halaman daftar tanpa kode → ""', () => {
    expect(signupCodeFromHash('#/rekap')).toBeNull()
    expect(signupCodeFromHash('')).toBeNull()
    expect(signupCodeFromHash('#/coba')).toBe('')
    expect(signupCodeFromHash('#/coba?kode=%20abc%20')).toBe('abc')
  })
})

describe('validateSignup', () => {
  it('menolak email dan password yang salah', () => {
    expect(validateSignup({ email: 'budi', password: 'Rahasia123' })).toMatch(/Email/)
    expect(validateSignup({ email: 'budi@gmail.com', password: 'pendek' })).toMatch(/minimal 8/)
    expect(validateSignup({ email: 'budi@gmail.com', password: 'é'.repeat(37) })).toMatch(/terlalu panjang/)
  })

  it('menerima isian yang benar (spasi di email dirapikan)', () => {
    expect(validateSignup({ email: '  Budi@Gmail.com ', password: 'Rahasia123' })).toBeNull()
  })
})

describe('status link', () => {
  it('nilai tak dikenal dianggap link tidak dikenal', () => {
    expect(toLinkState('ok')).toBe('ok')
    expect(toLinkState('used_up')).toBe('used_up')
    expect(toLinkState(null)).toBe('invalid')
    expect(toLinkState('aneh')).toBe('invalid')
  })

  it('hanya link yang ok tanpa pesan masalah', () => {
    expect(linkProblem('ok')).toBeNull()
    expect(linkProblem('expired')).toMatch(/tidak berlaku/)
    expect(linkProblem('used_up')).toMatch(/habis/)
    expect(linkProblem('invalid')).toMatch(/tidak dikenal/)
  })
})

describe('teks untuk pengelola', () => {
  it('teks undangan berisi nama aplikasi, lama uji coba, dan link', () => {
    const text = linkInviteMessage({ appName: 'HitungCuan', url: 'https://app.studioharel.id/#/coba?kode=x' })
    expect(text).toContain('HitungCuan')
    expect(text).toContain('7 hari')
    expect(text.split('\n').at(-1)).toBe('https://app.studioharel.id/#/coba?kode=x')
  })

  it('ringkasan link', () => {
    expect(linkSummary({ max_uses: 1, used_count: 0, expires_at: '2026-11-18T03:00:00Z' })).toBe(
      'Untuk 1 orang · 0 sudah daftar · berlaku sampai 18 Nov 2026',
    )
    expect(linkSummary({ max_uses: 50, used_count: 3, expires_at: '2026-12-11T20:00:00Z' })).toBe(
      'Untuk 50 orang · 3 sudah daftar · berlaku sampai 12 Des 2026',
    )
  })
})
