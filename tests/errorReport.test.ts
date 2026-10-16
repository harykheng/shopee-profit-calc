import { describe, expect, it, vi } from 'vitest'
import {
  buildReport,
  createReporter,
  fingerprintOf,
  isIgnorable,
  messageOf,
  type ErrorReportRow,
} from '../src/lib/errorReport'

const ctx = { route: '#/rekap?bulan=2026-09-01', storeId: 7, appVersion: 'abc1234', userAgent: 'UA' }

describe('isIgnorable', () => {
  it('koneksi putus, salah password, sesi habis, dan noise browser tidak dilaporkan', () => {
    for (const m of [
      'TypeError: Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'Invalid login credentials',
      'JWT expired',
      'Invalid Refresh Token: Refresh Token Not Found',
      'ResizeObserver loop completed with undelivered notifications.',
      'Script error.',
      'AbortError: The user aborted a request.',
    ]) {
      expect(isIgnorable(m), m).toBe(true)
    }
  })
  it('error aplikasi sungguhan dilaporkan', () => {
    expect(isIgnorable("TypeError: Cannot read properties of undefined (reading 'map')")).toBe(false)
    expect(isIgnorable('column products.fee_category_id does not exist')).toBe(false)
  })
  it('error dari ekstensi browser pelanggan diabaikan', () => {
    expect(isIgnorable('boom', 'Error: boom\n at chrome-extension://abc/content.js:1:1')).toBe(true)
  })
})

describe('buildReport', () => {
  it('menyusun baris lengkap dari Error biasa', () => {
    const err = new Error("Cannot read properties of undefined (reading 'map')")
    const r = buildReport('uncaught', err, ctx)!
    expect(r).toMatchObject({ kind: 'uncaught', route: ctx.route, store_id: 7, app_version: 'abc1234', user_agent: 'UA' })
    expect(r.message).toContain('Cannot read properties')
    expect(r.stack).toContain('Error')
    expect(r.fingerprint).toMatch(/^uncaught:[0-9a-f]+$/)
  })
  it('error yang diabaikan menghasilkan null', () => {
    expect(buildReport('handled', new Error('Failed to fetch'), ctx)).toBeNull()
  })
  it('objek error Supabase (bukan Error): pesan dan kodenya ikut', () => {
    const r = buildReport('handled', { message: 'permission denied for table x', code: '42501' }, ctx)!
    expect(r.message).toBe('[42501] permission denied for table x')
    expect(r.stack).toBeNull()
  })
  it('pesan dan stack dipotong sesuai batas tabel (1000 dan 6000)', () => {
    const err = new Error('x'.repeat(5000))
    err.stack = 'y'.repeat(20000)
    const r = buildReport('handled', err, ctx)!
    expect(r.message.length).toBeLessThanOrEqual(1000)
    expect(r.stack!.length).toBeLessThanOrEqual(6000)
  })
  it('tanpa konteks: kolom opsional kosong, tidak error', () => {
    expect(buildReport('render', new Error('x'))).toMatchObject({ route: null, store_id: null, app_version: null, user_agent: null })
  })
  it('pesan kosong tidak dilaporkan', () => {
    expect(buildReport('handled', new Error('   '), ctx)).toBeNull()
  })
})

describe('fingerprintOf', () => {
  it('error yang sama di data berbeda (angka) dan di query halaman berbeda = satu kelompok', () => {
    const a = fingerprintOf('handled', 'duplicate key (id)=(123)', '#/rekap?bulan=2026-09-01')
    const b = fingerprintOf('handled', 'duplicate key (id)=(456)', '#/rekap?bulan=2026-10-01')
    expect(a).toBe(b)
  })
  it('beda halaman atau beda jenis = kelompok berbeda', () => {
    const base = fingerprintOf('handled', 'boom', '#/rekap')
    expect(fingerprintOf('handled', 'boom', '#/iklan')).not.toBe(base)
    expect(fingerprintOf('render', 'boom', '#/rekap')).not.toBe(base)
  })
  it('muat di kolom fingerprint (<= 64 karakter)', () => {
    expect(fingerprintOf('unhandledrejection', 'x'.repeat(500), '#/' + 'a'.repeat(300)).length).toBeLessThanOrEqual(64)
  })
})

describe('messageOf', () => {
  it('menerima string, Error, dan objek', () => {
    expect(messageOf('halo')).toBe('halo')
    expect(messageOf(new Error('e'))).toBe('e')
    expect(messageOf({ message: 'm' })).toBe('m')
  })
})

describe('createReporter', () => {
  it('error yang sama hanya dikirim sekali per sesi', () => {
    const send = vi.fn()
    const r = createReporter(send)
    expect(r.report('handled', new Error('boom 1'), ctx)).toBe(true)
    expect(r.report('handled', new Error('boom 2'), ctx)).toBe(false) // angka dinormalkan: error yang sama
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('paling banyak maxPerSession laporan', () => {
    const send = vi.fn()
    const r = createReporter(send, 3)
    for (let i = 0; i < 10; i++) r.report('handled', new Error(`beda total ${'x'.repeat(i + 1)}`), ctx)
    expect(send).toHaveBeenCalledTimes(3)
  })
  it('pengirim yang melempar atau menolak tidak pernah mengganggu pemanggil', async () => {
    const r1 = createReporter(() => {
      throw new Error('kirim gagal')
    })
    expect(() => r1.report('uncaught', new Error('a'), ctx)).not.toThrow()
    const r2 = createReporter(() => Promise.reject(new Error('ditolak')))
    expect(() => r2.report('uncaught', new Error('b'), ctx)).not.toThrow()
    await Promise.resolve()
  })
  it('yang diabaikan tidak memakai jatah', () => {
    const send = vi.fn()
    const r = createReporter(send, 1)
    r.report('handled', new Error('Failed to fetch'), ctx)
    r.report('handled', new Error('error asli'), ctx)
    expect(send).toHaveBeenCalledTimes(1)
    expect((send.mock.calls[0][0] as ErrorReportRow).message).toBe('error asli')
  })
})
