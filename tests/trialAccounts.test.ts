import { describe, expect, it } from 'vitest'
import {
  addDays,
  countByGroup,
  customerGroup,
  paidEnd,
  extendedEnd,
  extensionStart,
  asksStoreName,
  cleanStoreName,
  customerStatus,
  defaultTrialEnd,
  generatePassword,
  lastLoginLabel,
  normalizeTrialForm,
  storeNameFromEmail,
  summarizeCustomers,
  validateStoreName,
  validateTrialForm,
  welcomeMessage,
  type CustomerRow,
} from '../src/lib/trialAccounts'

const wib = (date: string, time = '12:00:00') => new Date(`${date}T${time}+07:00`)
const NOW = wib('2026-10-26')

describe('generatePassword', () => {
  it('10 karakter, ada huruf dan angka, tanpa karakter yang mirip', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword()
      expect(p).toHaveLength(10)
      expect(p).toMatch(/[2-9]/)
      expect(p).toMatch(/[a-zA-Z]/)
      expect(p).not.toMatch(/[0O1lI]/)
    }
  })

  it('tetap ada angka walau acaknya selalu memilih huruf', () => {
    const p = generatePassword(() => 0)
    expect(p).toMatch(/[2-9]/)
    expect(p).toMatch(/[a-z]/)
  })
})

describe('tanggal', () => {
  it('addDays melewati akhir bulan & tahun', () => {
    expect(addDays('2026-10-26', 14)).toBe('2026-11-09')
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04')
  })

  it('bawaan 30 hari termasuk hari ini (hari ini WIB + 29)', () => {
    expect(defaultTrialEnd(NOW)).toBe('2026-11-24')
    // Contoh di OPERASI.md: dibuat 1 November → 30 November
    expect(defaultTrialEnd(wib('2026-11-01'))).toBe('2026-11-30')
    // 00:30 WIB tanggal 27 dihitung tanggal 27, bukan 26 (UTC)
    expect(defaultTrialEnd(wib('2026-10-27', '00:30:00'))).toBe('2026-11-25')
  })
})

describe('isian', () => {
  const ok = { email: ' Budi.Santoso@Gmail.com ', password: 'Rahasia123', storeName: '', activeUntil: '2026-11-09' }

  it('nama toko kosong diambil dari email, email dirapikan', () => {
    expect(storeNameFromEmail('budi.santoso@gmail.com')).toBe('Toko budi.santoso')
    expect(normalizeTrialForm(ok)).toEqual({
      email: 'budi.santoso@gmail.com',
      password: 'Rahasia123',
      storeName: 'Toko budi.santoso',
      activeUntil: '2026-11-09',
    })
  })

  it('isian benar lolos', () => {
    expect(validateTrialForm(ok, NOW)).toBeNull()
    expect(validateTrialForm({ ...ok, activeUntil: '2026-10-26' }, NOW)).toBeNull()
  })

  it('menolak isian salah', () => {
    expect(validateTrialForm({ ...ok, email: 'budi' }, NOW)).toMatch(/Email/)
    expect(validateTrialForm({ ...ok, email: 'budi@gmail' }, NOW)).toMatch(/Email/)
    expect(validateTrialForm({ ...ok, password: 'pendek' }, NOW)).toMatch(/minimal 8/)
    expect(validateTrialForm({ ...ok, password: 'a'.repeat(73) }, NOW)).toMatch(/panjang/)
    expect(validateTrialForm({ ...ok, storeName: 'x'.repeat(101) }, NOW)).toMatch(/Nama toko/)
    expect(validateTrialForm({ ...ok, activeUntil: '' }, NOW)).toMatch(/tanggal/)
    expect(validateTrialForm({ ...ok, activeUntil: '2026-10-25' }, NOW)).toMatch(/sebelum hari ini/)
  })
})

