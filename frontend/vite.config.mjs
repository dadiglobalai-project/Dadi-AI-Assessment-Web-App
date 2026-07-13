import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const apiTarget =
  process.env.VITE_API_URL || 'https://dadi-ai-assessment-web-app.onrender.com';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), '.'),
    },
  },

  server: {
    port: 5173,

    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },

    hmr: process.env.DISABLE_HMR !== 'true',

    watch:
      process.env.DISABLE_HMR === 'true'
        ? null
        : {
            ignored: ['**/database.json'],
          },
  },
});
