// Generates public/_headers from src/lib/security-headers.ts so both paths stay identical.
import { writeFileSync } from 'node:fs';
import { securityHeaders } from '../src/lib/security-headers.ts';
const lines = ['/*', ...Object.entries(securityHeaders).map(([k, v]) => `  ${k}: ${v}`), '',
  '# Immutable, content-hashed build assets', '/_astro/*', '  Cache-Control: public, max-age=31536000, immutable', '',
  '/fonts/*', '  Cache-Control: public, max-age=31536000, immutable', '',
  '/brand/*', '  Cache-Control: public, max-age=604800', ''];
writeFileSync(new URL('../public/_headers', import.meta.url), lines.join('\n'));
console.log('public/_headers written');
