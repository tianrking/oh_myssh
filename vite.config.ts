import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createWsTcpRelayPlugin } from './scripts/vite-ws-tcp-relay';

const empty = path.resolve(__dirname, 'src/shims/empty.js');
const GATEWAY = process.env.OMS_GATEWAY_PORT || '3922';

export default defineConfig({
  plugins: [react(), tailwindcss(), createWsTcpRelayPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer/',
      'node-rsa': empty,
      stream: empty,
      crypto: empty,
      net: empty,
      path: empty,
      os: empty,
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', '@microsoft/dev-tunnels-ssh'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'UNRESOLVED_IMPORT') return;
        warn(warning);
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Browser → same origin /ssh-ws → WebSSH gateway
      '/ssh-ws': {
        target: `ws://127.0.0.1:${GATEWAY}`,
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ssh-ws/, '/ssh'),
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/ssh-ws': {
        target: `ws://127.0.0.1:${GATEWAY}`,
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ssh-ws/, '/ssh'),
      },
    },
  },
});
