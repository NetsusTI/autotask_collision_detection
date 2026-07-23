import {
  getAll,
  subscribe,
  markAllRead,
  markRead,
  unreadCount,
  getRenagMinutes,
  RENAG_MIN_KEY,
  SEVERITY_COLOR,
  type AppNotification,
} from '@/lib/notifications';
import { icon } from '@/lib/icons';
import { avatarHtml } from '@/lib/avatar';
import {
  getThemePref,
  setThemePref,
  resolveTheme,
  getTypePrefs,
  setTypeMuted,
  typeList,
  subscribePrefs,
  type ThemePref,
  type ResolvedTheme,
  type TypePrefs,
} from '@/lib/prefs';
import type {
  TicketState,
  TicketWarnings,
  StatePayload,
  StateMessage,
  PanelToContentMessage,
  OtherUser,
} from '@/lib/messaging';

const statusEl = document.getElementById('status') as HTMLElement;
const warningsEl = document.getElementById('warnings') as HTMLElement;
const appEl = document.getElementById('app') as HTMLElement;
const notifCountEl = document.getElementById('notif-count') as HTMLElement;
const notifListEl = document.getElementById('notif-list') as HTMLElement;

let currentTabId: number | null = null;
let pauseLocalTimer: ReturnType<typeof setInterval> | null = null;
let pauseLocalSecs = 0;

function stopPauseTimer() {
  if (pauseLocalTimer) { clearInterval(pauseLocalTimer); pauseLocalTimer = null; }
}

