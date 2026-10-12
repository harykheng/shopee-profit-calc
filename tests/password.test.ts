import { describe, expect, it } from 'vitest'
import { needsPasswordChange, validateNewPassword } from '../src/lib/password'

describe('needsPasswordChange', () => {
  it('akun baru dari admin (tanpa metadata) harus ganti password', () => {
    expect(needsPasswordChange({})).toBe(true)
    expect(needsPasswordChange({ user_metadata: {} })).toBe(true)
    expect(needsPasswordChange({ user_metadata: null })).toBe(true)
    expect(needsPasswordChange(null)).toBe(true)
  })

  it('sudah ganti password: banner hilang', () => {
    expect(needsPasswordChange({ user_metadata: { password_changed: true } })).toBe(false)
  })

  it('hanya nilai true yang dihitung', () => {
    expect(needsPasswordChange({ user_metadata: { password_changed: 'true' } })).toBe(true)
    expect(needsPasswordChange({ user_metadata: { password_changed: false } })).toBe(true)
  })
})

describe('validateNewPassword', () => {
  it('terlalu pendek', () => {
    expect(validateNewPassword('abc1234', 'abc1234')).toMatch(/minimal 8/)
  })
  it('konfirmasi beda', () => {
    expect(validateNewPassword('abcd1234', 'abcd1235')).toMatch(/tidak sama/)
  })
  it('benar', () => {
    expect(validateNewPassword('abcd1234', 'abcd1234')).toBeNull()
  })
})
