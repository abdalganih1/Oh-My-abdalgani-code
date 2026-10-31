// Dashboards (student + admin) — React + Vite. Builds into ../public, which the Worker serves as
// static assets (wrangler.toml [assets]). `npm run dev:web` proxies the API to `wrangler dev`.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));
const API = process.env.API || 'http://127.0.0.1:8799';

export default defineConfig({
  root: r('.'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': r('./src') } },
  build: {
    outDir: r('../public'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: { index: r('index.html'), admin: r('admin.html') } },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(['/api', '/v1', '/health', '/install.sh', '/install.ps1'].map((p) => [p, { target: API, changeOrigin: true }])),
  },
});
