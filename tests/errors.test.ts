import { describe, expect, it } from 'vitest'
import { adminHint, friendlyError } from '../src/lib/errors'

describe('friendlyError: database belum diperbarui', () => {
  const cases: [string, string][] = [
    ['column stores.active_until does not exist', '20261012000000_multi_tenant.sql'],
    ['relation "public.store_members" does not exist', '20261012000000_multi_tenant.sql'],
    ['function upsert_income_adjustments not found', '20261004000000_income_adjustments.sql'],
    ['column products.admin_pct does not exist', '20261007000000_product_fee_settings.sql'],
    ['function save_ad_report does not exist', '20261006000000_ads.sql'],
  ]

  it.each(cases)('pesan pelanggan tidak membocorkan SQL/Supabase: %s', (message, file) => {
    const shown = friendlyError(new Error(message))
    expect(shown).toMatch(/gangguan di sistem/)
    expect(shown).toMatch(/pengelola aplikasi/)
    expect(shown).not.toMatch(/sql|supabase|readme|migration/i)
    expect(adminHint(new Error(message))).toContain(file)
  })

  it('error biasa tidak punya petunjuk pengelola', () => {
    expect(adminHint(new Error('Invalid login credentials'))).toBeNull()
    expect(friendlyError(new Error('Invalid login credentials'))).toBe('Email atau password salah.')
  })
})

describe('friendlyError: ganti password', () => {
  it('menerjemahkan pesan Supabase', () => {
    expect(friendlyError(new Error('New password should be different from the old password.'))).toMatch(/berbeda/)
    expect(friendlyError(new Error('Password should be at least 6 characters.'))).toMatch(/terlalu lemah/)
    expect(friendlyError(new Error('Password update requires reauthentication'))).toMatch(/login lagi/)
  })
})

describe('friendlyError: kategori biaya admin', () => {
  it('nama kategori kembar: pesan jelas, bukan "database belum diperbarui"', () => {
    const e = new Error('duplicate key value violates unique constraint "fee_categories_store_name_key"')
    expect(friendlyError(e)).toMatch(/sudah ada kategori/i)
    expect(adminHint(e)).toBeNull()
  })
  it('tabel belum ada: pesan umum untuk pelanggan, petunjuk file untuk pengelola', () => {
    const e = new Error("Could not find the table 'public.fee_categories' in the schema cache")
    expect(friendlyError(e)).toMatch(/gangguan di sistem/)
    expect(adminHint(e)).toContain('20261014000000_fee_categories.sql')
  })
})

describe('friendlyError: pengaturan toko', () => {
  it('tabel belum ada: pesan umum untuk pelanggan, file untuk pengelola', () => {
    const e = new Error("Could not find the table 'public.store_settings' in the schema cache")
    expect(friendlyError(e)).toMatch(/gangguan di sistem/)
    expect(adminHint(e)).toContain('20261015000000_store_settings.sql')
  })
})
