import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.UPSTASH_REDIS_REST_URL) {
    process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
  }
  if (env.UPSTASH_REDIS_REST_TOKEN) {
    process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
  }

  return {
    plugins: [
      react(),
      {
        name: 'api-share-dev-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && (req.url === '/api/share' || req.url.startsWith('/api/share?'))) {
              try {
                const { default: handler } = await import('./api/share.ts');
                let body: any = undefined;
                if (req.method === 'POST') {
                  const buffers = [];
                  for await (const chunk of req) {
                    buffers.push(chunk);
                  }
                  const rawBody = Buffer.concat(buffers).toString();
                  try {
                    body = JSON.parse(rawBody);
                  } catch {
                    body = rawBody;
                  }
                }
                const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
                const query: Record<string, string> = {};
                parsedUrl.searchParams.forEach((val, key) => {
                  query[key] = val;
                });

                const vercelReq: any = Object.assign(req, {
                  body,
                  query,
                  cookies: {},
                });

                const vercelRes: any = Object.assign(res, {
                  status(code: number) {
                    res.statusCode = code;
                    return vercelRes;
                  },
                  json(jsonBody: any) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(jsonBody));
                    return vercelRes;
                  },
                  send(data: any) {
                    res.end(data);
                    return vercelRes;
                  },
                });

                await handler(vercelReq, vercelRes);
                return;
              } catch (err) {
                console.error('Błąd w dev middleware /api/share:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
                return;
              }
            }
            next();
          });
        },
      },
    ],
    base: '/', // Bezwzględna ścieżka główna dla obsługi routingu SPA (np. /p/:id)
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 3000,
      open: false,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three') || id.includes('@react-three')) {
              return 'vendor-three';
            }
            if (id.includes('node_modules/jspdf')) {
              return 'vendor-pdf';
            }
            if (id.includes('node_modules/polygon-clipping') || id.includes('node_modules/rbush')) {
              return 'vendor-geo';
            }
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/zustand/')
            ) {
              return 'vendor-react';
            }
          },
        },
      },
    },
  };
});