describe('welcomeMessage', () => {
  it('memuat link, email, password, dan tanggal', () => {
    const text = welcomeMessage({
      appName: 'HitungCuan',
      loginUrl: 'https://app.contoh.id/',
      email: 'budi@gmail.com',
      password: 'Rahasia123',
      activeUntil: '2026-11-09',
    })
    expect(text).toContain('https://app.contoh.id/')
    expect(text).toContain('Email: budi@gmail.com')
    expect(text).toContain('Password: Rahasia123')
    expect(text).toContain('1 bulan')
    expect(text).toContain('50 produk')
    expect(text).toContain('9 Nov 2026')
    expect(text).not.toMatch(/—/)
  })
})

describe('customerStatus', () => {
  it('membedakan aktif, hampir habis, baca saja, tanpa batas', () => {
    expect(customerStatus('2026-11-09', NOW)).toEqual({ state: 'active', label: 'Aktif, sisa 14 hari' })
    expect(customerStatus('2026-10-29', NOW).state).toBe('expiring')
    expect(customerStatus('2026-10-27', NOW).label).toBe('Aktif, sisa 1 hari (besok terakhir)')
    expect(customerStatus('2026-10-26', NOW).label).toBe('Aktif, hari ini terakhir')
    expect(customerStatus('2026-10-25', NOW)).toEqual({ state: 'expired', label: 'Baca saja sejak 26 Okt 2026' })
    expect(customerStatus(null, NOW)).toEqual({ state: 'unlimited', label: 'Tanpa batas' })
  })
})

describe('lastLoginLabel', () => {
  it('menurut tanggal WIB', () => {
    expect(lastLoginLabel(null, NOW)).toBe('Belum pernah login')
    expect(lastLoginLabel('2026-10-26T01:00:00Z', NOW)).toBe('Hari ini')
    // 23:00 UTC tanggal 25 = 06:00 WIB tanggal 26
    expect(lastLoginLabel('2026-10-25T23:00:00Z', NOW)).toBe('Hari ini')
    expect(lastLoginLabel('2026-10-25T05:00:00Z', NOW)).toBe('Kemarin')
    expect(lastLoginLabel('2026-10-21T05:00:00Z', NOW)).toBe('5 hari lalu')
    expect(lastLoginLabel('2026-06-01T05:00:00Z', NOW)).toBe('1 Jun 2026')
  })
})

describe('summarizeCustomers', () => {
  const row = (p: Partial<CustomerRow>): CustomerRow => ({
    store_id: 1,
    store_name: 'Toko',
    active_until: '2026-11-09',
    trial: true,
    created_at: null,
    owner_emails: ['a@b.co'],
    last_sign_in_at: null,
    ...p,
  })

  it('hanya uji coba yang masih aktif dihitung', () => {
    expect(
      summarizeCustomers(
        [
          row({}),
          row({ last_sign_in_at: '2026-10-25T05:00:00Z' }),
          row({ active_until: '2026-10-01' }),
          row({ trial: false }),
          row({ trial: false, active_until: null }),
        ],
        NOW,
      ),
    ).toEqual({ total: 5, activeTrials: 2, neverLoggedIn: 1 })
  })

  it('dashboard: uji coba aktif, berlangganan aktif (termasuk tanpa batas), dan yang sudah berakhir', () => {
    const rows = [
      row({}),
      row({ active_until: '2026-10-01' }),
      row({ trial: false }),
      row({ trial: false, active_until: null }),
      row({ trial: false, active_until: '2026-10-25' }),
    ]
    expect(rows.map((r) => customerGroup(r, NOW))).toEqual(['trial', 'ended', 'paid', 'paid', 'ended'])
    expect(countByGroup(rows, NOW)).toEqual({ trial: 1, paid: 2, ended: 2 })
    // Hari terakhir masih aktif.
    expect(customerGroup(row({ active_until: '2026-10-26' }), NOW)).toBe('trial')
  })
})

