import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        clan: resolve(__dirname, 'clan.html'),
        ranked: resolve(__dirname, 'ranked.html'),
        war: resolve(__dirname, 'war.html'),
        learn: resolve(__dirname, 'learn.html'),
      },
    },
  },
});
