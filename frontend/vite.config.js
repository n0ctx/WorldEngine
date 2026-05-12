import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'))

// 主题 CSS 热更新：监听 /themes/ 与 /data/themes/ 下的 *.css 变化，
// 向浏览器广播 `we:theme-css-changed`，前端在 themes.js 里订阅后重抓当前主题 CSS。
function themeHotReloadPlugin() {
  const repoRoot = path.resolve(__dirname, '..')
  const watchDirs = [
    path.join(repoRoot, 'themes'),
    path.join(repoRoot, 'data/themes'),
  ]
  return {
    name: 'we-theme-hot-reload',
    apply: 'serve',
    configureServer(server) {
      for (const dir of watchDirs) server.watcher.add(`${dir}/**/*.css`)
      const onChange = (file) => {
        if (!file.endsWith('.css')) return
        if (!watchDirs.some((d) => file.startsWith(d))) return
        server.ws.send({ type: 'custom', event: 'we:theme-css-changed', data: { file } })
      }
      server.watcher.on('change', onChange)
      server.watcher.on('add', onChange)
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  plugins: [react(), tailwindcss(), themeHotReloadPlugin()],
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
