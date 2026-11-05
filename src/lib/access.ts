// Cloudflare Access JWT verification for /admin. Defense in depth behind the Access policy at the edge.
import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export interface AccessIdentity { email: string; sub: string }

export async function verifyAccess(request: Request): Promise<AccessIdentity | null> {
  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  // LOCAL DEVELOPMENT ONLY. ADMIN_DEV_BYPASS comes from .dev.vars, which wrangler never deploys.
  // (wrangler dev presents requests with the production host, so a hostname check is not possible here.)
  // Never set this as a production var or secret.
  if ((env as { ADMIN_DEV_BYPASS?: string }).ADMIN_DEV_BYPASS === 'true') return { email: 'dev@localhost', sub: 'dev' };
  if (!team || !aud) return null;
  const token = request.headers.get('cf-access-jwt-assertion') ?? readCookie(request.headers.get('cookie'), 'CF_Authorization');
  if (!token) return null;
  try {
    jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
    const p = payload as JWTPayload & { email?: string };
    if (!p.email || !p.sub) return null;
    return { email: p.email, sub: p.sub };
  } catch {
    return null;
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
