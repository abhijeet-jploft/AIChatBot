import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7001,
    allowedHosts: [
      'chat.tasksplan.com' 
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:7022',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
