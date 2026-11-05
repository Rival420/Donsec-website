// Small helpers for the admin forms (plain HTML POSTs, no client JS).
import { env } from 'cloudflare:workers';
import type { Price } from '../content';

export const str = (f: FormData, k: string, max = 2000) => (typeof f.get(k) === 'string' ? (f.get(k) as string).replace(/\r\n/g, '\n').trim().slice(0, max) : '');
export const int = (f: FormData, k: string, d = 0) => { const n = Number.parseInt(str(f, k, 12), 10); return Number.isFinite(n) ? n : d; };
export const intOrNull = (f: FormData, k: string) => { const s = str(f, k, 12); if (!s) return null; const n = Number.parseInt(s, 10); return Number.isFinite(n) ? n : null; };
export const bool = (f: FormData, k: string) => f.get(k) === 'on' || f.get(k) === '1';
export const lang = (v: string | null): 'en' | 'nl' => (v === 'nl' ? 'nl' : 'en');
export const slugOk = (s: string) => /^[a-z0-9][a-z0-9-]{0,48}$/.test(s);

/** "Label | 750" or "Label | day rate on request", one per line. */
export function parsePrices(text: string): Price[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [label, ...rest] = l.split('|');
    const v = rest.join('|').trim();
    const n = Number.parseInt(v.replace(/[^\d]/g, ''), 10);
    const isNumber = /^[€\s]*\d[\d.,\s]*$/.test(v);
    return isNumber && Number.isFinite(n) ? { label: label.trim(), from: n } : v ? { label: label.trim(), text: v } : { label: label.trim() };
  });
}
export const formatPrices = (p: Price[]) => p.map((r) => `${r.label} | ${r.from ?? r.text ?? ''}`.replace(/ \| $/, '')).join('\n');
export const parseTags = (text: string) => text.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12);

export async function audit(actor: string, action: string, target: string) {
  await env.DB.prepare('INSERT INTO audit_log (actor, action, target) VALUES (?, ?, ?)').bind(actor, action, target).run();
}

export const redirect = (to: string) => new Response(null, { status: 303, headers: { location: to } });
