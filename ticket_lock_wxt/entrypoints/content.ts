export default defineContentScript({
  matches: ['https://ww12.autotask.net/*'],
  runAt: 'document_idle',
  main() {
    let currentTicketId: string | null = null;
    let pollInterval: number | undefined;
    let currentUser: string | null = null;
    let wasLocked = false;

    function getUserFromDOM(): string | null {
      const el = document.querySelector<HTMLElement>('span.select-none.truncate');
      return el?.textContent?.trim() || null;
    }

    function loadUserAndInit() {
      chrome.storage.local.get('netsus_user', ({ netsus_user }) => {
        if (netsus_user) {
          currentUser = netsus_user;
        } else {
          const fromDOM = getUserFromDOM();
          if (fromDOM) {
            currentUser = fromDOM;
            chrome.storage.local.set({ netsus_user: fromDOM });
          }
        }
        init();
      });
    }

    function extractTicketId(): string | null {
      const url = window.location.href;
      if (!url.includes('TicketEdit') && !url.includes('TicketDetail')) return null;
      const match = url.match(/[?&]ticketId=(\d+)/i);
      return match ? match[1] : null;
    }

    function formatNames(names: string[]): string {
      if (names.length === 1) return names[0];
      return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
    }

    function playSound(type: 'alert' | 'free') {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      if (type === 'alert') {
        // Dos pitidos cortos — colisión detectada
        [0, 0.3].forEach((offset) => {
          const osc = ctx.createOscillator();
          osc.connect(gain);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.25);
        });
      } else {
        // Pitido ascendente — ticket liberado
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      }
    }

    function sendChromeNotification(title: string, message: string) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon/128.png'),
        title,
        message,
        priority: 2,
      });
    }

    function lockUI() {
      if (document.getElementById('netsus-lock-style')) return;
      const style = document.createElement('style');
      style.id = 'netsus-lock-style';
      style.textContent = `
        body.netsus-locked button,
        body.netsus-locked textarea,
        body.netsus-locked input:not([type="search"]):not([type="text"][readonly]) {
          pointer-events: none !important;
          opacity: 0.45 !important;
          cursor: not-allowed !important;
        }
        body.netsus-locked #netsus-presence-banner {
          pointer-events: auto !important;
          opacity: 1 !important;
        }
      `;
      document.head.appendChild(style);
      document.body.classList.add('netsus-locked');
    }

    function unlockUI() {
      document.body.classList.remove('netsus-locked');
      document.getElementById('netsus-lock-style')?.remove();
    }

    function showBanner(others: string[]) {
      removeBanner();
      const banner = document.createElement('div');
      banner.id = 'netsus-presence-banner';
      banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
        background: #e67e22; color: white; text-align: center;
        padding: 10px 16px; font-size: 15px; font-weight: bold;
        font-family: sans-serif; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        cursor: default;
      `;
      const verb = others.length === 1 ? 'está' : 'están';
      const fin = others.length === 1 ? 'finalice' : 'finalicen';
      banner.textContent = `⚠️ ${formatNames(others)} ${verb} trabajando en este ticket. Cuando ${fin}, prosigue tú.`;
      document.body.prepend(banner);
      lockUI();

      if (!wasLocked) {
        playSound('alert');
        sendChromeNotification(
          'Ticket ocupado',
          `${formatNames(others)} ${verb} trabajando en este ticket`
        );
      }
      wasLocked = true;
    }

    function showLiberationBanner() {
      removeBanner();
      const banner = document.createElement('div');
      banner.id = 'netsus-presence-banner';
      banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
        background: #27ae60; color: white; text-align: center;
        padding: 10px 16px; font-size: 15px; font-weight: bold;
        font-family: sans-serif; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        cursor: default;
      `;
      banner.textContent = '✅ El ticket está libre. Ya puedes trabajar en él.';
      document.body.prepend(banner);
      playSound('free');
      sendChromeNotification('Ticket liberado', 'Ya puedes trabajar en este ticket');
      setTimeout(() => removeBanner(), 5000);
    }

    function removeBanner() {
      document.getElementById('netsus-presence-banner')?.remove();
      unlockUI();
    }

    function apiCall(
      method: string,
      path: string,
      body: Record<string, unknown> | null,
      callback?: (status: number, data: any) => void
    ) {
      browser.runtime
        .sendMessage({ type: 'NETSUS_API', method, path, body })
        .then((res: any) => {
          if (!res?.sent) return;
          callback?.(res.status, res.data);
        })
        .catch(() => {});
    }

    function registerPresence(ticketId: string, user: string) {
      apiCall('POST', `/api/presence/${ticketId}`, { user }, (_status, data) => {
        if (data?.others?.length > 0) {
          showBanner(data.others);
        } else {
          if (wasLocked) showLiberationBanner();
          else removeBanner();
          wasLocked = false;
        }
      });
    }

    function leavePresence(ticketId: string, user: string) {
      apiCall('DELETE', `/api/presence/${ticketId}`, { user });
    }

    function init() {
      if (!currentUser) return;

      const ticketId = extractTicketId();
      if (ticketId === currentTicketId) return;

      if (currentTicketId) {
        leavePresence(currentTicketId, currentUser);
        clearInterval(pollInterval);
        removeBanner();
        wasLocked = false;
      }

      currentTicketId = ticketId;
      if (!ticketId) return;

      registerPresence(ticketId, currentUser);

      pollInterval = window.setInterval(() => {
        registerPresence(ticketId, currentUser as string);
      }, 10000);
    }

    window.addEventListener('beforeunload', () => {
      if (currentTicketId && currentUser) {
        leavePresence(currentTicketId, currentUser);
      }
    });

    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(loadUserAndInit, 500);
      }
    }).observe(document.body, { childList: true, subtree: true });

    setTimeout(loadUserAndInit, 1000);
  },
});
