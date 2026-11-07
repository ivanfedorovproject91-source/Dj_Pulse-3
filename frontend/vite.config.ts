import { rmSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const demo = process.env.VITE_USE_DEMO === '1';

// base './' — приложение работает из подпапки GitHub Pages (https://user.github.io/repo/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      // Защита: вымышленный демо-набор никогда не попадает в боевую сборку.
      name: 'strip-demo-data',
      apply: 'build',
      closeBundle() {
        if (!demo) rmSync('dist/demo-data', { recursive: true, force: true });
      },
    },
  ],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 700 },
  test: { environment: 'node' },
});
