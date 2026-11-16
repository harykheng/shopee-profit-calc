import { describe, expect, it } from 'vitest'
import { formatMark, onboardingSteps, onboardingView, parseMark, type SetupCounts } from '../src/lib/onboarding'

const TODAY = '2026-11-16'
const counts = (over: Partial<SetupCounts> = {}): SetupCounts => ({
  hasOrders: false,
  hasIncome: false,
  productCount: 0,
  missingHppCount: 0,
  ...over,
})

describe('onboardingSteps', () => {
  it('toko baru: langkah 1, belum ada yang selesai', () => {
    expect(onboardingSteps(counts())).toMatchObject({ current: 1, doneCount: 0, uploadDone: false, hppDone: false })
  })

  it('baru export pesanan: masih langkah 1, HPP belum dianggap selesai walau semua terisi', () => {
    const s = onboardingSteps(counts({ hasOrders: true, productCount: 3, missingHppCount: 0 }))
    expect(s).toMatchObject({ current: 1, doneCount: 0, ordersDone: true, incomeDone: false, hppDone: true })
  })

  it('upload lengkap, HPP kosong: langkah 2', () => {
    expect(onboardingSteps(counts({ hasOrders: true, hasIncome: true, productCount: 5, missingHppCount: 2 }))).toMatchObject({
      current: 2,
      doneCount: 1,
    })
  })

  it('semua lengkap: langkah 3', () => {
    expect(onboardingSteps(counts({ hasOrders: true, hasIncome: true, productCount: 5, missingHppCount: 0 }))).toMatchObject({
      current: 3,
      doneCount: 2,
    })
  })

  it('tanpa produk, HPP tidak dianggap selesai', () => {
    expect(onboardingSteps(counts({ hasOrders: true, hasIncome: true })).hppDone).toBe(false)
  })
})

describe('tanda browser', () => {
  it('bolak-balik', () => {
    expect(parseMark(formatMark({ kind: 'started' }))).toEqual({ kind: 'started' })
    expect(parseMark(formatMark({ kind: 'done', day: TODAY }))).toEqual({ kind: 'done', day: TODAY })
  })
  it('isi aneh dianggap kosong', () => {
    expect(parseMark(null)).toBeNull()
    expect(parseMark('done:kemarin')).toBeNull()
    expect(parseMark('x')).toBeNull()
  })
})

describe('onboardingView', () => {
  const lengkap = counts({ hasOrders: true, hasIncome: true, productCount: 5, missingHppCount: 0 })

  it('toko baru: panduan tampil dan tanda "started" disimpan', () => {
    const r = onboardingView(counts(), null, TODAY)
    expect(r.view.kind).toBe('guide')
    expect(r.mark).toEqual({ kind: 'started' })
  })

  it('tanda sudah "started": tidak ditulis ulang', () => {
    expect(onboardingView(counts(), { kind: 'started' }, TODAY).mark).toBeNull()
  })

  it('toko lama dengan data lengkap: tidak ada apa-apa', () => {
    expect(onboardingView(lengkap, null, TODAY)).toEqual({ view: { kind: 'none' }, mark: null })
  })

  it('toko lama dengan produk baru tanpa HPP: bukan panduan (urusan pengingat bulanan)', () => {
    const r = onboardingView(counts({ hasOrders: true, hasIncome: true, productCount: 40, missingHppCount: 2 }), null, TODAY)
    expect(r.view.kind).toBe('none')
  })

  it('toko baru di perangkat lain: belum ada HPP sama sekali → panduan langkah 2', () => {
    const r = onboardingView(counts({ hasOrders: true, hasIncome: true, productCount: 5, missingHppCount: 5 }), null, TODAY)
    expect(r.view).toMatchObject({ kind: 'guide', steps: { current: 2 } })
  })

  it('HPP diisi sebagian: panduan tetap tampil kalau sudah pernah tampil di perangkat ini', () => {
    const r = onboardingView(counts({ hasOrders: true, hasIncome: true, productCount: 5, missingHppCount: 2 }), { kind: 'started' }, TODAY)
    expect(r.view).toMatchObject({ kind: 'guide', steps: { current: 2 } })
  })

  it('baru selesai: kartu selesai, tanda jadi done hari ini', () => {
    expect(onboardingView(lengkap, { kind: 'started' }, TODAY)).toEqual({
      view: { kind: 'finished' },
      mark: { kind: 'done', day: TODAY },
    })
  })

  it('kartu selesai tetap tampil di hari yang sama, hilang besoknya', () => {
    expect(onboardingView(lengkap, { kind: 'done', day: TODAY }, TODAY).view.kind).toBe('finished')
    expect(onboardingView(lengkap, { kind: 'done', day: '2026-11-15' }, TODAY).view.kind).toBe('none')
  })

  it('sudah selesai lalu ada produk baru tanpa HPP: tidak dibuka lagi', () => {
    const r = onboardingView(counts({ hasOrders: true, hasIncome: true, productCount: 6, missingHppCount: 1 }), { kind: 'done', day: '2026-11-01' }, TODAY)
    expect(r.view.kind).toBe('none')
  })
})
