import { mountNotificationCenter } from '@/lib/notification-center';
import {
  add as addNotif,
  getAll as getNotifs,
  dueForRenag,
  getRenagMinutes,
  bumpNag,
  type Severity,
} from '@/lib/notifications';
import { getTypePrefs, isMuted, subscribePrefs, type TypePrefs } from '@/lib/prefs';

export default defineContentScript({
  matches: ['https://*.autotask.net/*'],
  runAt: 'document_idle',
  main() {
    let currentTicketId: string | null = null;
    let pollInterval: number | undefined;
    let pauseTimeout: number | undefined;
    let currentUser: string | null = null;
    let wasLocked = false;
    let soundEnabled = true;
    let bannerState: 'none' | 'full' | 'pill' = 'none';
    let lastOthers: OtherUser[] = [];
    let minimizeTimerId: number | undefined;
    let pingCooldown = false;
    let autoPingTimer: number | undefined;
    let autoPingFired = false;
    const AUTO_PING_MINUTES = 5;

    const AVATAR_COLORS = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899'];
    let minimizePref = false; // loaded from storage
    let renagTimer: number | undefined;
    let typePrefs: TypePrefs = {};

    interface OtherUser { name: string; minutes: number; }

    function getUserFromDOM(): string | null {
      const selectors = [
        'span.select-none.truncate',
        '[data-testid="user-display-name"]',
        '.user-profile-name',
        'nav span[title]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        const text = el?.textContent?.trim() || el?.getAttribute('title')?.trim();
        if (text && text.length > 2) return text;
      }
      return null;
    }

    let userRetryCount = 0;

    function loadUserAndInit() {
      chrome.storage.local.get(['netsus_user', 'netsus_sound', 'netsus_minimize_pref'], ({ netsus_user, netsus_sound, netsus_minimize_pref }) => {
        soundEnabled = netsus_sound !== 'off';
        minimizePref = netsus_minimize_pref === 'true';
        if (netsus_user) {
          currentUser = netsus_user;
          init();
          return;
        }
        const fromDOM = getUserFromDOM();
        if (fromDOM) {
          currentUser = fromDOM;
          chrome.storage.local.set({ netsus_user: fromDOM, netsus_user_auto: true });
          init();
        } else if (userRetryCount < 10) {
          userRetryCount++;
          setTimeout(loadUserAndInit, 1500);
        } else {
          init();
        }
      });
    }

    function extractTicketId(): string | null {
      const url = window.location.href;
      if (!url.includes('TicketEdit') && !url.includes('TicketDetail')) return null;
      const match = url.match(/[?&]ticketId=(\d+)/i);
      return match ? match[1] : null;
    }

    function extractTicketNumber(): string | null {
      const match = document.title.match(/T\d{8}\.\d{4}/);
      return match ? match[0] : null;
    }

    function formatNames(users: OtherUser[]): string {
      const names = users.map(u => u.name);
      if (names.length === 1) return names[0];
      return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
    }

    function formatTime(minutes: number): string {
      if (minutes < 1) return 'acaba de entrar';
      if (minutes === 1) return '1 min';
      return `${minutes} min`;
    }

    function avatarHtml(name: string, idx: number): string {
      const inits = name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
      const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
      const offset = idx * -8;
      return `<div style="
        width:34px;height:34px;border-radius:50%;
        background:${color};border:2px solid #991b1b;
        display:inline-flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:800;flex-shrink:0;
        position:relative;margin-left:${idx > 0 ? offset : 0}px;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
      ">${inits}</div>`;
    }

    function progressBar(minutes: number, maxMin = 60): string {
      const pct = Math.min(Math.round((minutes / maxMin) * 100), 100);
      return `<div style="
        width:56px;height:3px;background:rgba(255,255,255,0.2);
        border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:6px;
      "><div style="width:${pct}%;height:100%;background:rgba(255,255,255,0.8);border-radius:2px;"></div></div>`;
    }

    function injectBannerStyles() {
      if (document.getElementById('netsus-styles')) return;
      const s = document.createElement('style');
      s.id = 'netsus-styles';
      s.textContent = `
        @keyframes netsus-slide-in {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes netsus-pop-in {
          from { transform: scale(0.7) translateY(20px); opacity: 0; }
          to   { transform: scale(1)   translateY(0);    opacity: 1; }
        }
        #netsus-presence-banner .nb-btn {
          border: 1px solid rgba(255,255,255,0.35); color: white;
          border-radius: 18px; padding: 5px 14px;
          font-size: 12px; font-weight: 600; cursor: pointer;
          white-space: nowrap; background: rgba(255,255,255,0.15);
          transition: background 0.15s; font-family: 'Segoe UI', sans-serif;
        }
        #netsus-presence-banner .nb-btn:hover { background: rgba(255,255,255,0.28); }
        #netsus-presence-banner .nb-btn.ghost { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.2); }
        #netsus-presence-banner .nb-btn.icon { background: transparent; border-color: rgba(255,255,255,0.15); padding: 5px 10px; }
      `;
      document.head.appendChild(s);
    }

    function playSound(type: 'alert' | 'free' | 'ping' | 'new_entry') {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      if (type === 'alert') {
        [0, 0.3].forEach((offset) => {
          const osc = ctx.createOscillator();
          osc.connect(gain);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.25);
        });
      } else if (type === 'free') {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'ping') {
        // Notification-style: three short rising tones
        [0, 0.12, 0.24].forEach((offset, i) => {
          const osc = ctx.createOscillator();
          osc.connect(gain);
          osc.frequency.value = 600 + i * 150;
          gain.gain.setValueAtTime(0.2, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.1);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.1);
        });
      } else if (type === 'new_entry') {
        // Softer single pulse for new entry while in pill mode
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
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

    const SEVERITY_SOUND: Record<Severity, 'alert' | 'free' | 'ping' | 'new_entry'> = {
      critical: 'alert',
      warning: 'ping',
      info: 'new_entry',
      success: 'free',
    };

    function playSoundForSeverity(sev: Severity) {
      if (soundEnabled) playSound(SEVERITY_SOUND[sev]);
    }

    // Re-nag: si una notificación con re-insistencia sigue sin leerse tras X min,
    // vuelve a avisar (sonido + pop-up del sistema). Config: netsus_renag_min.
    function startRenagLoop() {
      clearInterval(renagTimer);
      renagTimer = window.setInterval(async () => {
        const [list, renagMin] = await Promise.all([getNotifs(), getRenagMinutes()]);
        const due = dueForRenag(list, renagMin);
        for (const n of due) {
          if (isMuted(typePrefs, n.type)) continue; // tipo silenciado: no re-insiste
          playSoundForSeverity(n.severity);
          sendChromeNotification(`🔔 ${n.title}`, n.body);
          await bumpNag(n.id);
        }
      }, 30000);
    }

    function lockUI() {
      if (document.getElementById('netsus-lock-style')) return;
      const style = document.createElement('style');
      style.id = 'netsus-lock-style';
      style.textContent = `
        body.netsus-locked button,
        body.netsus-locked textarea,
        body.netsus-locked input:not([type="search"]):not([type="text"][readonly]) {
          pointer-events: none !important; opacity: 0.45 !important; cursor: not-allowed !important;
        }
        body.netsus-locked #netsus-presence-banner {
          pointer-events: auto !important; opacity: 1 !important;
        }
      `;
      document.head.appendChild(style);
      document.body.classList.add('netsus-locked');
    }

    function unlockUI() {
      document.body.classList.remove('netsus-locked');
      document.getElementById('netsus-lock-style')?.remove();
    }

    function renderFullBanner(others: OtherUser[]) {
      injectBannerStyles();
      const sorted = [...others].sort((a, b) => b.minutes - a.minutes);
      const first = sorted[0];

      const avatars = sorted.map((u, i) => avatarHtml(u.name, i)).join('');

      const whoLine = sorted.length === 1
        ? `<strong>${first.name}</strong> llegó primero · ${formatTime(first.minutes)}${progressBar(first.minutes)}`
        : sorted.map((u, i) => `<strong>${u.name}</strong>${i === 0 ? ' · primero' : ''} · ${formatTime(u.minutes)}${progressBar(u.minutes)}`).join('<span style="opacity:0.35;margin:0 6px">|</span>');

      const ticketLabel = extractTicketNumber() ?? '';

      const existing = document.getElementById('netsus-presence-banner');
      if (existing) existing.remove();

      const banner = document.createElement('div');
      banner.id = 'netsus-presence-banner';
      banner.innerHTML = `
        <div id="netsus-banner-inner" style="
          position:fixed;top:0;left:0;right:0;z-index:999999;
          background:linear-gradient(90deg,#991b1b 0%,#dc2626 100%);
          color:white;font-family:'Segoe UI',sans-serif;
          box-shadow:0 4px 20px rgba(0,0,0,0.5);
          display:flex;align-items:center;padding:10px 20px;gap:12px;
          animation:netsus-slide-in 0.22s ease-out;
        ">
          <div style="display:flex;align-items:center;flex-shrink:0">${avatars}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${whoLine}
            </div>
            <div style="font-size:11px;opacity:0.65;margin-top:2px">
              ${ticketLabel ? ticketLabel + ' · ' : ''}Espera a que ${sorted.length === 1 ? 'finalice' : 'finalicen'}
            </div>
          </div>
          <button class="nb-btn" id="netsus-ping-btn">📣 Avisar</button>
          <div style="display:flex;gap:3px;align-items:center">
            <span style="font-size:11px;opacity:0.5;margin-right:2px">⏸</span>
            <button class="nb-btn ghost" data-pause="5">5'</button>
            <button class="nb-btn ghost" data-pause="15">15'</button>
            <button class="nb-btn ghost" data-pause="30">30'</button>
          </div>
          <button class="nb-btn" id="netsus-finish-btn">✓ Terminé</button>
          <button class="nb-btn icon" id="netsus-minimize-btn" title="Minimizar">—</button>
        </div>
      `;
      document.body.prepend(banner);

      document.getElementById('netsus-finish-btn')?.addEventListener('click', () => {
        if (currentTicketId && currentUser) {
          leavePresence(currentTicketId, currentUser);
          clearInterval(pollInterval);
          removeBanner();
          wasLocked = false;
          currentTicketId = null;
        }
      });

      banner.querySelectorAll<HTMLButtonElement>('[data-pause]').forEach(btn => {
        btn.addEventListener('click', () => pausePresence(parseInt(btn.dataset.pause!)));
      });

      document.getElementById('netsus-minimize-btn')?.addEventListener('click', () => {
        clearTimeout(minimizeTimerId);
        minimizePref = true;
        chrome.storage.local.set({ netsus_minimize_pref: 'true' });
        minimizeToPill();
      });

      document.getElementById('netsus-ping-btn')?.addEventListener('click', () => {
        if (pingCooldown || !currentTicketId || !currentUser) return;
        pingCooldown = true;
        const btn = document.getElementById('netsus-ping-btn') as HTMLButtonElement;
        if (btn) { btn.textContent = '✓ Enviado'; btn.style.opacity = '0.5'; }
        apiCall('POST', `/api/presence/${currentTicketId}`, {
          user: currentUser,
          ping: sorted.map(u => u.name),
        }, () => {});
        setTimeout(() => {
          pingCooldown = false;
          if (btn) { btn.textContent = '📣 Avisar'; btn.style.opacity = '1'; }
        }, 15000);
      });

      lockUI();
      // If tech prefers minimized, go straight to pill after first render
      if (minimizePref) {
        minimizeTimerId = window.setTimeout(() => minimizeToPill(), 800);
      } else {
        clearTimeout(minimizeTimerId);
        minimizeTimerId = window.setTimeout(() => minimizeToPill(), 10000);
      }
    }

    function minimizeToPill() {
      const banner = document.getElementById('netsus-presence-banner');
      if (!banner) return;
      banner.remove();
      bannerState = 'pill';

      injectBannerStyles();
      const sorted = [...lastOthers].sort((a, b) => b.minutes - a.minutes);
      const pill = document.createElement('div');
      pill.id = 'netsus-presence-banner';
      pill.innerHTML = `
        <div id="netsus-pill-inner" style="
          position:fixed;bottom:24px;right:24px;z-index:999999;
          background:linear-gradient(135deg,#991b1b,#dc2626);
          color:white;font-family:'Segoe UI',sans-serif;
          border-radius:28px;padding:10px 18px;
          box-shadow:0 6px 24px rgba(0,0,0,0.45);
          display:flex;align-items:center;gap:8px;
          cursor:grab;animation:netsus-pop-in 0.2s ease-out;
          border:1px solid rgba(255,255,255,0.15);
          user-select:none;
        ">
          <span style="font-size:14px">🚫</span>
          <span id="netsus-pill-text" style="font-size:12px;font-weight:700">
            ${sorted.map(u => u.name.split(' ')[0]).join(', ')}
            · ${formatTime(sorted[0]?.minutes ?? 0)}
          </span>
          <span style="font-size:10px;opacity:0.55;margin-left:2px">ver</span>
        </div>
      `;

      // Drag logic
      const inner = pill.querySelector<HTMLElement>('#netsus-pill-inner')!;
      let dragging = false;
      let dragStartX = 0, dragStartY = 0, origRight = 24, origBottom = 24;
      let moved = false;

      inner.addEventListener('mousedown', (e) => {
        dragging = true;
        moved = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = inner.getBoundingClientRect();
        origRight = window.innerWidth - rect.right;
        origBottom = window.innerHeight - rect.bottom;
        inner.style.cursor = 'grabbing';
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        const newRight = Math.max(8, origRight - dx);
        const newBottom = Math.max(8, origBottom - dy);
        inner.style.right = newRight + 'px';
        inner.style.bottom = newBottom + 'px';
        inner.style.left = 'auto';
        inner.style.top = 'auto';
      });

      document.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; inner.style.cursor = 'grab'; }
      });

      pill.addEventListener('click', () => {
        if (moved) return; // suppress click after drag
        clearTimeout(minimizeTimerId);
        bannerState = 'full';
        renderFullBanner(lastOthers);
      });
      document.body.appendChild(pill);
    }

    function updatePill(others: OtherUser[], hasNewEntry: boolean) {
      const sorted = [...others].sort((a, b) => b.minutes - a.minutes);
      const el = document.getElementById('netsus-pill-text');
      if (el) el.textContent = `${sorted.map(u => u.name.split(' ')[0]).join(', ')} · ${formatTime(sorted[0]?.minutes ?? 0)}`;
      if (hasNewEntry) {
        const pill = document.getElementById('netsus-pill-inner');
        if (pill) {
          pill.style.animation = 'none';
          pill.style.boxShadow = '0 6px 24px rgba(220,38,38,0.7), 0 0 0 4px rgba(220,38,38,0.25)';
          setTimeout(() => { if (pill) pill.style.boxShadow = ''; }, 1500);
        }
        if (soundEnabled) playSound('new_entry');
        sendChromeNotification('Nuevo técnico en el ticket', `${sorted[0]?.name} entró mientras tenías el banner minimizado`);
      }
    }

    function showOfflineBanner() {
      if (document.getElementById('netsus-offline-banner')) return;
      injectBannerStyles();
      const el = document.createElement('div');
      el.id = 'netsus-offline-banner';
      el.innerHTML = `<div style="
        position:fixed;bottom:0;left:0;right:0;z-index:999996;
        background:linear-gradient(90deg,#374151,#4b5563);
        color:white;font-family:'Segoe UI',sans-serif;
        box-shadow:0 -2px 12px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;gap:10px;padding:7px 20px;
        animation:netsus-slide-in 0.22s ease-out;
      ">
        <span style="font-size:13px">⚠️</span>
        <span style="font-size:11px;font-weight:600">Sin conexión con el servidor de detección — las colisiones no se están registrando</span>
      </div>`;
      document.body.appendChild(el);
    }

    function removeOfflineBanner() {
      document.getElementById('netsus-offline-banner')?.remove();
    }

    function startAutoPing(others: OtherUser[]) {
      clearTimeout(autoPingTimer);
      if (autoPingFired || !others.length) return;
      autoPingTimer = window.setTimeout(() => {
        if (!currentTicketId || !currentUser || !others.length) return;
        autoPingFired = true;
        apiCall('POST', `/api/presence/${currentTicketId}`, {
          user: currentUser,
          ping: others.map(o => o.name),
        }, () => {});
        sendChromeNotification('📣 Auto-aviso enviado', `Se notificó a ${formatNames(others)} después de ${AUTO_PING_MINUTES} min de espera`);
      }, AUTO_PING_MINUTES * 60 * 1000);
    }

    function showBanner(others: OtherUser[]) {
      const prevNames = new Set(lastOthers.map(o => o.name));
      const hasNewEntry = others.some(o => !prevNames.has(o.name));
      lastOthers = others;
      if (bannerState === 'pill') { updatePill(others, hasNewEntry); return; }
      if (bannerState === 'full' && document.getElementById('netsus-presence-banner')) {
        // Update time inline without re-animating
        const sorted = [...others].sort((a, b) => b.minutes - a.minutes);
        const first = sorted[0];
        const inner = document.querySelector<HTMLElement>('#netsus-banner-inner > div > div');
        if (inner) {
          const whoLine = sorted.length === 1
            ? `<strong>${first.name}</strong> llegó primero · ${formatTime(first.minutes)}${progressBar(first.minutes)}`
            : sorted.map((u, i) => `<strong>${u.name}</strong>${i === 0 ? ' · primero' : ''} · ${formatTime(u.minutes)}${progressBar(u.minutes)}`).join('<span style="opacity:0.35;margin:0 6px">|</span>');
          inner.innerHTML = whoLine;
        }
        return;
      }
      bannerState = 'full';
      renderFullBanner(others);
      if (!wasLocked) {
        const colMuted = isMuted(typePrefs, 'collision');
        if (soundEnabled && !colMuted) playSound('alert');
        const verb = others.length === 1 ? 'está' : 'están';
        if (!colMuted) sendChromeNotification('Ticket ocupado', `${formatNames(others)} ${verb} trabajando en este ticket`);
        const ticketLabel = extractTicketNumber();
        addNotif({
          type: 'collision',
          title: 'Colisión detectada',
          body: `${formatNames(others)} ${verb} trabajando en ${ticketLabel ?? 'este ticket'}`,
          ticketId: currentTicketId ?? undefined,
          ticketNumber: ticketLabel ?? undefined,
          ticketUrl: window.location.href,
          silent: true, // el banner ya avisó; solo registrar en el buzón
        });
      }
      if (!wasLocked) startAutoPing(others); // start timer only on first collision detection
      wasLocked = true;
    }

    function showLiberationBanner() {
      clearTimeout(minimizeTimerId);
      clearTimeout(autoPingTimer);
      autoPingFired = false;
      bannerState = 'none';
      const existing = document.getElementById('netsus-presence-banner');
      if (existing) existing.remove();
      unlockUI();

      injectBannerStyles();
      const banner = document.createElement('div');
      banner.id = 'netsus-presence-banner';
      banner.innerHTML = `
        <div style="
          position:fixed;top:0;left:0;right:0;z-index:999999;
          background:linear-gradient(90deg,#14532d,#16a34a);
          color:white;font-family:'Segoe UI',sans-serif;
          box-shadow:0 4px 20px rgba(0,0,0,0.4);
          display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 20px;
          animation:netsus-slide-in 0.22s ease-out;
        ">
          <span style="font-size:20px">✅</span>
          <span style="font-size:14px;font-weight:700">El ticket está libre. Ya puedes trabajar en él.</span>
        </div>
      `;
      document.body.prepend(banner);
      const libMuted = isMuted(typePrefs, 'liberation');
      if (soundEnabled && !libMuted) playSound('free');
      if (!libMuted) sendChromeNotification('Ticket liberado', 'Ya puedes trabajar en este ticket');
      const libLabel = extractTicketNumber();
      addNotif({
        type: 'liberation',
        title: 'Ticket liberado',
        body: `Ya puedes trabajar en ${libLabel ?? 'este ticket'}`,
        ticketId: currentTicketId ?? undefined,
        ticketNumber: libLabel ?? undefined,
        ticketUrl: window.location.href,
        silent: true,
      });
      const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') { removeBanner(); document.removeEventListener('keydown', escHandler); } };
      document.addEventListener('keydown', escHandler);
      setTimeout(() => { removeBanner(); document.removeEventListener('keydown', escHandler); }, 5000);
    }

    function removeBanner() {
      clearTimeout(minimizeTimerId);
      bannerState = 'none';
      document.getElementById('netsus-presence-banner')?.remove();
      unlockUI();
    }

    function pausePresence(minutes: number) {
      if (!currentTicketId || !currentUser) return;
      leavePresence(currentTicketId, currentUser);
      clearInterval(pollInterval);
      wasLocked = false;
      clearTimeout(minimizeTimerId);
      bannerState = 'none';
      showPauseBanner(minutes);
      pauseTimeout = window.setTimeout(() => { removeBanner(); init(); }, minutes * 60 * 1000);
    }

    function showPauseBanner(totalMinutes: number) {
      const existing = document.getElementById('netsus-presence-banner');
      if (existing) existing.remove();

      injectBannerStyles();
      const banner = document.createElement('div');
      banner.id = 'netsus-presence-banner';
      let secsLeft = totalMinutes * 60;

      const renderPause = () => {
        const m = Math.floor(secsLeft / 60);
        const s = secsLeft % 60;
        banner.innerHTML = `
          <div style="
            position:fixed;top:0;left:0;right:0;z-index:999999;
            background:linear-gradient(90deg,#1e3a8a,#2563eb);
            color:white;font-family:'Segoe UI',sans-serif;
            box-shadow:0 4px 20px rgba(0,0,0,0.4);
            display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 20px;
            animation:netsus-slide-in 0.22s ease-out;
          ">
            <span style="font-size:18px">⏸</span>
            <span style="font-size:13px;font-weight:700">
              Presencia pausada — volverás en <strong>${m}:${s.toString().padStart(2,'0')}</strong>
            </span>
            <button id="netsus-cancel-pause" class="nb-btn">Cancelar pausa</button>
          </div>
        `;
        document.getElementById('netsus-cancel-pause')?.addEventListener('click', () => {
          clearTimeout(pauseTimeout);
          clearInterval(tick);
          removeBanner();
          init();
        });
      };

      renderPause();
      document.body.prepend(banner);
      const tick = window.setInterval(() => {
        secsLeft--;
        if (secsLeft <= 0) { clearInterval(tick); return; }
        renderPause();
      }, 1000);
    }

    let consecutiveFailures = 0;

    function apiCall(
      method: string,
      path: string,
      body: Record<string, unknown> | null,
      callback?: (status: number, data: any) => void
    ) {
      browser.runtime
        .sendMessage({ type: 'NETSUS_API', method, path, body })
        .then((res: any) => {
          if (!res?.sent) {
            consecutiveFailures++;
            if (consecutiveFailures >= 3) showOfflineBanner();
            return;
          }
          consecutiveFailures = 0;
          removeOfflineBanner();
          callback?.(res.status, res.data);
        })
        .catch(() => {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) showOfflineBanner();
        });
    }

    let historyWarningShown = false;
    let historyWarningTimer: number | undefined;

    function showHistoryWarning(count: number) {
      if (historyWarningShown) return;
      if (document.getElementById('netsus-history-banner')) return;
      historyWarningShown = true;

      injectBannerStyles();
      const el = document.createElement('div');
      el.id = 'netsus-history-banner';
      el.innerHTML = `<div style="
        position:fixed;bottom:0;left:0;right:0;z-index:999997;
        background:linear-gradient(90deg,#78350f,#d97706);
        color:white;font-family:'Segoe UI',sans-serif;
        box-shadow:0 -2px 12px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 20px;
        animation:netsus-slide-in 0.22s ease-out;
      ">
        <span style="font-size:15px">🔥</span>
        <span style="font-size:12px;font-weight:600">
          Este ticket tuvo <strong>${count} colisión${count !== 1 ? 'es' : ''}</strong> en el pasado — avisa cuando termines
        </span>
        <button id="netsus-history-close" style="
          background:rgba(255,255,255,0.2);border:none;color:white;border-radius:12px;
          padding:2px 10px;font-size:11px;cursor:pointer;margin-left:8px;
        ">✕</button>
      </div>`;
      document.body.appendChild(el);
      document.getElementById('netsus-history-close')?.addEventListener('click', () => {
        clearTimeout(historyWarningTimer);
        el.remove();
      });
      historyWarningTimer = window.setTimeout(() => el.remove(), 10000);
    }

    function showAssignmentWarning(assignedTo: string) {
      if (document.getElementById('netsus-assigned-banner')) return;
      const el = document.createElement('div');
      el.id = 'netsus-assigned-banner';
      el.innerHTML = `<div style="
        position:fixed;bottom:0;left:0;right:0;z-index:999998;
        background:linear-gradient(90deg,#78350f,#b45309);
        color:white;font-family:'Segoe UI',sans-serif;
        box-shadow:0 -2px 12px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 20px;
      ">
        <span style="font-size:15px">📋</span>
        <span style="font-size:12px;font-weight:600">Este ticket está asignado a <strong>${assignedTo}</strong></span>
        <button id="netsus-assign-close" style="
          background:rgba(255,255,255,0.2);border:none;color:white;border-radius:12px;
          padding:2px 10px;font-size:11px;cursor:pointer;margin-left:8px;
        ">✕</button>
      </div>`;
      document.body.appendChild(el);
      document.getElementById('netsus-assign-close')?.addEventListener('click', () => el.remove());
    }

    function registerPresence(ticketId: string, user: string, pingTargets?: string[]) {
      const body: Record<string, unknown> = {
        user,
        ticketNumber: extractTicketNumber(),
        ticketUrl: window.location.href,
      };
      if (pingTargets?.length) body.ping = pingTargets;

      apiCall('POST', `/api/presence/${ticketId}`, body, (_status, data) => {
        const others: OtherUser[] = Array.isArray(data?.others)
          ? data.others
              .map((o: any) => typeof o === 'string' ? { name: o, minutes: 0 } : o)
              .filter((o: OtherUser) => o.name.trim().toLowerCase() !== user.trim().toLowerCase())
          : [];

        if (others.length > 0) {
          showBanner(others);
        } else {
          if (wasLocked) showLiberationBanner();
          else removeBanner();
          wasLocked = false;
          if (data?.pastCollisions >= 2) showHistoryWarning(data.pastCollisions);
        }

        if (data?.assignedTo && data.assignedTo.trim().toLowerCase() !== user.trim().toLowerCase()) {
          showAssignmentWarning(data.assignedTo);
        }

        if (data?.pingedBy) {
          const pingMuted = isMuted(typePrefs, 'ping');
          if (soundEnabled && !pingMuted) playSound('ping');
          const pingLabel = extractTicketNumber();
          if (!pingMuted) sendChromeNotification(
            '📣 ' + data.pingedBy + ' te está esperando',
            `Quiere saber si terminaste en ${pingLabel ?? 'este ticket'}`
          );
          addNotif({
            type: 'ping',
            title: `${data.pingedBy} te está esperando`,
            body: `Quiere saber si terminaste en ${pingLabel ?? 'este ticket'}`,
            ticketId: ticketId,
            ticketNumber: pingLabel ?? undefined,
            ticketUrl: window.location.href,
            dedupeKey: `ping:${ticketId}:${data.pingedBy}`,
            silent: true,
          });
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
        clearTimeout(autoPingTimer);
        autoPingFired = false;
        removeBanner();
        wasLocked = false;
        historyWarningShown = false;
        clearTimeout(historyWarningTimer);
        document.getElementById('netsus-history-banner')?.remove();
      }

      currentTicketId = ticketId;
      if (!ticketId) return;

      registerPresence(ticketId, currentUser);
      pollInterval = window.setInterval(() => {
        registerPresence(ticketId, currentUser as string);
      }, 5000);
    }

    // Alt+C: toggle minimize/expand banner
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== 'c') return;
      if (!currentTicketId) return;
      if (bannerState === 'full' && document.getElementById('netsus-presence-banner')) {
        clearTimeout(minimizeTimerId);
        minimizePref = true;
        chrome.storage.local.set({ netsus_minimize_pref: 'true' });
        minimizeToPill();
      } else if (bannerState === 'pill') {
        clearTimeout(minimizeTimerId);
        bannerState = 'full';
        renderFullBanner(lastOthers);
      }
    });

    window.addEventListener('beforeunload', () => {
      if (currentTicketId && currentUser) leavePresence(currentTicketId, currentUser);
    });

    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(loadUserAndInit, 500);
      }
    }).observe(document.body, { childList: true, subtree: true });

    getTypePrefs().then((p) => { typePrefs = p; });
    subscribePrefs(({ typePrefs: tp }) => { if (tp) typePrefs = tp; });

    // Heartbeat: marca esta pestaña como "viva" para que el background solo haga el
    // re-nag de respaldo (OS) cuando no hay ninguna pestaña de Autotask abierta.
    const beat = () => chrome.storage.local.set({ netsus_cs_heartbeat: Date.now() });
    beat();
    window.setInterval(beat, 15000);

    mountNotificationCenter({ playSound: playSoundForSeverity });
    startRenagLoop();

    setTimeout(loadUserAndInit, 1000);
  },
});
