// Preferencias del usuario: tema (claro/oscuro/auto) y silenciado por tipo de notificación.
// Compartidas entre content script, popup y background vía chrome.storage.local.

import { TYPE_META, type NotifType } from './notifications';

export type ThemePref = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_KEY = 'netsus_theme';
const TYPE_PREFS_KEY = 'netsus_type_prefs';

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => chrome.storage.local.get([key], (r) => resolve(r[key] as T)));
}
function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, () => resolve()));
}

// --- Tema ---
export async function getThemePref(): Promise<ThemePref> {
  const t = await storageGet<ThemePref>(THEME_KEY);
  return t === 'light' || t === 'dark' ? t : 'auto';
}

export async function setThemePref(t: ThemePref): Promise<void> {
  await storageSet(THEME_KEY, t);
}

// Resuelve 'auto' según el esquema del sistema. Solo en contextos con `matchMedia`
// (content script / popup); el background no renderiza UI y no lo necesita.
export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  const prefersDark = typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

// --- Silenciado por tipo ---
export type TypePrefs = Partial<Record<NotifType, { muted: boolean }>>;

export async function getTypePrefs(): Promise<TypePrefs> {
  const p = await storageGet<TypePrefs>(TYPE_PREFS_KEY);
  return p && typeof p === 'object' ? p : {};
}

export async function setTypeMuted(type: NotifType, muted: boolean): Promise<void> {
  const prefs = await getTypePrefs();
  prefs[type] = { muted };
  await storageSet(TYPE_PREFS_KEY, prefs);
}

// Silenciado = no suena, no toast, no pop-up del SO. Igual queda en la bandeja (badge).
export function isMuted(prefs: TypePrefs, type: NotifType): boolean {
  return prefs[type]?.muted === true;
}

// Lista ordenada de tipos con su etiqueta, para pintar la UI de preferencias.
export function typeList(): { type: NotifType; label: string }[] {
  return (Object.keys(TYPE_META) as NotifType[]).map((type) => ({ type, label: TYPE_META[type].label }));
}

// Suscripción a cambios de tema o de preferencias por tipo.
export function subscribePrefs(cb: (change: { theme?: ThemePref; typePrefs?: TypePrefs }) => void): () => void {
  const handler = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== 'local') return;
    if (changes[THEME_KEY] || changes[TYPE_PREFS_KEY]) {
      cb({
        theme: changes[THEME_KEY]?.newValue as ThemePref | undefined,
        typePrefs: changes[TYPE_PREFS_KEY]?.newValue as TypePrefs | undefined,
      });
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
