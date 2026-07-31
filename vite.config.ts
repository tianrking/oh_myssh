import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createWsTcpRelayPlugin } from './scripts/vite-ws-tcp-relay';

const empty = path.resolve(__dirname, 'src/shims/empty.js');

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), createWsTcpRelayPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...(mode === 'test' ? {} : { buffer: 'buffer/' }),
      events: 'events/',
      'node-rsa': empty,
      stream: 'stream-browserify',
      crypto: empty,
      fs: empty,
      net: empty,
      path: empty,
      os: empty,
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', '@microsoft/dev-tunnels-ssh', '@microsoft/dev-tunnels-ssh-keys'],
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
  },
  server: {
    port: 3000,
    open: true,
  },
  preview: {
    port: 4173,
  },
}));
