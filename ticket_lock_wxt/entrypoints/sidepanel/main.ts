import {
  getAll,
  subscribe,
  markAllRead,
  markRead,
  unreadCount,
  SEVERITY_COLOR,
  type AppNotification,
} from '@/lib/notifications';
import { icon } from '@/lib/icons';
import { getThemePref, resolveTheme, subscribePrefs, type ResolvedTheme } from '@/lib/prefs';
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

function avatarHtml(name: string, idx: number): string {
  const colors = ['#f97316', '#01BFFA', '#8C52FF', '#22c55e', '#ec4899'];
  const inits = name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  return `<div style="
    width:32px;height:32px;border-radius:50%;flex-shrink:0;
    background:${colors[idx % colors.length]};border:2px solid rgba(0,0,0,0.2);
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:800;color:#fff;
  ">${inits}</div>`;
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
    const m = Math.floor(state.secsLeft / 60);
    const s = state.secsLeft % 60;
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
  pingBtn?.addEventListener('click', () => {
    if (pingBtn.disabled) return;
    pingBtn.disabled = true;
    pingBtn.innerHTML = `${icon('check', { size: 13 })} Enviado`;
    pingBtn.style.opacity = '0.6';
    sendAction({ type: 'NSB_ACTION', action: 'ping' });
    setTimeout(() => {
      pingBtn.disabled = false;
      pingBtn.innerHTML = `${icon('megaphone', { size: 13 })} Avisar`;
      pingBtn.style.opacity = '1';
    }, 15000);
  });
}

function renderNotAutotask() {
  appEl.innerHTML = `<div class="not-autotask">${icon('inbox', { size: 30 })}<div>Abre un ticket de Autotask<br/>para ver su estado</div></div>`;
}

function applyPayload(payload: StatePayload) {
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

// --- Tema ---
function applyTheme(t: ResolvedTheme) { document.documentElement.dataset.theme = t; }
let themePref: Awaited<ReturnType<typeof getThemePref>> = 'auto';
getThemePref().then((p) => { themePref = p; applyTheme(resolveTheme(p)); });
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
mq?.addEventListener('change', () => { if (themePref === 'auto') applyTheme(resolveTheme('auto')); });
subscribePrefs(({ theme }) => {
  if (theme !== undefined) { themePref = theme; applyTheme(resolveTheme(theme)); }
});