function startPauseTimer(secsLeft: number) {
  stopPauseTimer();
  pauseLocalSecs = secsLeft;
  pauseLocalTimer = setInterval(() => {
    pauseLocalSecs = Math.max(0, pauseLocalSecs - 1);
    const tickEl = document.querySelector<HTMLElement>('.status-paused .status-ticket');
    if (tickEl) {
      const m = Math.floor(pauseLocalSecs / 60);
      const s = pauseLocalSecs % 60;
      tickEl.textContent = `Vuelves en ${m}:${s.toString().padStart(2, '0')}`;
    }
    if (pauseLocalSecs <= 0) stopPauseTimer();
  }, 1000);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function relTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'ahora';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function formatTime(minutes: number): string {
  if (minutes < 1) return 'acaba de entrar';
  if (minutes === 1) return '1 min';
  return `${minutes} min`;
}

// --- Estado del ticket (llega por mensajes desde el content script de la pestaña activa) ---
function renderWarnings(w: TicketWarnings | null) {
  if (!w) { warningsEl.innerHTML = ''; return; }
  const rows: string[] = [];
  if (w.offline) {
    rows.push(`<div class="warn warn-gray">${icon('alert-triangle', { size: 14 })} Sin conexión con el servidor</div>`);
  }
  if (w.assignedTo) {
    rows.push(`<div class="warn warn-amber">${icon('clipboard-list', { size: 14 })} Asignado a <strong>${esc(w.assignedTo)}</strong></div>`);
  }
  if (w.historyCount && w.historyCount >= 2) {
    rows.push(`<div class="warn warn-amber">${icon('flame', { size: 14 })} ${w.historyCount} colisiones previas en este ticket</div>`);
  }
  warningsEl.innerHTML = rows.join('');
}

function sendAction(msg: PanelToContentMessage) {
  if (currentTabId === null) return;
  chrome.tabs.sendMessage(currentTabId, msg).catch(() => {});
}

function renderStatus(state: TicketState | null) {
  if (!state) {
    appEl.style.display = 'none';
    return;
  }
  appEl.style.display = '';

  if (state.kind === 'idle') {
    statusEl.innerHTML = `<div class="status-idle">${icon('inbox', { size: 26 })}<div>Abre un ticket para ver su estado</div></div>`;
    return;
  }
  if (state.kind === 'solo') {
    statusEl.innerHTML = `
      <div class="status-card status-solo">
        <div class="status-row">${icon('check-circle', { size: 16 })}<strong>Trabajando solo</strong></div>
        <div class="status-ticket">${esc(state.ticketLabel)}</div>
      </div>`;
    return;
  }
  if (state.kind === 'liberated') {
    statusEl.innerHTML = `
      <div class="status-card status-liberated">
        <div class="status-row">${icon('check-circle', { size: 16 })}<strong>Ticket liberado</strong></div>
        <div class="status-ticket">${esc(state.ticketLabel)} · ya puedes trabajar</div>
      </div>`;
    return;
  }
  if (state.kind === 'paused') {
    const secs = pauseLocalTimer ? pauseLocalSecs : state.secsLeft;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    statusEl.innerHTML = `
      <div class="status-card status-paused">
        <div class="status-row">${icon('pause', { size: 16 })}<strong>Presencia pausada</strong></div>
        <div class="status-ticket">Vuelves en ${m}:${s.toString().padStart(2, '0')}</div>
        <button class="btn" id="cancel-pause">Cancelar pausa</button>
      </div>`;
    document.getElementById('cancel-pause')?.addEventListener('click', () => sendAction({ type: 'NSB_ACTION', action: 'cancelPause' }));
    return;
  }
  // collision
  const others: OtherUser[] = state.others;
  const sorted = [...others].sort((a, b) => b.minutes - a.minutes);
  const first = sorted[0];
  statusEl.innerHTML = `
    <div class="status-card status-collision">
      <div class="status-row">${icon('alert-triangle', { size: 16 })}<strong>Ticket ocupado</strong></div>
      <div class="status-ticket">${esc(state.ticketLabel)}</div>
      <div class="avatars">${sorted.map((u, i) => avatarHtml(u.name, i)).join('')}</div>
      <div class="who">
        ${sorted.length === 1
          ? `<strong>${esc(first.name)}</strong> llegó primero · ${formatTime(first.minutes)}`
          : sorted.map((u, i) => `<strong>${esc(u.name)}</strong>${i === 0 ? ' · primero' : ''} · ${formatTime(u.minutes)}`).join(' · ')}
      </div>
      <div class="actions">
        <button class="btn" id="ping-btn">${icon('megaphone', { size: 13 })} Avisar</button>
        <button class="btn ghost" id="finish-btn">${icon('check', { size: 13 })} Terminé</button>
      </div>
      <div class="quick-msgs">
        <button class="btn ghost sm" data-qmsg="Dame 5 minutos">⏱ 5 min</button>
        <button class="btn ghost sm" data-qmsg="Casi termino">🔜 Termino</button>
        <button class="btn ghost sm" data-qmsg="Me encargo yo">✋ Me encargo</button>
      </div>
      <div class="pause-row">
        <span>${icon('pause', { size: 12 })} Pausar:</span>
        <button class="btn ghost sm" data-pause="5">5'</button>
        <button class="btn ghost sm" data-pause="15">15'</button>
        <button class="btn ghost sm" data-pause="30">30'</button>
      </div>
    </div>`;

  document.getElementById('finish-btn')?.addEventListener('click', () => sendAction({ type: 'NSB_ACTION', action: 'finish' }));
  document.querySelectorAll<HTMLButtonElement>('[data-pause]').forEach(btn => {
    btn.addEventListener('click', () => sendAction({ type: 'NSB_ACTION', action: 'pause', minutes: parseInt(btn.dataset.pause!) }));
  });
  const pingBtn = document.getElementById('ping-btn') as HTMLButtonElement | null;

  function doPing(quickMsg?: string) {
    if (!pingBtn || pingBtn.disabled) return;
    pingBtn.disabled = true;
    pingBtn.innerHTML = `${icon('check', { size: 13 })} Enviado`;
    pingBtn.style.opacity = '0.6';
    sendAction({ type: 'NSB_ACTION', action: 'ping', quickMsg });
    setTimeout(() => {
      if (!pingBtn) return;
      pingBtn.disabled = false;
      pingBtn.innerHTML = `${icon('megaphone', { size: 13 })} Avisar`;
      pingBtn.style.opacity = '1';
    }, 15000);
  }

  pingBtn?.addEventListener('click', () => doPing());
  statusEl.querySelectorAll<HTMLButtonElement>('[data-qmsg]').forEach((btn) => {
    btn.addEventListener('click', () => doPing(btn.dataset.qmsg));
  });
}

function renderNotAutotask() {
  appEl.innerHTML = `<div class="not-autotask">${icon('inbox', { size: 30 })}<div>Abre un ticket de Autotask<br/>para ver su estado</div></div>`;
}

function applyPayload(payload: StatePayload) {
  if (payload.state?.kind === 'paused') {
    const incoming = payload.state.secsLeft;
    // Sincronizar solo si difiere en más de 2 segundos del contador local (para no reiniciar en cada mensaje)
    if (!pauseLocalTimer || Math.abs(incoming - pauseLocalSecs) > 2) {
      startPauseTimer(incoming);
    }
  } else {
    stopPauseTimer();
  }
  renderStatus(payload.state);
  renderWarnings(payload.warnings);
}

// --- Seguir la pestaña activa ---
async function requestStateFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  if (currentTabId === null) { renderNotAutotask(); return; }
  try {
    const res = await chrome.tabs.sendMessage(currentTabId, { type: 'NSB_REQUEST_STATE' });
    if (res?.payload) applyPayload(res.payload);
    else renderNotAutotask();
  } catch {
    // Sin content script en esta pestaña (no es Autotask, o la página aún está cargando).
    renderNotAutotask();
  }
}

