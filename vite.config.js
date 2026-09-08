import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      {
        name: 'jdoodle-proxy-middleware',
        configureServer(server) {
          server.middlewares.use('/api/jdoodle/execute', (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method Not Allowed');
              return;
            }

            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });

            req.on('end', async () => {
              try {
                const rawId = parsed.clientId || env.VITE_JDOODLE_CLIENT_ID || env.JDOODLE_CLIENT_ID || '';
                const rawSec = parsed.clientSecret || env.VITE_JDOODLE_CLIENT_SECRET || env.JDOODLE_CLIENT_SECRET || '';
                const clientId = String(rawId).replace(/^["']|["']$/g, '');
                const clientSecret = String(rawSec).replace(/^["']|["']$/g, '');
                const targetUrl = (env.VITE_JDOODLE_API_URL || 'https://api.jdoodle.com/v1/execute').replace(/^["']|["']$/g, '');

                const response = await fetch(targetUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    clientId,
                    clientSecret,
                    script: parsed.script || '',
                    language: parsed.language || 'nodejs',
                    versionIndex: parsed.versionIndex || '4',
                    stdin: parsed.stdin || ''
                  })
                });

                const data = await response.json();
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message, statusCode: 500 }));
              }
            });
          });
        }
      }
    ],
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
  };
});
