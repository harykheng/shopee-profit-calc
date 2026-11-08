// Render gambar pratinjau tautan (Open Graph) HitungCuan: scripts/og/hitungcuan.html -> public/og/hitungcuan.png.
// Butuh Playwright + Chromium (tidak ada di dependencies). Kalau terpasang global:
//   NODE_PATH=$(npm root -g) npm run og
// Jalankan ulang hanya kalau desain/teks gambar berubah, lalu commit PNG-nya.
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

// require() supaya Playwright yang terpasang global (NODE_PATH) juga ketemu.
const { chromium } = createRequire(import.meta.url)('playwright')

const src = fileURLToPath(new URL('./og/hitungcuan.html', import.meta.url))
const out = fileURLToPath(new URL('../public/og/hitungcuan.png', import.meta.url))
mkdirSync(fileURLToPath(new URL('../public/og/', import.meta.url)), { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(pathToFileURL(src).href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out, type: 'png' })
await browser.close()
console.log('Tersimpan:', out)
