import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // 工作线程比默认的子进程启动快，全量约 20 秒降到 12 秒；不关隔离，关了会有用例互相污染
    pool: 'threads',
    // 关掉 Node 自带的 localStorage，让 jsdom 的生效；写在这里而不是 NODE_OPTIONS=，Windows 的 npm 脚本也能跑
    execArgv: ['--no-experimental-webstorage'],
    globals: true,
    setupFiles: ['./tests/setup.js', './tests/setup/axe-setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/api/**/*.js',
        'src/hooks/**/*.js',
        'src/pages/**/*.{js,jsx}',
        'src/store/**/*.js',
      ],
      exclude: [
        'src/main.jsx',
      ],
    },
  },
});
