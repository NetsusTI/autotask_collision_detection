import { mountSidebar, type SidebarHandle, type OtherUser } from '@/lib/sidebar';
import {
  add as addNotif,
  getAll as getNotifs,
  dueForRenag,
  getRenagMinutes,
  bumpNag,
  type Severity,
} from '@/lib/notifications';
import { getTypePrefs, isMuted, subscribePrefs, type TypePrefs } from '@/lib/prefs';
import { icon } from '@/lib/icons';

export default defineContentScript({
  matches: ['https://*.autotask.net/*'],
  runAt: 'document_idle',
  main() {
    let currentTicketId: string | null = null;
    let pollInterval: number | undefined;
    let pauseTimeout: number | undefined;
    let pauseTickInterval: number | undefined;
    let currentUser: string | null = null;
    let wasLocked = false;
    let soundEnabled = true;
    let lastOthers: OtherUser[] = [];
    let pingCooldown = false;
    let autoPingTimer: number | undefined;
    let autoPingFired = false;
    const AUTO_PING_MINUTES = 5;

    let renagTimer: number | undefined;
    let typePrefs: TypePrefs = {};
    let historyWarningShown = false;

    // El panel solo existe mientras hay un ticket abierto — se monta/destruye en init().
    let sidebar: SidebarHandle | null = null;

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
      chrome.storage.local.get(['netsus_user', 'netsus_sound'], ({ netsus_user, netsus_sound }) => {
        soundEnabled = netsus_sound !== 'off';
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
      // Ojo: chequear la RUTA, no la URL completa — páginas como "Búsqueda de
      // tickets" pueden llevar un parámetro returnUrl=...TicketDetail... que
      // haría match por substring en la URL completa aunque no sea un ticket.
      if (!/\/Ticket(Edit|Detail)\.mvc$/i.test(window.location.pathname)) return null;
      const url = window.location.href;
      const direct = url.match(/[?&]ticketId=(\d+)/i);
      if (direct) return direct[1];
      // Vista "workspace" multi-ticket (paginador "N de M"): la URL usa ids[0]=/ids%5B0%5D=
      // en vez de ticketId=. El primer id de la lista es el ticket actualmente mostrado
      // (confirmado: la lista se reordena al pasar de ticket en ticket, no queda fija).
      const workspace = url.match(/[?&]ids(?:\[0\]|%5[bB]0%5[dD])=(\d+)/i);
      return workspace ? workspace[1] : null;
    }

    function extractTicketNumber(): string | null {
      const match = document.title.match(/T\d{8}\.\d{4}/);
      return match ? match[0] : null;
    }

    function ticketLabel(): string {
      return extractTicketNumber() ?? (currentTicketId ? `#${currentTicketId}` : '');
    }

    function formatNames(users: OtherUser[]): string {
      const names = users.map(u => u.name);
      if (names.length === 1) return names[0];
      return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
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
          if (isMuted(typePrefs, n.type)) continue;
          playSoundForSeverity(n.severity);
          sendChromeNotification(`🔔 ${n.title}`, n.body); // pop-up del SO: sin soporte SVG, mantiene emoji
          await bumpNag(n.id);
        }
      }, 30000);
    }

    // Bloquea la interacción con el ticket durante una colisión — excluye el panel
    // lateral (#nsb-root) para que sus propios botones sigan siendo clicables.
    function lockUI() {
      if (document.getElementById('netsus-lock-style')) return;
      const style = document.createElement('style');
      style.id = 'netsus-lock-style';
      style.textContent = `
        body.netsus-locked button:not(#nsb-root button),
        body.netsus-locked textarea:not(#nsb-root textarea),
        body.netsus-locked input:not(#nsb-root input):not([type="search"]):not([type="text"][readonly]) {
          pointer-events: none !important; opacity: 0.45 !important; cursor: not-allowed !important;
        }
      `;
      document.head.appendChild(style);
      document.body.classList.add('netsus-locked');
    }

    function unlockUI() {
      document.body.classList.remove('netsus-locked');
      document.getElementById('netsus-lock-style')?.remove();
    }

    // Estas funciones solo se invocan mientras hay un ticket abierto (sidebar montado);
    // sidebar! es seguro aquí — si alguna vez fuera null sería un bug real, no un caso normal.
    function wireCollisionButtons(others: OtherUser[]) {
      const root = sidebar!.el;
      root.querySelector('#nsb-finish-btn')?.addEventListener('click', () => {
        if (currentTicketId && currentUser) {
          leavePresence(currentTicketId, currentUser);
          clearInterval(pollInterval);
          clearTimeout(autoPingTimer);
          wasLocked = false;
          unlockUI();
          currentTicketId = null;
          sidebar!.setState({ kind: 'idle' });
        }
      });
      root.querySelectorAll<HTMLButtonElement>('[data-pause]').forEach(btn => {
        btn.addEventListener('click', () => pausePresence(parseInt(btn.dataset.pause!)));
      });
      root.querySelector('#nsb-ping-btn')?.addEventListener('click', () => {
        if (pingCooldown || !currentTicketId || !currentUser) return;
        pingCooldown = true;
        const btn = sidebar!.el.querySelector<HTMLButtonElement>('#nsb-ping-btn');
        if (btn) { btn.innerHTML = `${icon('check', { size: 13 })} Enviado`; btn.style.opacity = '0.6'; }
        apiCall('POST', `/api/presence/${currentTicketId}`, {
          user: currentUser,
          ping: others.map(u => u.name),
        }, () => {});
        setTimeout(() => {
          pingCooldown = false;
          const btn2 = sidebar!.el.querySelector<HTMLButtonElement>('#nsb-ping-btn');
          if (btn2) { btn2.innerHTML = `${icon('megaphone', { size: 13 })} Avisar`; btn2.style.opacity = '1'; }
        }, 15000);
      });
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

    function showCollision(others: OtherUser[]) {
      const prevNames = new Set(lastOthers.map(o => o.name));
      const hasNewEntry = others.some(o => !prevNames.has(o.name));
      lastOthers = others;

      sidebar!.setState({ kind: 'collision', others, ticketLabel: ticketLabel() });
      wireCollisionButtons(others);

      if (!wasLocked) {
        const colMuted = isMuted(typePrefs, 'collision');
        if (soundEnabled && !colMuted) playSound('alert');
        const verb = others.length === 1 ? 'está' : 'están';
        if (!colMuted) sendChromeNotification('Ticket ocupado', `${formatNames(others)} ${verb} trabajando en este ticket`);
        const label = extractTicketNumber();
        addNotif({
          type: 'collision',
          title: 'Colisión detectada',
          body: `${formatNames(others)} ${verb} trabajando en ${label ?? 'este ticket'}`,
          ticketId: currentTicketId ?? undefined,
          ticketNumber: label ?? undefined,
          ticketUrl: window.location.href,
          silent: true, // el panel lateral ya avisó; solo registrar en el buzón
        });
        lockUI();
        startAutoPing(others);
      } else if (hasNewEntry && soundEnabled) {
        playSound('new_entry');
      }
      wasLocked = true;
    }

    function showLiberation() {
      clearTimeout(autoPingTimer);
      autoPingFired = false;
      unlockUI();
      const label = ticketLabel();
      sidebar!.setState({ kind: 'liberated', ticketLabel: label });
      const libMuted = isMuted(typePrefs, 'liberation');
      if (soundEnabled && !libMuted) playSound('free');
      if (!libMuted) sendChromeNotification('Ticket liberado', 'Ya puedes trabajar en este ticket');
      const num = extractTicketNumber();
      addNotif({
        type: 'liberation',
        title: 'Ticket liberado',
        body: `Ya puedes trabajar en ${num ?? 'este ticket'}`,
        ticketId: currentTicketId ?? undefined,
        ticketNumber: num ?? undefined,
        ticketUrl: window.location.href,
        silent: true,
      });
      setTimeout(() => {
        if (currentTicketId) sidebar?.setState({ kind: 'solo', ticketLabel: label });
      }, 4000);
    }

    function resumeAfterPause() {
      clearInterval(pauseTickInterval);
      currentTicketId = null; // fuerza a init() a re-registrar presencia aunque sea el mismo ticket
      init();
    }

    function pausePresence(minutes: number) {
      if (!currentTicketId || !currentUser) return;
      leavePresence(currentTicketId, currentUser);
      clearInterval(pollInterval);
      wasLocked = false;
      unlockUI();

      let secsLeft = minutes * 60;
      const renderPause = () => {
        sidebar!.setState({ kind: 'paused', secsLeft });
        sidebar!.el.querySelector('#nsb-cancel-pause')?.addEventListener('click', () => {
          clearTimeout(pauseTimeout);
          resumeAfterPause();
        });
      };
      renderPause();
      pauseTickInterval = window.setInterval(() => {
        secsLeft--;
        if (secsLeft <= 0) { clearInterval(pauseTickInterval); return; }
        renderPause();
      }, 1000);
      pauseTimeout = window.setTimeout(resumeAfterPause, minutes * 60 * 1000);
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
            if (consecutiveFailures >= 3) sidebar?.setOffline(true);
            return;
          }
          consecutiveFailures = 0;
          sidebar?.setOffline(false);
          callback?.(res.status, res.data);
        })
        .catch(() => {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) sidebar?.setOffline(true);
        });
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
          showCollision(others);
        } else {
          if (wasLocked) showLiberation();
          else sidebar?.setState({ kind: 'solo', ticketLabel: ticketLabel() });
          wasLocked = false;
          if (data?.pastCollisions >= 2) {
            historyWarningShown = true;
            sidebar?.setHistoryWarning(data.pastCollisions);
          }
        }

        const mismatchedAssignee = data?.assignedTo && data.assignedTo.trim().toLowerCase() !== user.trim().toLowerCase();
        sidebar?.setAssignment(mismatchedAssignee ? data.assignedTo : null);

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
        wasLocked = false;
        unlockUI();
        historyWarningShown = false;
      }

      currentTicketId = ticketId;

      // Sin ticket abierto: el panel no debe existir (no se monta en páginas de
      // búsqueda, tableros, calendario, etc. — solo cuando hay un ticket real).
      if (!ticketId) {
        sidebar?.destroy();
        sidebar = null;
        return;
      }

      if (!sidebar) sidebar = mountSidebar();
      sidebar.setHistoryWarning(null);
      sidebar.setAssignment(null);
      sidebar.setState({ kind: 'solo', ticketLabel: ticketLabel() });
      registerPresence(ticketId, currentUser);
      pollInterval = window.setInterval(() => {
        registerPresence(ticketId, currentUser as string);
      }, 5000);
    }

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

    // El panel (sidebar) se monta/destruye desde init() según haya o no un ticket
    // abierto — no debe aparecer en búsquedas, tableros u otras páginas de Autotask.
    startRenagLoop();

    setTimeout(loadUserAndInit, 1000);
  },
});