chrome.tabs.onActivated.addListener(() => { requestStateFromActiveTab(); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === currentTabId && changeInfo.status === 'complete') requestStateFromActiveTab();
});

chrome.runtime.onMessage.addListener((msg: StateMessage, sender) => {
  if (msg?.type !== 'NSB_STATE') return;
  if (sender.tab?.id !== currentTabId) return;
  applyPayload(msg.payload);
});

requestStateFromActiveTab();

// --- Notificaciones (compartidas vía chrome.storage — no necesitan mensajería por pestaña) ---
async function refreshNotifs(list?: AppNotification[]) {
  const data = list ?? (await getAll());
  const n = unreadCount(data);
  if (n > 0) { notifCountEl.textContent = n > 99 ? '99+' : String(n); notifCountEl.style.display = ''; }
  else notifCountEl.style.display = 'none';

  if (!data.length) {
    notifListEl.innerHTML = `<div class="notif-empty">Sin notificaciones</div>`;
    return;
  }
  notifListEl.innerHTML = data.slice(0, 30).map((x) => {
    const col = SEVERITY_COLOR[x.severity];
    const unread = !x.read;
    const ticket = x.ticketNumber || (x.ticketId ? `#${x.ticketId}` : '');
    return `
      <div class="nitem ${unread ? 'unread' : 'read'}" data-id="${x.id}" data-url="${esc(x.ticketUrl ?? '')}" style="--sev:${col.base};--sev-tint:${col.tint}">
        <div class="nitem-ico" style="color:${col.base}">${icon(x.icon, { size: 15 })}</div>
        <div class="nitem-body">
          <div class="nitem-title">${esc(x.title)}</div>
          <div class="nitem-text">${esc(x.body)}</div>
          <div class="nitem-meta">${ticket ? `<span class="nitem-ticket">${esc(ticket)}</span>·` : ''}<span>${relTime(x.ts)}</span></div>
        </div>
      </div>`;
  }).join('');
}

notifListEl.addEventListener('click', async (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('.nitem');
  if (!item) return;
  await markRead(item.dataset.id!);
  refreshNotifs();
  const url = item.dataset.url;
  if (url) chrome.tabs.create({ url });
});
document.getElementById('notif-readall')!.addEventListener('click', async () => {
  await markAllRead();
  refreshNotifs();
});

subscribe((list) => refreshNotifs(list));
refreshNotifs();

// --- Tema (aplicación automática, sigue al sistema si está en "auto") ---
function applyTheme(t: ResolvedTheme) { document.documentElement.dataset.theme = t; }
let themePref: ThemePref = 'auto';
getThemePref().then((p) => { themePref = p; applyTheme(resolveTheme(p)); highlightThemeSeg(p); });
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
mq?.addEventListener('change', () => { if (themePref === 'auto') applyTheme(resolveTheme('auto')); });
subscribePrefs(({ theme }) => {
  if (theme !== undefined) { themePref = theme; applyTheme(resolveTheme(theme)); highlightThemeSeg(theme); }
});

