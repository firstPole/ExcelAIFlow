import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // Your backend server address
        changeOrigin: true, // Needed for virtual hosted sites
        //rewrite: (path) => path.replace(/^\/api/, ''), // Rewrite ensures /api is removed from the path when forwarding
      },
    },
  },
});