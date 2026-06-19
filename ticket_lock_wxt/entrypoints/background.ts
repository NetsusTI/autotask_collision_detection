// ← Cambiar si el dominio de Vercel es diferente a "netsus"
const BASE_URL = 'https://netsus-two.vercel.app';
const API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm'; // debe coincidir con TICKET_LOCK_API_KEY en Vercel

interface ApiRequest {
  type: 'NETSUS_API';
  method: string;
  path: string;
  body?: Record<string, unknown> | null;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: ApiRequest, _sender, sendResponse) => {
    if (message?.type !== 'NETSUS_API') return;

    fetch(`${BASE_URL}${message.path}`, {
      method: message.method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: message.body ? JSON.stringify(message.body) : null,
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        sendResponse({ sent: true, status: r.status, data });
      })
      .catch((err) => {
        console.error('[Netsus] Error de red:', err);
        sendResponse({ sent: false, error: String(err) });
      });

    return true;
  });
});
