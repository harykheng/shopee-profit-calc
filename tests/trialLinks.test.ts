import { describe, expect, it } from 'vitest'
import {
  formatPhone,
  heardFromValue,
  linkInviteMessage,
  normalizePhone,
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

const ok = { email: 'budi@gmail.com', password: 'Rahasia123', phone: '0812 3456 7890', heardFrom: 'Instagram' as const, heardFromOther: '' }

describe('validateSignup', () => {
  it('menolak email, password, no HP, dan jawaban yang salah', () => {
    expect(validateSignup({ ...ok, email: 'budi' })).toMatch(/Email/)
    expect(validateSignup({ ...ok, password: 'pendek' })).toMatch(/minimal 8/)
    expect(validateSignup({ ...ok, password: 'é'.repeat(37) })).toMatch(/terlalu panjang/)
    expect(validateSignup({ ...ok, phone: '021 555 1234' })).toMatch(/No HP/)
    expect(validateSignup({ ...ok, heardFrom: null })).toMatch(/Pilih/)
    expect(validateSignup({ ...ok, heardFrom: 'Lainnya', heardFromOther: '  ' })).toMatch(/Tulis/)
  })

  it('menerima isian yang benar (spasi di email dirapikan)', () => {
    expect(validateSignup({ ...ok, email: '  Budi@Gmail.com ' })).toBeNull()
    expect(validateSignup({ ...ok, heardFrom: 'Lainnya', heardFromOther: 'Grup WA penjual' })).toBeNull()
  })
})

describe('normalizePhone & formatPhone', () => {
  it('berbagai cara menulis nomor HP jadi format 62…', () => {
    for (const p of ['0812-3456-7890', '+62 812 3456 7890', '6281234567890', '812 3456 7890', '(0812) 3456 7890']) {
      expect(normalizePhone(p)).toBe('6281234567890')
    }
    expect(normalizePhone('0812345678')).toBe('62812345678')
  })

  it('menolak yang bukan nomor HP Indonesia', () => {
    for (const p of ['', '12345', '021 555 1234', '0812', '0812 3456 7890 1234', '+1 555 123 4567']) {
      expect(normalizePhone(p)).toBeNull()
    }
  })

  it('tampil seperti nomor lokal', () => {
    expect(formatPhone('6281234567890')).toBe('0812-3456-7890')
    expect(formatPhone('62812345678')).toBe('0812-3456-78')
  })
})

describe('heardFromValue', () => {
  it('pilihan biasa apa adanya; Lainnya memakai isian', () => {
    expect(heardFromValue(null, '')).toBe('')
    expect(heardFromValue('TikTok', 'abaikan')).toBe('TikTok')
    expect(heardFromValue('Lainnya', '  grup   WA ')).toBe('Lainnya: grup WA')
    expect(heardFromValue('Lainnya', '')).toBe('')
    expect(heardFromValue('Lainnya', 'x'.repeat(200))).toHaveLength(80)
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
