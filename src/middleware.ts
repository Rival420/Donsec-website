import { defineMiddleware } from 'astro:middleware';
import { securityHeaders } from './lib/security-headers';
import { verifyAccess } from './lib/access';

// Static assets get their headers from public/_headers. This covers everything the Worker renders.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdmin) {
    const who = await verifyAccess(ctx.request);
    if (!who) return deny(403, 'Forbidden: no valid Cloudflare Access identity.');
    // CSRF: state-changing requests must come from this origin (Access cookies are first-party).
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
      const site = ctx.request.headers.get('sec-fetch-site');
      const origin = ctx.request.headers.get('origin');
      const sameOrigin = site ? site === 'same-origin' || site === 'none' : origin === ctx.url.origin;
      if (!sameOrigin) return deny(403, 'Forbidden: cross-site request.');
    }
    ctx.locals.adminEmail = who.email;
  }

  const res = await next();
  for (const [k, v] of Object.entries(securityHeaders)) res.headers.set(k, v);
  if (isAdmin) {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  } else if (!res.headers.has('Cache-Control')) {
    res.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  return res;
});

const deny = (status: number, msg: string) =>
  new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...securityHeaders } });
