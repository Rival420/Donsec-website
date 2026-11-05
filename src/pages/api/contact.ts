import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// The only server-rendered route on the site.
// Flow: honeypot → rate limit (per IP) → Turnstile siteverify → validate → send email. Nothing is stored.

const TOPICS: Record<string, string> = {
  apps: 'Custom web applications & websites',
  security: 'Security assessments & penetration testing',
  ai: 'AI engineering & secure AI adoption',
  secops: 'Security operations automation & tooling',
  consultancy: 'Consultancy, training & NIS2 readiness',
  other: 'Something else',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// Response.redirect() has immutable headers (middleware can't add security headers) → build it by hand.
const redirect = (path: string) => new Response(null, { status: 303, headers: { location: new URL(path, env.SITE_ORIGIN).href, 'cache-control': 'no-store' } });

const clean = (v: FormDataEntryValue | null, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const POST: APIRoute = async ({ request }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  let contactPath = '/contact';
  const fail = (status: number, error: string) =>
    wantsJson ? json(status, { ok: false, error }) : redirect(`${contactPath}#${error === 'ratelimited' || error === 'turnstile' ? error : 'error'}`);

  // Same-origin only.
  const origin = request.headers.get('origin');
  if (origin && origin !== env.SITE_ORIGIN && !origin.endsWith('.workers.dev') && !origin.startsWith('http://localhost')) {
    return fail(403, 'origin');
  }

  const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  const { success: allowed } = await env.CONTACT_RATE_LIMITER.limit({ key: `contact:${ip}` });
  if (!allowed) return fail(429, 'ratelimited');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'invalid');
  }

  // Honeypot filled → pretend success, send nothing.
  const lang = clean(form.get('lang'), 2) === 'nl' ? 'nl' : 'en';
  if (lang === 'nl') contactPath = '/nl/contact';
  if (clean(form.get('website'), 10)) return wantsJson ? json(200, { ok: true }) : redirect(`${contactPath}#sent`);

  const name = clean(form.get('name'), 120);
  const company = clean(form.get('company'), 120);
  const email = clean(form.get('email'), 200);
  const topic = clean(form.get('topic'), 20);
  const message = clean(form.get('message'), 5000);
  const token = clean(form.get('cf-turnstile-response'), 4096);

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(400, 'invalid');
  if (!token) return fail(403, 'turnstile');

  // Turnstile siteverify.
  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  });
  const outcome = (await verify.json()) as { success: boolean; 'error-codes'?: string[] };
  if (!outcome.success) return fail(403, 'turnstile');

  const topicLabel = TOPICS[topic] ?? '—';
  const subject = `[donsec.be] ${topicLabel}${company ? ` — ${company}` : ''} — ${name}`;
  const text = [
    `New contact form message (${lang})`,
    '',
    `Name:    ${name}`,
    `Company: ${company || '—'}`,
    `Email:   ${email}`,
    `Topic:   ${topicLabel}`,
    '',
    message,
    '',
    '—',
    `Sent via donsec.be contact form. Reply to this mail to answer ${name}.`,
  ].join('\n');
  const html = `<p><strong>New contact form message</strong> (${lang})</p>
<table cellpadding="4">
<tr><td>Name</td><td>${escapeHtml(name)}</td></tr>
<tr><td>Company</td><td>${escapeHtml(company || '—')}</td></tr>
<tr><td>Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
<tr><td>Topic</td><td>${escapeHtml(topicLabel)}</td></tr>
</table>
<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>
<p style="color:#64748B">Sent via donsec.be contact form. Reply to this mail to answer ${escapeHtml(name)}.</p>`;

  try {
    await env.EMAIL.send({
      from: { email: env.CONTACT_FROM, name: 'donsec.be' },
      to: env.CONTACT_TO,
      replyTo: { email, name },
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error('contact: email send failed', (err as { code?: string })?.code, (err as Error)?.message);
    return fail(502, 'send');
  }

  return wantsJson ? json(200, { ok: true }) : redirect(`${contactPath}#sent`);
};

export const GET: APIRoute = () => json(405, { ok: false, error: 'method' });
