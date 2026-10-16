import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { federation } from '@module-federation/vite';
import moduleFederationConfig from './module-federation.config';

// docker/nginx.conf sends this header in production. Matching it here keeps a reset token
// out of the Referer on the page's own module requests during development too.
function resetLinkReferrerPolicy(): Plugin {
  const apply = (middlewares: Connect.Server) => {
    middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/reset-password/')) res.setHeader('Referrer-Policy', 'no-referrer');
      next();
    });
  };
  return {
    name: 'weaver-reset-link-referrer-policy',
    configureServer: (server) => apply(server.middlewares),
    configurePreviewServer: (server) => apply(server.middlewares),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), federation(moduleFederationConfig), resetLinkReferrerPolicy()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
  build: {
    target: 'chrome89',
  },
});
