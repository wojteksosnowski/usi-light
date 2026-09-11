import { fileURLToPath, URL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
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
        // Generyczny dispatcher dla lokalnego `npm run dev`: mapuje dowolną ścieżkę /api/**
        // na odpowiadający jej plik api/**.ts i wywołuje go tym samym mostkiem VercelRequest/Response
        // co produkcyjne funkcje serverless Vercela. Bez tego middleware każdy endpoint poza
        // jawnie wpiętym (dawniej tylko /api/share) trafiał do SPA fallbacku Vite i zwracał pusty body.
        name: 'api-dev-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url || !req.url.startsWith('/api/')) {
              return next();
            }

            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
            const routePath = parsedUrl.pathname.slice('/api/'.length);

            // Webhook Stripe wymaga surowego body i weryfikacji podpisu - nie da się go
            // sensownie odtworzyć w dev middleware bez Stripe CLI, więc pomijamy go tutaj.
            if (routePath === 'stripe/webhook') {
              return next();
            }

            // Zabezpieczenie przed wyjściem poza katalog api/ (np. przez "..")
            const safeRoutePath = routePath.split('/').filter((seg) => seg && seg !== '.' && seg !== '..').join('/');
            const apiDir = fileURLToPath(new URL('./api', import.meta.url));
            const absolutePath = path.join(apiDir, `${safeRoutePath}.ts`);

            if (!absolutePath.startsWith(apiDir) || !existsSync(absolutePath)) {
              return next();
            }

            try {
              const { default: handler } = await server.ssrLoadModule(absolutePath);
              let body: any = undefined;
              if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
                const buffers = [];
                for await (const chunk of req) {
                  buffers.push(chunk);
                }
                const rawBody = Buffer.concat(buffers).toString();
                try {
                  body = rawBody ? JSON.parse(rawBody) : undefined;
                } catch {
                  body = rawBody;
                }
              }
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
              console.error(`Błąd w dev middleware ${req.url}:`, err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Internal Server Error' }));
              return;
            }
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
