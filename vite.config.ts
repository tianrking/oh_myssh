import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createWsTcpRelayPlugin } from './scripts/vite-ws-tcp-relay';

const empty = path.resolve(__dirname, 'src/shims/empty.js');

export default defineConfig({
  plugins: [react(), tailwindcss(), createWsTcpRelayPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer/',
      // Node-only optional deps pulled by @microsoft/dev-tunnels-ssh
      // Browser path uses WebCrypto; these never execute at runtime.
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
        // Suppress noisy unresolved optional Node deps
        if (warning.code === 'UNRESOLVED_IMPORT') return;
        warn(warning);
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  preview: {
    port: 4173,
  },
});
