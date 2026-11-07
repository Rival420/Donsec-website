// Serves owner-uploaded objects from R2. Keys carry a content hash, so responses are immutable.
export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const KEY_OK = /^[a-z0-9][a-z0-9/_-]{0,120}\.(webp|png|jpg|jpeg|avif|svg)$/i;

const handler: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!KEY_OK.test(key) || key.includes('..') || key.includes('//')) return new Response('Not found', { status: 404 });

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404, headers: { 'cache-control': 'public, max-age=60' } });

  const etag = obj.httpEtag;
  const headers = new Headers({
    'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'content-length': String(obj.size),
    'cache-control': 'public, max-age=31536000, immutable',
    etag,
    'x-content-type-options': 'nosniff',
  });
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : obj.body, { status: 200, headers });
};

export const GET = handler;
export const HEAD = handler;
