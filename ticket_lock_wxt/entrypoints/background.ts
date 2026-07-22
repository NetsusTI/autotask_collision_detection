import {
  add as addNotif,
  getAll as getNotifs,
  dueForRenag,
  getRenagMinutes,
  bumpNag,
  type NotifType,
} from '@/lib/notifications';
import { getTypePrefs, isMuted } from '@/lib/prefs';

const DEFAULT_BASE_URL = 'https://netsus-two.vercel.app';
const DEFAULT_API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm';

let apiOnline = true;

interface FeedItem {
  type: NotifType;
  title: string;
  body: string;
  ticketId?: string;
  ticketNumber?: string;
  ticketUrl?: string;
  dedupeKey?: string;
}

function getStoredUser(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['netsus_user'], ({ netsus_user }: { netsus_user?: string }) => resolve(netsus_user || null));
  });
}

// Trae el feed n1–n5 del servidor para el técnico actual, lo vuelca en el buzón
// (silent: ya disparamos la notificación del sistema aquí) y avisa por pop-up del SO.
async function pollNotificationFeed() {
  const name = await getStoredUser();
  if (!name) return;
  const { baseUrl: BASE_URL, apiKey: API_KEY } = await getConfig();
  try {
    const res = await fetchWithRetry(
      `${BASE_URL}/api/notifications?user=${encodeURIComponent(name)}`,
      { headers: { 'x-api-key': API_KEY } },
      1,
    );
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const items: FeedItem[] = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) return;
    const prefs = await getTypePrefs();
    for (const it of items) {
      await addNotif({
        type: it.type,
        title: it.title,
        body: it.body,
        ticketId: it.ticketId,
        ticketNumber: it.ticketNumber,
        ticketUrl: it.ticketUrl,
        dedupeKey: it.dedupeKey,
        silent: true,
      });
      if (isMuted(prefs, it.type)) continue; // tipo silenciado: solo badge/bandeja
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon/128.png'),
        title: it.title,
        message: it.body,
        priority: 2,
      });
    }
  } catch {
    // silencioso: el próximo ciclo reintenta
  }
}

function getHeartbeat(): Promise<number | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['netsus_cs_heartbeat'], ({ netsus_cs_heartbeat }: { netsus_cs_heartbeat?: number }) => resolve(netsus_cs_heartbeat));
  });
}

// Re-nag de respaldo: si NO hay pestaña de Autotask viva (el content script re-insiste
// con sonido cuando la hay), reabrimos por pop-up del SO las notificaciones sin leer.
async function backgroundRenag() {
  const beat = await getHeartbeat();
  if (beat && Date.now() - beat < 45000) return; // hay pestaña activa: que la maneje ella
  const [list, renagMin, prefs] = await Promise.all([getNotifs(), getRenagMinutes(), getTypePrefs()]);
  for (const n of dueForRenag(list, renagMin)) {
    if (isMuted(prefs, n.type)) continue;
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title: `🔔 ${n.title}`,
      message: n.body,
      priority: 2,
    });
    await bumpNag(n.id);
  }
}

async function getConfig(): Promise<{ baseUrl: string; apiKey: string }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['netsus_base_url', 'netsus_api_key'], ({ netsus_base_url, netsus_api_key }: { netsus_base_url?: string; netsus_api_key?: string }) => {
      resolve({
        baseUrl: netsus_base_url || DEFAULT_BASE_URL,
        apiKey: netsus_api_key || DEFAULT_API_KEY,
      });
    });
  });
}

async function fetchWithRetry(url: string, options: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt))); // 500ms, 1s, 2s
      }
    }
  }
  throw lastError;
}

async function updateBadge() {
  const { baseUrl: BASE_URL, apiKey: API_KEY } = await getConfig();
  try {
    const res = await fetchWithRetry(`${BASE_URL}/api/presence/status`, {
      headers: { 'x-api-key': API_KEY },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const tickets: any[] = await res.json().catch(() => []);
    const collisions = Array.isArray(tickets)
      ? tickets.filter((t) => t.users.length > 1).length
      : 0;
    apiOnline = true;
    if (collisions > 0) {
      chrome.action.setBadgeText({ text: String(collisions) });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    if (apiOnline) {
      apiOnline = false;
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    }
  }
}

export default defineBackground(() => {
  // Sin popup: el ícono de la extensión abre el side panel directamente.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  setInterval(updateBadge, 20000);
  updateBadge();

  // Feed de notificaciones n1–n5 (poll server-side lock-guarded del otro lado).
  setInterval(pollNotificationFeed, 30000);
  pollNotificationFeed();

  // Re-nag de respaldo por si el técnico no tiene ninguna pestaña de Autotask abierta.
  setInterval(backgroundRenag, 30000);

  browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message?.type !== 'NETSUS_API') return false;

    // Presence heartbeats don't need retry (next poll covers it); only non-GET mutations retry
    const shouldRetry = message.method !== 'GET' && !message.path?.includes('/api/presence/') || message.method === 'DELETE';
    const maxAttempts = shouldRetry ? 3 : 1;

    getConfig().then(({ baseUrl: BASE_URL, apiKey: API_KEY }) =>
      fetchWithRetry(`${BASE_URL}${message.path}`, {
        method: message.method,
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: message.body ? JSON.stringify(message.body) : null,
      }, maxAttempts)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        sendResponse({ sent: true, status: r.status, data });
        if (message.path?.startsWith('/api/presence/')) {
          setTimeout(updateBadge, 800);
        }
      })
      .catch((err) => {
        sendResponse({ sent: false, error: String(err) });
      })
    );

    return true;
  });
});
