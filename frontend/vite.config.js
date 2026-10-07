import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'))
const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:3000'

// 启动脚本（WorldEngine.bat / .command）设 WE_OPEN_BROWSER=1：等 vite 与后端都能连上再开浏览器，
// 避免页面先于后端加载，首屏 /api 请求全部 ECONNREFUSED；手动 npm run dev 不弹浏览器。
function openWhenBackendReadyPlugin() {
  const { hostname, port } = new URL(backendUrl)
  const host = hostname === 'localhost' ? '127.0.0.1' : hostname
  const canConnect = () => new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port) || 80 })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
  return {
    name: 'we-open-when-backend-ready',
    apply: 'serve',
    configureServer(server) {
      if (process.env.WE_OPEN_BROWSER !== '1') return
      server.httpServer?.once('listening', async () => {
        const deadline = Date.now() + 60_000
        while (Date.now() < deadline && !(await canConnect())) {
          await new Promise((r) => setTimeout(r, 300))
        }
        server.openBrowser()
      })
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  plugins: [react(), tailwindcss(), openWhenBackendReadyPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom', 'zustand'],
  },
  server: {
    // predev 已释放 5173；仍被占用时直接报错，不悄悄换端口
    strictPort: true,
    host: process.env.HOST || '127.0.0.1',
    proxy: {
      '/api': backendUrl,
    },
    fs: {
      // 允许 Vite 服务 frontend/ 目录之外的本地 workspace/package 源码
      allow: ['..'],
    },
  },
})
