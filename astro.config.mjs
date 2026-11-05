// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// donsec.be — static-first Astro site on Cloudflare Workers.
// Everything is prerendered except /api/contact (Turnstile + email).
export default defineConfig({
  site: 'https://donsec.be',
  trailingSlash: 'never',
  output: 'static',
  session: false,
  adapter: cloudflare({
    // Build-time image optimisation only; no runtime Images binding needed.
    imageService: 'compile',
  }),
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'en', locales: { en: 'en', nl: 'nl' } },
      filter: (page) => !page.includes('/api/'),
    }),
  ],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'nl'],
    routing: { prefixDefaultLocale: false },
  },
  build: {
    // Strict CSP: never inline <style> blocks; everything is served from /_astro/.
    inlineStylesheets: 'never',
    format: 'file',
  },
  env: {
    schema: {
      // Public Turnstile site key (baked into the static contact page at build time).
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({
        context: 'client',
        access: 'public',
        // Cloudflare's "always passes" test key — overridden in CI / .env for production.
        default: '1x00000000000000000000AA',
      }),
    },
  },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
