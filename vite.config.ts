import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    build: {
      sourcemap: true,
    },
    plugins: [
      react(),
      env.SENTRY_AUTH_TOKEN && mode === 'production'
        ? sentryVitePlugin({
            authToken: env.SENTRY_AUTH_TOKEN,
            telemetry: false,
          })
        : null,
    ].filter(Boolean),
    server: {
      host: true,
      port: 5173,
    },
  };
});
