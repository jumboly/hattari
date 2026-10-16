import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// サウンドラボ（lab.html）も一緒にビルドし、本番ビルドでも試聴できるようにする
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), lab: resolve(__dirname, 'lab.html') },
    },
  },
});
