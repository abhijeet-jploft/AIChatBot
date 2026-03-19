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
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            const code = err.code || '';
            if (code === 'ECONNABORTED' || code === 'ECONNRESET' || code === 'EPIPE') return;
            console.error('[vite proxy]', err.message);
          });
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.on('error', (err) => {
              const code = err.code || '';
              if (code === 'ECONNABORTED' || code === 'ECONNRESET' || code === 'EPIPE') return;
              console.error('[vite proxy ws]', err.message);
            });
          });
        },
      },
    },
  },
});
