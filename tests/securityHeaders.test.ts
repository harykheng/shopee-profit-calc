import { describe, expect, it } from 'vitest'
import { headersFile } from '../vite.config'

const csp = (file: string) => /Content-Security-Policy: (.*)/.exec(file)?.[1] ?? ''
const directive = (file: string, name: string) =>
  csp(file)
    .split('; ')
    .find((d) => d.startsWith(`${name} `))

describe('headersFile (dist/_headers)', () => {
  it('connect-src hanya origin Supabase yang dipakai build ini', () => {
    const file = headersFile('https://abcd1234.supabase.co/')
    expect(directive(file, 'connect-src')).toBe("connect-src 'self' https://abcd1234.supabase.co wss://abcd1234.supabase.co")
  })

  it('domain kustom dan Supabase lokal (http) tetap dipetakan ke websocket yang cocok', () => {
    expect(directive(headersFile('https://db.contoh.id'), 'connect-src')).toBe(
      "connect-src 'self' https://db.contoh.id wss://db.contoh.id",
    )
    expect(directive(headersFile('http://127.0.0.1:54321'), 'connect-src')).toBe(
      "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321",
    )
  })

  it('tanpa URL (atau URL rusak) jatuh ke *.supabase.co, bukan membuka semua host', () => {
    for (const url of [undefined, '', 'bukan url', 'javascript:alert(1)']) {
      expect(directive(headersFile(url), 'connect-src')).toBe("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
    }
  })

  it('melarang skrip luar, eval, dan pemuatan di dalam iframe situs lain', () => {
    const file = headersFile('https://abcd1234.supabase.co')
    expect(directive(file, 'script-src')).toBe("script-src 'self'")
    expect(csp(file)).not.toContain('unsafe-eval')
    expect(directive(file, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(file).toContain('X-Frame-Options: DENY')
    expect(file).toContain('X-Content-Type-Options: nosniff')
  })

  it('hanya file ber-hash di /assets yang disimpan lama oleh browser', () => {
    const file = headersFile(undefined)
    const rules = file.split('\n\n').map((block) => block.trim())
    expect(rules[0].startsWith('/*\n')).toBe(true)
    expect(rules[0]).not.toContain('Cache-Control')
    expect(rules[1]).toBe('/assets/*\n  Cache-Control: public, max-age=31536000, immutable')
  })
})
