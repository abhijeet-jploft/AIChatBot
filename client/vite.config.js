import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';

/** Quiet benign noise when clients disconnect from the /api WebSocket proxy (ECONNABORTED / ECONNRESET). */
function createFilteredViteLogger() {
  const logger = createLogger();
  const origWarn = logger.warn.bind(logger);
  logger.warn = (msg, options) => {
    const text = typeof msg === 'string' ? msg : String(msg ?? '');
    if (text.includes('ws proxy socket error')) return;
    origWarn(msg, options);
  };
  return logger;
}

export default defineConfig({
  customLogger: createFilteredViteLogger(),
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
        /** Allow long-running super-admin training (scrape, transcribe, large uploads). */
        timeout: 1_800_000,
        proxyTimeout: 1_800_000,
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
      '/embed': {
        target: 'http://localhost:7022',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:7022',
        changeOrigin: true,
      },
    },
  },
});
