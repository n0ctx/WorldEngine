import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.js',
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
