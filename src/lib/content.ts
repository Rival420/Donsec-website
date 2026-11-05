// Runtime content access (D1). Shapes mirror the former content-collection entries ({ id, data })
// so the components did not have to change.
import { env } from 'cloudflare:workers';
import { marked } from 'marked';
import type { Lang } from '../i18n/utils';

export type Price = { label: string; from?: number; text?: string };
export type ServiceIcon = 'apps' | 'security' | 'ai' | 'secops' | 'consultancy' | 'hosting';
export type Pillar = 'apps' | 'security' | 'ai' | 'secops' | 'consultancy';

export interface Service {
  id: string;
  body: string;
  data: {
    lang: Lang; order: number; anchor: string; icon: ServiceIcon; title: string; headline: string; summary: string;
    cta: string; ctaTopic?: string; secondary: boolean; cardPrice?: number; prices: Price[]; updatedAt: string;
  };
}
export interface WorkItem {
  id: string;
  data: { lang: Lang; order: number; name: string; summary: string; tags: string[]; url?: string; pillar: Pillar; nda: boolean; featured: boolean; updatedAt: string };
}

type ServiceRow = { anchor: string; lang: Lang; sort: number; icon: ServiceIcon; title: string; headline: string; summary: string; cta: string; cta_topic: string | null; secondary: number; card_price: number | null; prices: string; body: string; updated_at: string };
type WorkRow = { slug: string; lang: Lang; sort: number; name: string; summary: string; tags: string; url: string | null; pillar: Pillar; nda: number; featured: number; updated_at: string };

const safeJson = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };

export const rowToService = (r: ServiceRow): Service => ({
  id: `${r.lang}/${r.anchor}`,
  body: r.body,
  data: {
    lang: r.lang, order: r.sort, anchor: r.anchor, icon: r.icon, title: r.title, headline: r.headline, summary: r.summary,
    cta: r.cta, ctaTopic: r.cta_topic ?? undefined, secondary: !!r.secondary, cardPrice: r.card_price ?? undefined,
    prices: safeJson<Price[]>(r.prices, []), updatedAt: r.updated_at,
  },
});
export const rowToWork = (r: WorkRow): WorkItem => ({
  id: `${r.lang}/${r.slug}`,
  data: { lang: r.lang, order: r.sort, name: r.name, summary: r.summary, tags: safeJson<string[]>(r.tags, []), url: r.url ?? undefined, pillar: r.pillar, nda: !!r.nda, featured: !!r.featured, updatedAt: r.updated_at },
});

export async function getServices(lang: Lang, opts: { includeSecondary?: boolean } = {}): Promise<Service[]> {
  const { results } = await env.DB.prepare('SELECT * FROM services WHERE lang = ? ORDER BY sort, anchor').bind(lang).all<ServiceRow>();
  const all = results.map(rowToService);
  return opts.includeSecondary === false ? all.filter((s) => !s.data.secondary) : all;
}
export async function getService(lang: Lang, anchor: string): Promise<Service | null> {
  const r = await env.DB.prepare('SELECT * FROM services WHERE lang = ? AND anchor = ?').bind(lang, anchor).first<ServiceRow>();
  return r ? rowToService(r) : null;
}
export async function getWork(lang: Lang, opts: { featured?: boolean } = {}): Promise<WorkItem[]> {
  const sql = opts.featured ? 'SELECT * FROM work WHERE lang = ? AND featured = 1 ORDER BY sort, slug' : 'SELECT * FROM work WHERE lang = ? ORDER BY sort, slug';
  const { results } = await env.DB.prepare(sql).bind(lang).all<WorkRow>();
  return results.map(rowToWork);
}
export async function getWorkItem(lang: Lang, slug: string): Promise<WorkItem | null> {
  const r = await env.DB.prepare('SELECT * FROM work WHERE lang = ? AND slug = ?').bind(lang, slug).first<WorkRow>();
  return r ? rowToWork(r) : null;
}
export async function getSettings(lang: Lang): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings WHERE lang = ?').bind(lang).all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

/** Markdown → HTML for admin-authored bodies. Admin is behind Access; CSP blocks any inline script anyway. */
export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
}

export const ICONS: ServiceIcon[] = ['apps', 'security', 'ai', 'secops', 'consultancy', 'hosting'];
export const PILLARS: Pillar[] = ['apps', 'security', 'ai', 'secops', 'consultancy'];
export const SETTING_KEYS = ['availability.body', 'hero.sub', 'contact.intro'] as const;
