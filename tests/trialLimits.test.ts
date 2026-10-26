import { describe, expect, it } from 'vitest'
import { friendlyError } from '../src/lib/errors'
import { isIgnorable } from '../src/lib/errorReport'
import type { IncomeParseResult } from '../src/lib/parsers/income'
import {
  TRIAL_MONTH_LIMIT,
  manualSimKey,
  monthList,
  productSimKey,
  trialLimitMessage,
  trialMonthsNotice,
  trialSimNotice,
  trialUploadCheck,
  trialUploadProblem,
  uploadMonths,
} from '../src/lib/trialLimits'

const income = (over: Partial<IncomeParseResult> = {}): IncomeParseResult =>
  ({
    source: 'xlsx',
    shopName: null,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    days: [{ released_date: '2026-09-02' }, { released_date: '2026-09-30' }],
    totalIncome: 0,
    summary: { hargaProduk: null, pengembalianDana: null },
    adjustments: [{ date: '2026-09-15', description: 'x', amount: 1 }],
    adjustmentsComplete: true,
    orders: [{ released_date: '2026-09-02' }],
    warnings: [],
    ...over,
  }) as unknown as IncomeParseResult

// Pesan asli dari trigger trial_month_limit (migration 20261027000000).
const DB_ERROR =
  'trial_month_limit: Akun uji coba hanya bisa menyimpan data 2 bulan, sedangkan dengan file ini datanya jadi 3 bulan (Agustus 2026, September 2026, Oktober 2026). File ini tidak disimpan.'

describe('uploadMonths', () => {
  it('bulan uang cair laporan penghasilan + bulan iklan, tanpa dobel, urut', () => {
    expect(uploadMonths(income(), ['2026-08-01', null, '2026-09-01'])).toEqual(['2026-08-01', '2026-09-01'])
  })

  it('ikut menghitung penyesuaian dan rincian pesanan di bulan lain', () => {
    const r = income({
      adjustments: [{ date: '2026-10-01', description: 'x', amount: 1 }],
      orders: [{ released_date: '2026-08-31' }] as IncomeParseResult['orders'],
    })
    expect(uploadMonths(r, [])).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  })

  it('sama dengan yang dikirim ke database: penyesuaian tak lengkap & rincian PDF tidak disimpan', () => {
    const r = income({
      source: 'pdf',
      adjustmentsComplete: false,
      adjustments: [{ date: '2026-10-01', description: 'x', amount: 1 }],
      orders: [{ released_date: '2026-08-31' }] as IncomeParseResult['orders'],
    })
    expect(uploadMonths(r, [])).toEqual(['2026-09-01'])
  })

  it('tanpa laporan dan iklan = kosong (export pesanan tidak dihitung)', () => {
    expect(uploadMonths(null, [])).toEqual([])
  })
})

describe('trialUploadCheck', () => {
  it('bulan pertama dan kedua boleh', () => {
    expect(trialUploadCheck([], ['2026-09-01']).over).toBe(false)
    expect(trialUploadCheck(['2026-09-01'], ['2026-10-01'])).toEqual({
      months: ['2026-09-01', '2026-10-01'],
      added: ['2026-10-01'],
      over: false,
    })
  })

  it('upload ulang bulan yang sudah ada selalu boleh, walau jatah penuh', () => {
    expect(trialUploadCheck(['2026-09-01', '2026-10-01'], ['2026-10-01']).over).toBe(false)
  })

  it('bulan ke-3 ditolak, termasuk satu file yang berisi 3 bulan', () => {
    expect(trialUploadCheck(['2026-09-01', '2026-10-01'], ['2026-08-01']).over).toBe(true)
    expect(trialUploadCheck([], ['2026-08-01', '2026-09-01', '2026-10-01']).over).toBe(true)
  })

  it('batasnya 2 bulan', () => {
    expect(TRIAL_MONTH_LIMIT).toBe(2)
  })
})

describe('pesan untuk pelanggan', () => {
  it('daftar bulan dalam bahasa Indonesia', () => {
    expect(monthList(['2026-09-01'])).toBe('September 2026')
    expect(monthList(['2026-09-01', '2026-10-01'])).toBe('September 2026 dan Oktober 2026')
    expect(monthList(['2026-08-01', '2026-09-01', '2026-10-01'])).toBe('Agustus 2026, September 2026, dan Oktober 2026')
  })

  it('status jatah bulan di halaman Upload', () => {
    expect(trialMonthsNotice([])).toContain('Belum ada yang terpakai.')
    expect(trialMonthsNotice(['2026-09-01'])).toContain('Sudah terpakai: September 2026 (sisa 1 bulan).')
    expect(trialMonthsNotice(['2026-09-01', '2026-10-01'])).toContain('Upload ulang bulan itu tetap boleh')
  })

  it('pesan sebelum simpan menyebut bulan baru dan yang sudah tersimpan', () => {
    const used = ['2026-09-01', '2026-10-01']
    const msg = trialUploadProblem(trialUploadCheck(used, ['2026-08-01']), used)
    expect(msg).toContain('file ini berisi Agustus 2026')
    expect(msg).toContain('Yang sudah tersimpan: September 2026 dan Oktober 2026.')
    expect(trialUploadProblem(trialUploadCheck(used, ['2026-09-01']), used)).toBeNull()
  })

  it('penolakan database ditampilkan tanpa awalan teknis, dan tidak dilaporkan sebagai error', () => {
    expect(trialLimitMessage('duplicate key')).toBeNull()
    const msg = friendlyError({ message: DB_ERROR, code: 'P0001' })
    expect(msg.startsWith('Akun uji coba hanya bisa menyimpan data 2 bulan')).toBe(true)
    expect(msg).not.toContain('trial_month_limit')
    expect(msg).toContain('Upload ulang bulan yang sudah ada tetap boleh')
    expect(isIgnorable(DB_ERROR)).toBe(true)
  })
})

describe('kunci jatah simulasi', () => {
  it('produk yang sama = satu jatah, walau beda huruf besar/spasi', () => {
    expect(productSimKey('Bedak Padat ')).toBe(productSimKey('bedak padat'))
    expect(productSimKey('Bedak')).not.toBe(productSimKey('Lipstik'))
  })

  it('produk ketik sendiri: satu modal = satu produk', () => {
    expect(manualSimKey(15000)).toBe(manualSimKey(15000))
    expect(manualSimKey(15000)).not.toBe(manualSimKey(16000))
  })

  it('kalimat sisa jatah', () => {
    expect(trialSimNotice(3)).toMatch(/^Uji coba: 3 dari 10 produk/)
  })
})
