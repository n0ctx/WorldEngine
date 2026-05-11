import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom', 'zustand'],
  },
  server: {
    proxy: {
      '/api': process.env.VITE_BACKEND_URL || 'http://localhost:3000',
    },
    fs: {
      // 允许 Vite 服务 frontend/ 目录之外的本地 workspace/package 源码
      allow: ['..'],
    },
  },
})
