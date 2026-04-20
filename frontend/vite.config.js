import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@assistant': path.resolve(__dirname, '../assistant/client'),
      // 强制从 frontend/node_modules 解析，避免 Rolldown 从 assistant/ 路径找不到包
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client'),
      'react-router-dom': path.resolve(__dirname, 'node_modules/react-router-dom'),
      'zustand': path.resolve(__dirname, 'node_modules/zustand'),
      'zustand/middleware': path.resolve(__dirname, 'node_modules/zustand/middleware'),
    },
  },
  server: {
    proxy: {
      '/api': process.env.VITE_BACKEND_URL || 'http://localhost:3000',
    },
    fs: {
      // 允许 Vite 服务 frontend/ 目录之外的文件（assistant/client/）
      allow: ['..'],
    },
  },
})
