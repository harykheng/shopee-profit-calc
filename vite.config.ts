/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// <title> diisi dari VITE_APP_NAME saat build (default "Profit Shopee"). Deploy HitungCuan memakai tanda logo
// landing sebagai favicon (sama dengan isHitungCuan di src/lib/brand.ts).
function appName(): Plugin {
  let name = 'Profit Shopee'
  return {
    name: 'app-name',
    configResolved(config) {
      name = loadEnv(config.mode, process.cwd(), 'VITE_').VITE_APP_NAME?.trim() || name
    },
    transformIndexHtml: (html) => {
      const hitungCuan = name.replace(/\s+/g, '').toLowerCase() === 'hitungcuan'
      return html
        .replaceAll('__APP_NAME__', name.replace(/[<>&"]/g, ''))
        .replaceAll('__FAVICON__', hitungCuan ? '/logo/mark.svg' : '/favicon.svg')
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
  plugins: [react(), tailwindcss(), appName()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