// --- Ajustes (antes vivían en el popup — fusionados aquí para que el ícono de la
// extensión abra el panel directamente, sin un popup intermedio) ---
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
settingsBtn.addEventListener('click', () => {
  const open = settingsPanel.style.display !== 'none';
  settingsPanel.style.display = open ? 'none' : '';
  settingsBtn.classList.toggle('active', !open);
});

document.getElementById('soundLabel')!.innerHTML = icon('volume-2', { size: 13 }) + ' Sonido de alerta';
document.getElementById('renagLabel')!.innerHTML = icon('bell', { size: 13 }) + ' Re-avisar cada';
document.getElementById('themeLabel')!.innerHTML = icon('palette', { size: 13 }) + ' Tema';
document.getElementById('prefsSummary')!.innerHTML = icon('bell', { size: 12 }) + ' Tipos de notificación';
document.querySelector<HTMLButtonElement>('#themeSeg button[data-theme-val="light"]')!.innerHTML = icon('sun', { size: 12 });
document.querySelector<HTMLButtonElement>('#themeSeg button[data-theme-val="dark"]')!.innerHTML = icon('moon', { size: 12 });
const nameWarningEl = document.getElementById('nameWarning')!;
nameWarningEl.innerHTML = `<span style="display:inline-flex;vertical-align:middle;margin-right:4px">${icon('alert-triangle', { size: 12 })}</span>${nameWarningEl.textContent!.trim()}`;

const avatarEl = document.getElementById('avatar') as HTMLDivElement;
const currentEl = document.getElementById('current') as HTMLDivElement;
const autoLabelEl = document.getElementById('autoLabel') as HTMLDivElement;
const nameInputEl = document.getElementById('nameInput') as HTMLInputElement;
const saveBtnEl = document.getElementById('saveBtn') as HTMLButtonElement;
const saveStatusEl = document.getElementById('saveStatus') as HTMLDivElement;
const soundToggleEl = document.getElementById('soundToggle') as HTMLInputElement;

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function showUser(name: string, isAuto: boolean) {
  avatarEl.textContent = initials(name);
  currentEl.textContent = name;
  autoLabelEl.textContent = isAuto ? 'Detectado automáticamente desde Autotask' : 'Configurado manualmente';
  nameInputEl.value = name;
}
chrome.storage.local.get(['netsus_user', 'netsus_user_auto', 'netsus_sound'], ({ netsus_user, netsus_user_auto, netsus_sound }: { netsus_user?: string; netsus_user_auto?: boolean; netsus_sound?: string }) => {
  if (netsus_user) {
    showUser(netsus_user, !!netsus_user_auto);
    loadMyStats(netsus_user);
  } else {
    currentEl.textContent = 'Sin nombre detectado';
    autoLabelEl.textContent = 'Abre un ticket para detectar automáticamente';
    avatarEl.textContent = '?';
    nameWarningEl.style.display = 'block';
  }
  soundToggleEl.checked = netsus_sound !== 'off';
});
soundToggleEl.addEventListener('change', () => {
  chrome.storage.local.set({ netsus_sound: soundToggleEl.checked ? 'on' : 'off' });
});
saveBtnEl.addEventListener('click', () => {
  const name = nameInputEl.value.trim();
  if (!name) return;
  chrome.storage.local.set({ netsus_user: name, netsus_user_auto: false }, () => {
    showUser(name, false);
    saveStatusEl.textContent = '✓ Guardado';
    setTimeout(() => (saveStatusEl.textContent = ''), 2000);
  });
});

document.getElementById('adminBtn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
});

// --- No molestar ---
const dndBtn = document.getElementById('dndBtn') as HTMLButtonElement;
const dndMenu = document.getElementById('dndMenu') as HTMLElement;
const dndBanner = document.getElementById('dndBanner') as HTMLElement;
const dndUntilEl = document.getElementById('dnd-until') as HTMLElement;

