const BASE_URL = 'https://netsus-two.vercel.app';
const API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm';

let apiOnline = true;

async function updateBadge() {
  try {
    const res = await fetch(`${BASE_URL}/api/presence/status`, {
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
      // Transition to offline
      apiOnline = false;
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    }
  }
}

export default defineBackground(() => {
  setInterval(updateBadge, 20000);
  updateBadge();

  browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message?.type === 'NETSUS_STATUS') {
      sendResponse({ online: apiOnline });
      return false;
    }

    if (message?.type !== 'NETSUS_API') return false;

    fetch(`${BASE_URL}${message.path}`, {
      method: message.method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: message.body ? JSON.stringify(message.body) : null,
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        sendResponse({ sent: true, status: r.status, data });
        if (message.path?.startsWith('/api/presence/')) {
          setTimeout(updateBadge, 800);
        }
      })
      .catch((err) => {
        sendResponse({ sent: false, error: String(err) });
      });

    return true;
  });
});
