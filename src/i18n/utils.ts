import { ui, defaultLang, type Lang, type UIKey } from './ui';
export type { Lang, UIKey };

export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang && lang in ui) return lang as Lang;
  return defaultLang;
}

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}

/** Build a localised path. `path` is the EN path without locale prefix. */
export function localePath(lang: Lang, path: string): string {
  const clean = path === '/' ? '' : path.replace(/\/$/, '');
  if (lang === defaultLang) return clean || '/';
  return `/${lang}${clean}`;
}

/** Strip the locale prefix from a pathname. */
export function stripLocale(pathname: string): string {
  const m = pathname.match(/^\/(nl)(\/|$)/);
  if (!m) return pathname;
  const rest = pathname.slice(m[0].length - (m[2] ? 1 : 0));
  return rest || '/';
}

export const otherLang = (lang: Lang): Lang => (lang === 'en' ? 'nl' : 'en');