function refreshDnd() {
  chrome.storage.local.get(['netsus_dnd_until'], (data: any) => {
    const until = data.netsus_dnd_until;
    const active = typeof until === 'number' && until > Date.now();
    dndBtn.classList.toggle('active', active);
    dndBtn.style.color = active ? '#f97316' : '';
    if (active) {
      dndBanner.style.display = '';
      dndUntilEl.textContent = new Date(until).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    } else {
      dndBanner.style.display = 'none';
    }
  });
}

dndBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  dndMenu.style.display = dndMenu.style.display === 'none' ? '' : 'none';
});

dndMenu.querySelectorAll<HTMLElement>('.dnd-opt').forEach((opt) => {
  opt.addEventListener('click', () => {
    const mins = parseInt(opt.dataset.mins ?? '0');
    if (mins < 0) {
      chrome.storage.local.remove('netsus_dnd_until');
    } else {
      chrome.storage.local.set({ netsus_dnd_until: Date.now() + mins * 60000 });
    }
    dndMenu.style.display = 'none';
    setTimeout(refreshDnd, 100);
  });
});

document.addEventListener('click', () => { dndMenu.style.display = 'none'; });
refreshDnd();
setInterval(refreshDnd, 30000); // actualizar estado cuando expire el DND

// --- Auto-aviso configurable ---
const autoPingInputEl = document.getElementById('autoPingInput') as HTMLInputElement;
chrome.storage.local.get(['netsus_auto_ping_min'], (data: any) => {
  autoPingInputEl.value = String(data.netsus_auto_ping_min || 5);
});
autoPingInputEl.addEventListener('change', () => {
  const v = Math.max(1, Math.min(60, parseInt(autoPingInputEl.value) || 5));
  autoPingInputEl.value = String(v);
  chrome.storage.local.set({ netsus_auto_ping_min: v });
});

// --- Activos ahora ---
async function refreshActiveTechs() {
  const res = await chrome.runtime.sendMessage({ type: 'NETSUS_API', method: 'GET', path: '/api/presence/status' }).catch(() => null);
  const listEl = document.getElementById('active-list') as HTMLElement;
  const countEl = document.getElementById('active-count') as HTMLElement;
  if (!res?.sent || !Array.isArray(res.data)) {
    listEl.innerHTML = '<div style="font-size:11px;color:var(--faint);padding:4px 4px 6px">Sin conexión</div>';
    countEl.style.display = 'none';
    return;
  }
  const tickets: { id: string; users: string[]; ticketNumber?: string }[] = res.data;
  const allUsers: { name: string; ticket: string; collision: boolean }[] = [];
  for (const t of tickets) {
    const label = t.ticketNumber ?? `#${t.id}`;
    const col = t.users.length > 1;
    for (const u of t.users) {
      allUsers.push({ name: u, ticket: label, collision: col });
    }
  }
  if (!allUsers.length) {
    listEl.innerHTML = '<div style="font-size:11px;color:var(--faint);padding:4px 4px 6px">Sin técnicos activos</div>';
    countEl.style.display = 'none';
    return;
  }
  countEl.textContent = String(allUsers.length);
  countEl.style.display = '';
  listEl.innerHTML = allUsers.map(u => `
    <div class="aitem">
      <div class="adot ${u.collision ? 'col' : ''}"></div>
      <div class="aname">${esc(u.name)}</div>
      <div class="atkt">${esc(u.ticket)}</div>
    </div>`).join('');
}
refreshActiveTechs();
setInterval(refreshActiveTechs, 20000);

// --- Estadísticas personales ---
async function loadMyStats(user: string) {
  if (!user) return;
  const res = await chrome.runtime.sendMessage({
    type: 'NETSUS_API', method: 'GET',
    path: `/api/presence/my-stats?user=${encodeURIComponent(user)}`,
  }).catch(() => null);
  if (!res?.sent || !res.data) return;
  const statsEl = document.getElementById('my-stats') as HTMLElement;
  const weekEl = document.getElementById('stat-week') as HTMLElement;
  const monthEl = document.getElementById('stat-month') as HTMLElement;
  weekEl.textContent = res.data.weekCount ?? '—';
  const m = res.data.monthCount ?? 0;
  monthEl.textContent = String(m);
  statsEl.style.display = '';
  // Color: 0 = verde, 1-2 = amarillo, 3+ = rojo
  const col = m === 0 ? '#22c55e' : m <= 2 ? '#f97316' : '#ef4444';
  (document.querySelectorAll('.stat-num') as NodeListOf<HTMLElement>).forEach(el => el.style.color = col);
}

