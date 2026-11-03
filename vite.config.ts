/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// <title> diisi dari VITE_APP_NAME saat build (default "Profit Shopee"). Deploy HitungCuan memakai tanda logo
// landing sebagai favicon (sama dengan isHitungCuan di src/lib/brand.ts).
function appName(): Plugin {
  let name = 'Profit Shopee'
  let siteUrl: string | undefined
  return {
    name: 'app-name',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), 'VITE_')
      name = env.VITE_APP_NAME?.trim() || name
      siteUrl = env.VITE_SITE_URL
    },
    transformIndexHtml: (html) => {
      const hitungCuan = name.replace(/\s+/g, '').toLowerCase() === 'hitungcuan'
      return html
        .replaceAll('__APP_NAME__', name.replace(/[<>&"]/g, ''))
        .replaceAll('__FAVICON__', hitungCuan ? '/logo/mark.svg' : '/favicon.svg')
        .replace('<!--__SHARE_META__-->', hitungCuan ? shareMeta(siteUrl) : '')
    },
  }
}

// Pratinjau tautan (WhatsApp, Facebook, Telegram, X) untuk deploy HitungCuan. Gambar: public/og/hitungcuan.png
// (sumber scripts/og/hitungcuan.html, render ulang dengan `npm run og`). Crawler butuh URL gambar lengkap, jadi
// alamat situs diambil dari VITE_SITE_URL (default app.studioharel.id). Deploy keluarga tidak memasang ini.
export const SHARE_TITLE = 'HitungCuan: berapa untung toko Shopee-mu bulan ini?'
export const SHARE_DESCRIPTION =
  'Upload 3 file dari Seller Centre. Dapat untung bersih bulanan, iklan yang perlu dimatikan, dan harga yang aman.'

export function shareMeta(siteUrl: string | undefined): string {
  let origin = 'https://app.studioharel.id'
  try {
    const url = new URL(siteUrl?.trim() ?? '')
    if (url.protocol === 'https:' || url.protocol === 'http:') origin = url.origin
  } catch {
    // Kosong atau tidak valid: pakai default.
  }
  const image = `${origin}/og/hitungcuan.png`
  return [
    `<meta name="description" content="${SHARE_DESCRIPTION}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="HitungCuan" />',
    '<meta property="og:locale" content="id_ID" />',
    `<meta property="og:url" content="${origin}/" />`,
    `<meta property="og:title" content="${SHARE_TITLE}" />`,
    `<meta property="og:description" content="${SHARE_DESCRIPTION}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="HitungCuan: Berapa untung tokomu bulan ini? Contoh hasil: untung Rp3,42 juta." />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${SHARE_TITLE}" />`,
    `<meta name="twitter:description" content="${SHARE_DESCRIPTION}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join('\n    ')
}

// Header keamanan untuk hosting Cloudflare (file dist/_headers). connect-src hanya mengizinkan origin
// VITE_SUPABASE_URL yang ditanam di build ini; tanpa variabel itu (build lokal) semua *.supabase.co.
// style-src perlu 'unsafe-inline' karena komponen memakai atribut style. Worker pdf.js dimuat dari /assets.
export function headersFile(supabaseUrl: string | undefined): string {
  let api = ['https://*.supabase.co', 'wss://*.supabase.co']
  try {
    const { origin, protocol } = new URL(supabaseUrl?.trim() ?? '')
    if (protocol === 'https:' || protocol === 'http:') api = [origin, origin.replace(/^http/, 'ws')]
  } catch {
    // URL kosong atau tidak valid: pakai wildcard di atas.
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${api.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  return [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Strict-Transport-Security: max-age=31536000',
    '',
    // Nama file di /assets mengandung hash isi, jadi aman disimpan browser selamanya.
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n')
}

function securityHeaders(): Plugin {
  let supabaseUrl: string | undefined
  return {
    name: 'security-headers',
    apply: 'build',
    configResolved(config) {
      supabaseUrl = loadEnv(config.mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(supabaseUrl) })
    },
  }
}

// Versi build untuk laporan error: commit yang sedang dibangun (Cloudflare Workers Builds, Pages, atau Vercel).
const appVersion = (
  process.env.WORKERS_CI_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  'dev'
).slice(0, 7)

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [react(), tailwindcss(), appName(), securityHeaders()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
