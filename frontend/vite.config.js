import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Version of an installed frontend dependency, read at build time (shown in the About dialog).
function packageVersion(name) {
  try {
    return JSON.parse(readFileSync(resolve(import.meta.dirname, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  define: {
    __FRONTEND_LIBS__: JSON.stringify({
      svelte: packageVersion('svelte'),
      vite: packageVersion('vite'),
      apexcharts: packageVersion('apexcharts'),
      tailwindcss: packageVersion('tailwindcss'),
    }),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    middlewareMode: false,
    allowedHosts: ['localhost'],
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
        secure: false,
        ws: false
      }
    }
  }
});