// --- Feedback (mejorar / agregar / quitar) — va directo a Supabase vía el backend ---
const feedbackBtn = document.getElementById('feedbackBtn') as HTMLButtonElement;
const feedbackForm = document.getElementById('feedbackForm') as HTMLElement;
const feedbackTypeSegEl = document.getElementById('feedbackTypeSeg') as HTMLElement;
const feedbackMessageEl = document.getElementById('feedbackMessage') as HTMLTextAreaElement;
const feedbackSubmitEl = document.getElementById('feedbackSubmit') as HTMLButtonElement;
const feedbackStatusEl = document.getElementById('feedbackStatus') as HTMLDivElement;

feedbackBtn.addEventListener('click', () => {
  const open = feedbackForm.style.display !== 'none';
  feedbackForm.style.display = open ? 'none' : '';
});

let feedbackType = 'mejorar';
feedbackTypeSegEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
  b.addEventListener('click', () => {
    feedbackType = b.dataset.fbType!;
    feedbackTypeSegEl.querySelectorAll<HTMLButtonElement>('button').forEach((x) => x.classList.toggle('active', x === b));
  });
});

feedbackSubmitEl.addEventListener('click', async () => {
  const message = feedbackMessageEl.value.trim();
  if (!message) return;
  feedbackSubmitEl.disabled = true;
  const { netsus_user } = await chrome.storage.local.get(['netsus_user']);
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'NETSUS_API',
      method: 'POST',
      path: '/api/feedback',
      body: { user: netsus_user || 'Desconocido', type: feedbackType, message },
    });
    if (res?.sent && res.status === 200) {
      feedbackMessageEl.value = '';
      feedbackStatusEl.textContent = '✓ Enviado, ¡gracias!';
    } else if (res?.status === 403) {
      feedbackStatusEl.textContent = 'No te reconocimos como técnico — revisa tu nombre arriba';
    } else {
      feedbackStatusEl.textContent = 'Error al enviar, intenta de nuevo';
    }
  } catch {
    feedbackStatusEl.textContent = 'Error al enviar, intenta de nuevo';
  }
  feedbackSubmitEl.disabled = false;
  setTimeout(() => (feedbackStatusEl.textContent = ''), 3000);
});

const renagInputEl = document.getElementById('renagInput') as HTMLInputElement;
getRenagMinutes().then((m) => { renagInputEl.value = String(m); });
renagInputEl.addEventListener('change', () => {
  let v = parseInt(renagInputEl.value) || 3;
  v = Math.max(1, Math.min(60, v));
  renagInputEl.value = String(v);
  chrome.storage.local.set({ [RENAG_MIN_KEY]: v });
});

function highlightThemeSeg(pref: ThemePref) {
  document.querySelectorAll<HTMLButtonElement>('#themeSeg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.themeVal === pref);
  });
}
document.querySelectorAll<HTMLButtonElement>('#themeSeg button').forEach((b) => {
  b.addEventListener('click', async () => {
    const v = (b.dataset.themeVal || 'auto') as ThemePref;
    themePref = v;
    await setThemePref(v);
    applyTheme(resolveTheme(v));
    highlightThemeSeg(v);
  });
});

function renderTypePrefs(prefs: TypePrefs) {
  const list = document.getElementById('typePrefsList') as HTMLElement;
  list.innerHTML = typeList().map(function (t) {
    const muted = prefs[t.type]?.muted === true;
    return '<div class="pref-row"><span class="pref-label">' + t.label + '</span>' +
      '<label class="toggle"><input type="checkbox" data-type="' + t.type + '" ' + (muted ? '' : 'checked') + '><span class="tgl-slider"></span></label></div>';
  }).join('');
  list.querySelectorAll<HTMLInputElement>('input[data-type]').forEach((inp) => {
    inp.addEventListener('change', () => setTypeMuted(inp.dataset.type as any, !inp.checked));
  });
}
getTypePrefs().then(renderTypePrefs);
