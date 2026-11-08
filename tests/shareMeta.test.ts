import { describe, expect, it } from 'vitest'
import { shareMeta } from '../vite.config'

const content = (html: string, prop: string) =>
  new RegExp(`(?:property|name)="${prop}" content="([^"]*)"`).exec(html)?.[1]

describe('shareMeta (pratinjau tautan HitungCuan)', () => {
  it('default ke app.studioharel.id dengan URL gambar lengkap', () => {
    const html = shareMeta(undefined)
    expect(content(html, 'og:url')).toBe('https://app.studioharel.id/')
    expect(content(html, 'og:image')).toBe('https://app.studioharel.id/og/hitungcuan.png')
    expect(content(html, 'twitter:image')).toBe('https://app.studioharel.id/og/hitungcuan.png')
    expect(content(html, 'twitter:card')).toBe('summary_large_image')
  })

  it('memakai origin dari VITE_SITE_URL, tanpa path atau garis miring ganda', () => {
    expect(content(shareMeta('https://contoh.id/app/'), 'og:image')).toBe('https://contoh.id/og/hitungcuan.png')
  })

  it('URL tidak valid atau bukan http(s) kembali ke default', () => {
    for (const url of ['', 'bukan url', 'javascript:alert(1)']) {
      expect(content(shareMeta(url), 'og:url')).toBe('https://app.studioharel.id/')
    }
  })
})