describe('paidEnd', () => {
  it('N bulan dari hari ini, hari ini ikut dihitung', () => {
    expect(paidEnd(1, NOW)).toBe('2026-11-25')
    expect(paidEnd(12, NOW)).toBe('2027-10-25')
  })

  it('tanggal yang tidak ada di bulan tujuan mundur ke akhir bulan', () => {
    expect(paidEnd(1, wib('2027-01-31'))).toBe('2027-02-27')
    expect(paidEnd(1, wib('2026-12-15'))).toBe('2027-01-14')
  })
})

describe('extendedEnd', () => {
  it('masih aktif: lanjut dari tanggal berakhir sekarang, sisa hari tidak hilang', () => {
    expect(extensionStart('2026-11-30', NOW)).toBe('2026-12-01')
    expect(extendedEnd('2026-11-30', 1, NOW)).toBe('2026-12-31')
    expect(extendedEnd('2026-11-30', 12, NOW)).toBe('2027-11-30')
    // Hari terakhir (hari ini) masih aktif.
    expect(extendedEnd('2026-10-26', 1, NOW)).toBe('2026-11-26')
  })

  it('sudah berakhir: mulai hari ini', () => {
    expect(extensionStart('2026-10-01', NOW)).toBe('2026-10-26')
    expect(extendedEnd('2026-10-01', 1, NOW)).toBe(paidEnd(1, NOW))
  })
})

describe('welcomeMessage akun berlangganan', () => {
  it('tanpa kalimat batas uji coba', () => {
    const text = welcomeMessage({
      appName: 'HitungCuan',
      loginUrl: 'https://app.contoh.id/',
      email: 'budi@gmail.com',
      password: 'Rahasia123',
      activeUntil: '2026-11-25',
      trial: false,
    })
    expect(text).toContain('Akun HitungCuan kamu sudah aktif.')
    expect(text).toContain('Langganan aktif sampai')
    expect(text).toContain('Password: Rahasia123')
    expect(text).not.toContain('uji coba')
    expect(text).not.toContain('50 produk')
  })
})

describe('trialErrorMessage', () => {
  const fallback = () => 'umum'
  const noHint = () => null
  it('pesan database untuk pengelola ditampilkan apa adanya', async () => {
    const { trialErrorMessage } = await import('../src/lib/trialAccounts')
    expect(trialErrorMessage({ code: '23505', message: 'Email a@b.co sudah terdaftar.' }, fallback, noHint)).toBe('Email a@b.co sudah terdaftar.')
    expect(trialErrorMessage({ code: '42501', message: 'Hanya pengelola yang bisa membuat akun.' }, fallback, noHint)).toMatch(/Hanya pengelola/)
    expect(trialErrorMessage({ code: 'XX000', message: 'internal' }, fallback, noHint)).toBe('umum')
    expect(trialErrorMessage({ code: 'PGRST202', message: 'x' }, fallback, () => 'jalankan SQL')).toBe('jalankan SQL')
  })
})

describe('nama toko diisi pemilik', () => {
  it('nama dikosongkan pengelola = pemilik mengisi sendiri', () => {
    const form = { email: 'budi@gmail.com', password: 'Rahasia123', storeName: '  ', activeUntil: '2026-11-09' }
    expect(asksStoreName(form)).toBe(true)
    expect(asksStoreName({ ...form, storeName: 'Toko Budi' })).toBe(false)
    // Sementara tetap tersimpan nama dari email (kolom nama wajib di database).
    expect(normalizeTrialForm(form).storeName).toBe('Toko budi')
  })

  it('nama dari pemilik dirapikan dan dicek', () => {
    expect(cleanStoreName('  Toko   Cantik  Official ')).toBe('Toko Cantik Official')
    expect(validateStoreName('   ')).toBe('Isi nama tokomu.')
    expect(validateStoreName('x'.repeat(101))).toMatch(/terlalu panjang/)
    expect(validateStoreName('Toko Cantik')).toBeNull()
  })
})
