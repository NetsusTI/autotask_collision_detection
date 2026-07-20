import {
  add as addNotif,
  getAll as getNotifs,
  dueForRenag,
  getRenagMinutes,
  bumpNag,
  type Severity,
} from '@/lib/notifications';
import { getTypePrefs, isMuted, subscribePrefs, type TypePrefs } from '@/lib/prefs';
import type { OtherUser, TicketState, TicketWarnings, PanelToContentMessage } from '@/lib/messaging';

export default defineContentScript({
  matches: ['https://*.autotask.net/*'],
  runAt: 'document_idle',
  main() {
    let currentTicketId: string | null = null;
    // Última identidad de presencia realmente registrada en el servidor (número de
    // ticket, o el ID crudo como fallback) — se usa para liberar la presencia correcta
    // al salir/cambiar de ticket, en vez de recalcularla (el título de la página puede
    // ya haber cambiado al nuevo ticket en ese momento).
    let lastPresenceId: string | null = null;
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

    // Estado enviado al side panel por mensajes — el panel ya no vive en el DOM
    // de esta página (el margin-push con CSS no dividía el espacio de verdad en
    // apps con contenedor raíz fixed/vw; el Side Panel nativo de Chrome sí lo hace).
    let currentState: TicketState = { kind: 'idle' };
    let currentWarnings: TicketWarnings = { offline: false, historyCount: null, assignedTo: null };

    function pushState() {
      chrome.runtime.sendMessage({ type: 'NSB_STATE', payload: { state: currentState, warnings: currentWarnings } }).catch(() => {});
    }
    function setState(s: TicketState) { currentState = s; pushState(); }
    function setOffline(v: boolean) { currentWarnings = { ...currentWarnings, offline: v }; pushState(); }
    function setHistoryWarning(v: number | null) { currentWarnings = { ...currentWarnings, historyCount: v }; pushState(); }
    function setAssignment(v: string | null) { currentWarnings = { ...currentWarnings, assignedTo: v }; pushState(); }

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

    // Identidad real usada para detectar colisiones: preferimos el número de ticket
    // (leído del título de la página, estable) sobre el ID interno de la URL. El ID de
    // la URL es frágil en vistas "workspace" con varios tickets abiertos a la vez: cada
    // técnico tiene su propia lista de tickets abiertos en su propio orden, así que
    // "ids[0]" puede no coincidir entre dos técnicos aunque estén viendo el mismo ticket
    // — eso hacía que nunca se detectara la colisión entre ellos. El ID crudo de la URL
    // se sigue mandando aparte (autotaskTicketId) porque el servidor sí lo necesita tal
    // cual para consultar el asignado en la API de Autotask.
    function presenceId(): string | null {
      if (currentTicketId === null) return null;
      return extractTicketNumber() ?? currentTicketId;
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

    // Bloquea la interacción con el ticket durante una colisión. El panel ya no
    // vive en el DOM de la página (ahora es el side panel de Chrome), así que no
    // hace falta excluir nada del bloqueo.
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
      `;
      document.head.appendChild(style);
      document.body.classList.add('netsus-locked');
    }

    function unlockUI() {
      document.body.classList.remove('netsus-locked');
      document.getElementById('netsus-lock-style')?.remove();
    }

    function startAutoPing(others: OtherUser[]) {
      clearTimeout(autoPingTimer);
      if (autoPingFired || !others.length) return;
      autoPingTimer = window.setTimeout(() => {
        if (!currentTicketId || !currentUser || !others.length) return;
        autoPingFired = true;
        apiCall('POST', `/api/presence/${presenceId()}`, {
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

      setState({ kind: 'collision', others, ticketLabel: ticketLabel() });

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
      setState({ kind: 'liberated', ticketLabel: label });
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
        if (currentTicketId) setState({ kind: 'solo', ticketLabel: label });
      }, 4000);
    }

    function resumeAfterPause() {
      clearInterval(pauseTickInterval);
      currentTicketId = null; // fuerza a init() a re-registrar presencia aunque sea el mismo ticket
      init();
    }

    function pausePresence(minutes: number) {
      if (!currentTicketId || !currentUser) return;
      if (lastPresenceId) leavePresence(lastPresenceId, currentUser);
      clearInterval(pollInterval);
      wasLocked = false;
      unlockUI();

      let secsLeft = minutes * 60;
      setState({ kind: 'paused', secsLeft });
      pauseTickInterval = window.setInterval(() => {
        secsLeft--;
        if (secsLeft <= 0) { clearInterval(pauseTickInterval); return; }
        setState({ kind: 'paused', secsLeft });
      }, 1000);
      pauseTimeout = window.setTimeout(resumeAfterPause, minutes * 60 * 1000);
    }

    function triggerFinish() {
      if (currentTicketId && currentUser) {
        if (lastPresenceId) leavePresence(lastPresenceId, currentUser);
        clearInterval(pollInterval);
        clearTimeout(autoPingTimer);
        wasLocked = false;
        unlockUI();
        currentTicketId = null;
        lastPresenceId = null;
        setState({ kind: 'idle' });
      }
    }

    function triggerPing() {
      if (pingCooldown || !currentTicketId || !currentUser) return;
      pingCooldown = true;
      apiCall('POST', `/api/presence/${presenceId()}`, {
        user: currentUser,
        ping: lastOthers.map(u => u.name),
      }, () => {});
      setTimeout(() => { pingCooldown = false; }, 15000);
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
            if (consecutiveFailures >= 3) setOffline(true);
            return;
          }
          consecutiveFailures = 0;
          setOffline(false);
          callback?.(res.status, res.data);
        })
        .catch(() => {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) setOffline(true);
        });
    }

    function registerPresence(ticketId: string, user: string, pingTargets?: string[]) {
      lastPresenceId = ticketId;
      const body: Record<string, unknown> = {
        user,
        ticketNumber: extractTicketNumber(),
        ticketUrl: window.location.href,
        autotaskTicketId: currentTicketId,
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
          else setState({ kind: 'solo', ticketLabel: ticketLabel() });
          wasLocked = false;
          if (data?.pastCollisions >= 2) setHistoryWarning(data.pastCollisions);
        }

        const mismatchedAssignee = data?.assignedTo && data.assignedTo.trim().toLowerCase() !== user.trim().toLowerCase();
        setAssignment(mismatchedAssignee ? data.assignedTo : null);

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
        if (lastPresenceId) leavePresence(lastPresenceId, currentUser);
        clearInterval(pollInterval);
        clearTimeout(autoPingTimer);
        autoPingFired = false;
        wasLocked = false;
        unlockUI();
      }

      currentTicketId = ticketId;
      lastPresenceId = null;
      setHistoryWarning(null);
      setAssignment(null);

      if (!ticketId) {
        setState({ kind: 'idle' });
        return;
      }

      setState({ kind: 'solo', ticketLabel: ticketLabel() });
      const pid = presenceId();
      if (pid) registerPresence(pid, currentUser);
      pollInterval = window.setInterval(() => {
        if (!currentUser) return;
        const p = presenceId();
        if (p) registerPresence(p, currentUser);
      }, 5000);
    }

    // El side panel pide el estado actual al abrirse o cambiar de pestaña, y
    // envía acciones (avisar, terminé, pausar, cancelar pausa) que antes eran
    // botones dentro del panel inyectado en la página.
    chrome.runtime.onMessage.addListener((msg: PanelToContentMessage, _sender, sendResponse) => {
      if (msg?.type === 'NSB_REQUEST_STATE') {
        sendResponse({ payload: { state: currentState, warnings: currentWarnings } });
        return false;
      }
      if (msg?.type === 'NSB_ACTION') {
        if (msg.action === 'ping') triggerPing();
        else if (msg.action === 'finish') triggerFinish();
        else if (msg.action === 'pause') pausePresence(msg.minutes);
        else if (msg.action === 'cancelPause') { clearTimeout(pauseTimeout); resumeAfterPause(); }
      }
      return false;
    });

    window.addEventListener('beforeunload', () => {
      if (lastPresenceId && currentUser) leavePresence(lastPresenceId, currentUser);
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

    startRenagLoop();

    setTimeout(loadUserAndInit, 1000);
  },
});
