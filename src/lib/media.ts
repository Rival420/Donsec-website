// Owner-uploaded media: bytes in R2 (MEDIA), one D1 row per slot. Raster uploads are normalised once
// (WebP, resized, metadata stripped) with the Images binding; SVG logos are stored as-is after a sanity
// check. Serving is a plain R2 read from /media/<key>.
import { env } from 'cloudflare:workers';

/** Slots: 'about.photo' (the owner's portrait) or 'work.<slug>' (a project logo). */
export type MediaSlot = string;
const SLOT_OK = /^(about\.photo|work\.[a-z0-9][a-z0-9-]{0,48})$/;
export const slotOk = (s: string): s is MediaSlot => SLOT_OK.test(s);
export const workSlot = (slug: string) => `work.${slug}`;

type Kind = 'photo' | 'logo';
const kindOf = (slot: MediaSlot): Kind => (slot.startsWith('work.') ? 'logo' : 'photo');
/** Longest edge after normalisation. Photos are shown at ≤320 CSS px, logos at 48 px; 2–3× for dense screens is plenty. */
const MAX_EDGE: Record<Kind, number> = { photo: 1200, logo: 512 };

export interface Media {
  slot: MediaSlot;
  objectKey: string;
  contentType: string;
  width: number | null;
  height: number | null;
  bytes: number;
  alt: string;
  updatedAt: string;
  /** Public URL, served by the Worker from R2 with immutable caching (the key carries a content hash). */
  url: string;
}

type Row = { slot: MediaSlot; object_key: string; content_type: string; width: number | null; height: number | null; bytes: number; alt: string; updated_at: string };
const rowToMedia = (r: Row): Media => ({
  slot: r.slot, objectKey: r.object_key, contentType: r.content_type, width: r.width, height: r.height, bytes: r.bytes, alt: r.alt, updatedAt: r.updated_at, url: `/media/${r.object_key}`,
});

export async function getMedia(slot: MediaSlot): Promise<Media | null> {
  const r = await env.DB.prepare('SELECT * FROM media WHERE slot = ?').bind(slot).first<Row>();
  return r ? rowToMedia(r) : null;
}

/** All project logos in one query, keyed by work slug. */
export async function getWorkLogos(): Promise<Record<string, Media>> {
  const { results } = await env.DB.prepare("SELECT * FROM media WHERE slot LIKE 'work.%'").all<Row>();
  return Object.fromEntries(results.map((r) => [r.slot.slice('work.'.length), rowToMedia(r)]));
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SVG_BYTES = 512 * 1024;
const ACCEPTED_RASTER = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif']);

export class UploadError extends Error {}

/** Validate + normalise an uploaded image, store it in R2 and record it in D1. Replaces whatever the slot held. */
export async function storeUpload(slot: MediaSlot, file: File, alt: string): Promise<Media> {
  if (!slotOk(slot)) throw new UploadError('Unknown media slot.');
  const kind = kindOf(slot);
  if (file.size === 0) throw new UploadError('No file received.');
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('File is larger than 10 MB.');

  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const headText = new TextDecoder('utf-8', { fatal: false }).decode(head).trimStart();
  const looksSvg = /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(headText);

  let bytes: ArrayBuffer;
  let contentType: string;
  let ext: string;
  let dims: { width: number | null; height: number | null } = { width: null, height: null };

  if (looksSvg) {
    if (kind !== 'logo') throw new UploadError('SVG is only accepted for project logos; use a JPEG, PNG or WebP photo.');
    if (file.size > MAX_SVG_BYTES) throw new UploadError('SVG is larger than 512 KB.');
    const text = await file.text();
    // Served via <img> under a CSP without inline scripts, but keep active content out of storage anyway.
    if (/<script|<foreignObject|<iframe|<embed|<object|javascript:|on[a-z]+\s*=/i.test(text)) throw new UploadError('SVG contains scripts or event handlers; export a plain graphic.');
    if (/<image[^>]+href\s*=\s*["']?(https?:)?\/\//i.test(text) || /url\(\s*["']?(https?:)?\/\//i.test(text)) throw new UploadError('SVG references external resources; embed or remove them.');
    bytes = new TextEncoder().encode(text).buffer as ArrayBuffer;
    contentType = 'image/svg+xml';
    ext = 'svg';
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
    if (vb) dims = { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
  } else {
    if (file.type && !ACCEPTED_RASTER.has(file.type)) throw new UploadError(`Unsupported type ${file.type}. Use JPEG, PNG, WebP, AVIF, HEIC${kind === 'logo' ? ' or SVG' : ''}.`);
    // The Images binding decodes the bytes itself: anything that is not a real image fails here, whatever the extension says.
    const info = await env.IMAGES.info(file.stream()).catch(() => null);
    if (!info || info.format === 'image/svg+xml' || !('width' in info) || !info.width || !info.height) {
      throw new UploadError('That file is not an image the server can decode.');
    }
    // One transformation per upload, never per request. Pass a single dimension so the aspect ratio is kept everywhere,
    // including the low-fidelity local mock. WebP output never carries EXIF/XMP/ICC (Images docs: metadata is only an
    // option for JPEG output), so the stored file is pixels only.
    const max = MAX_EDGE[kind];
    const size = info.width >= info.height ? { width: Math.min(info.width, max) } : { height: Math.min(info.height, max) };
    const out = await env.IMAGES.input(file.stream())
      .transform(size)
      .output({ format: 'image/webp', quality: 85, anim: false });
    bytes = await out.response().arrayBuffer();
    contentType = 'image/webp';
    ext = 'webp';
    const outInfo = await env.IMAGES.info(new Blob([bytes]).stream()).catch(() => null);
    if (outInfo && 'width' in outInfo) dims = { width: outInfo.width, height: outInfo.height };
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const objectKey = `${slot.replace(/\./g, '/')}-${hash}.${ext}`;

  const previous = await getMedia(slot);
  await env.MEDIA.put(objectKey, bytes, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } });
  await env.DB.prepare(
    `INSERT INTO media (slot, object_key, content_type, width, height, bytes, alt, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(slot) DO UPDATE SET object_key = excluded.object_key, content_type = excluded.content_type, width = excluded.width, height = excluded.height, bytes = excluded.bytes, alt = excluded.alt, updated_at = datetime('now')`,
  ).bind(slot, objectKey, contentType, dims.width, dims.height, bytes.byteLength, alt).run();
  if (previous && previous.objectKey !== objectKey) await env.MEDIA.delete(previous.objectKey).catch(() => {});

  return (await getMedia(slot))!;
}

export async function updateAlt(slot: MediaSlot, alt: string): Promise<void> {
  await env.DB.prepare("UPDATE media SET alt = ?, updated_at = datetime('now') WHERE slot = ?").bind(alt, slot).run();
}

export async function removeMedia(slot: MediaSlot): Promise<void> {
  const m = await getMedia(slot);
  if (!m) return;
  await env.DB.prepare('DELETE FROM media WHERE slot = ?').bind(slot).run();
  await env.MEDIA.delete(m.objectKey).catch(() => {});
}
