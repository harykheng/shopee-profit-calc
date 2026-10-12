/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// <title> diisi dari VITE_APP_NAME saat build (default "Profit Shopee").
function appName(): Plugin {
  let name = 'Profit Shopee'
  return {
    name: 'app-name',
    configResolved(config) {
      name = loadEnv(config.mode, process.cwd(), 'VITE_').VITE_APP_NAME?.trim() || name
    },
    transformIndexHtml: (html) => html.replaceAll('__APP_NAME__', name.replace(/[<>&"]/g, '')),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appName()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
