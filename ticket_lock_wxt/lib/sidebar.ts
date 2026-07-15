// Panel lateral persistente (70/30): reemplaza el banner/pill flotante anterior.
// Empuja el contenido de Autotask con margin-right (no zoom/scale — eso rompe
// coordenadas de clic) e inyecta un panel fijo a la derecha con todo el estado
// de la extensión: presencia del ticket, warnings y el centro de notificaciones.
//
// Riesgo conocido: si Autotask tiene elementos position:fixed a pantalla completa
// (menús, modales), pueden seguir extendiéndose bajo el panel — mismo comportamiento
// que extensiones tipo Grammarly/Loom. Solo se confirma probando contra un ticket real.

import {
  getAll,
  subscribe,
  markAllRead,
  markRead,
  unreadCount,
  SEVERITY_COLOR,
  type AppNotification,
} from './notifications';
import { icon } from './icons';
import { getThemePref, resolveTheme, subscribePrefs, type ResolvedTheme } from './prefs';

const PREFIX = 'nsb';
const SIDEBAR_WIDTH = 'clamp(300px, 30vw, 460px)';

export interface OtherUser { name: string; minutes: number; }

export type SidebarState =
  | { kind: 'idle' }
  | { kind: 'solo'; ticketLabel: string }
  | { kind: 'collision'; others: OtherUser[]; ticketLabel: string }
  | { kind: 'liberated'; ticketLabel: string }
  | { kind: 'paused'; secsLeft: number };

export interface SidebarHandle {
  el: HTMLElement;
  setState(state: SidebarState): void;
  setOffline(show: boolean): void;
  setHistoryWarning(count: number | null): void;
  setAssignment(name: string | null): void;
  destroy(): void;
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

export function mountSidebar(): SidebarHandle {
  const existing = document.getElementById(`${PREFIX}-root`);
  if (existing) existing.remove();
  document.getElementById(`${PREFIX}-push-style`)?.remove();

  injectFont();
  injectStyles();

  // Empuja el contenido de la página (normal-flow) para reservar el 30%.
  const push = document.createElement('style');
  push.id = `${PREFIX}-push-style`;
  push.textContent = `
    html { overflow-x: hidden !important; }
    body { margin-right: ${SIDEBAR_WIDTH} !important; box-sizing: border-box !important; }
  `;
  document.head.appendChild(push);

  const root = document.createElement('div');
  root.id = `${PREFIX}-root`;
  root.innerHTML = `
    <div class="${PREFIX}-hdr">
      <img src="${(typeof chrome !== 'undefined' ? chrome.runtime.getURL('netsus-logo.png') : '')}" alt="netsus" class="${PREFIX}-logo" />
      <div class="${PREFIX}-hdr-text">
        <div class="${PREFIX}-hdr-title">Autotask CoView</div>
        <div class="${PREFIX}-hdr-sub">Netsus · Panel de control</div>
      </div>
    </div>
    <div id="${PREFIX}-warnings"></div>
    <div id="${PREFIX}-status"></div>
    <div class="${PREFIX}-notif-section">
      <div class="${PREFIX}-notif-head">
        <div class="${PREFIX}-notif-title">${icon('bell', { size: 15 })}<span>Notificaciones</span><span id="${PREFIX}-notif-count" class="${PREFIX}-notif-count" style="display:none">0</span></div>
        <button id="${PREFIX}-notif-readall" class="${PREFIX}-ico-btn" title="Marcar todas como leídas">${icon('check-check', { size: 14 })}</button>
      </div>
      <div id="${PREFIX}-notif-list" class="${PREFIX}-notif-list"></div>
    </div>
  `;
  document.body.appendChild(root);

  const statusEl = root.querySelector<HTMLElement>(`#${PREFIX}-status`)!;
  const warningsEl = root.querySelector<HTMLElement>(`#${PREFIX}-warnings`)!;
  const notifCountEl = root.querySelector<HTMLElement>(`#${PREFIX}-notif-count`)!;
  const notifListEl = root.querySelector<HTMLElement>(`#${PREFIX}-notif-list`)!;

  let offline = false;
  let historyCount: number | null = null;
  let assignedTo: string | null = null;

  function renderWarnings() {
    const rows: string[] = [];
    if (offline) {
      rows.push(`<div class="${PREFIX}-warn ${PREFIX}-warn-gray">${icon('alert-triangle', { size: 14 })} Sin conexión con el servidor</div>`);
    }
    if (assignedTo) {
      rows.push(`<div class="${PREFIX}-warn ${PREFIX}-warn-amber">${icon('clipboard-list', { size: 14 })} Asignado a <strong>${esc(assignedTo)}</strong></div>`);
    }
    if (historyCount && historyCount >= 2) {
      rows.push(`<div class="${PREFIX}-warn ${PREFIX}-warn-amber">${icon('flame', { size: 14 })} ${historyCount} colisiones previas en este ticket</div>`);
    }
    warningsEl.innerHTML = rows.join('');
  }

  function renderStatus(state: SidebarState) {
    if (state.kind === 'idle') {
      statusEl.innerHTML = `<div class="${PREFIX}-status-idle">${icon('inbox', { size: 26 })}<div>Abre un ticket para ver su estado</div></div>`;
      return;
    }
    if (state.kind === 'solo') {
      statusEl.innerHTML = `
        <div class="${PREFIX}-status-card ${PREFIX}-status-solo">
          <div class="${PREFIX}-status-row">${icon('check-circle', { size: 16 })}<strong>Trabajando solo</strong></div>
          <div class="${PREFIX}-status-ticket">${esc(state.ticketLabel)}</div>
        </div>`;
      return;
    }
    if (state.kind === 'liberated') {
      statusEl.innerHTML = `
        <div class="${PREFIX}-status-card ${PREFIX}-status-liberated">
          <div class="${PREFIX}-status-row">${icon('check-circle', { size: 16 })}<strong>Ticket liberado</strong></div>
          <div class="${PREFIX}-status-ticket">${esc(state.ticketLabel)} · ya puedes trabajar</div>
        </div>`;
      return;
    }
    if (state.kind === 'paused') {
      const m = Math.floor(state.secsLeft / 60);
      const s = state.secsLeft % 60;
      statusEl.innerHTML = `
        <div class="${PREFIX}-status-card ${PREFIX}-status-paused">
          <div class="${PREFIX}-status-row">${icon('pause', { size: 16 })}<strong>Presencia pausada</strong></div>
          <div class="${PREFIX}-status-ticket">Vuelves en ${m}:${s.toString().padStart(2, '0')}</div>
          <button class="${PREFIX}-btn" id="${PREFIX}-cancel-pause">Cancelar pausa</button>
        </div>`;
      return;
    }
    // collision
    const sorted = [...state.others].sort((a, b) => b.minutes - a.minutes);
    const first = sorted[0];
    statusEl.innerHTML = `
      <div class="${PREFIX}-status-card ${PREFIX}-status-collision">
        <div class="${PREFIX}-status-row">${icon('alert-triangle', { size: 16 })}<strong>Ticket ocupado</strong></div>
        <div class="${PREFIX}-status-ticket">${esc(state.ticketLabel)}</div>
        <div class="${PREFIX}-avatars">${sorted.map((u, i) => avatarHtml(u.name, i)).join('')}</div>
        <div class="${PREFIX}-who">
          ${sorted.length === 1
            ? `<strong>${esc(first.name)}</strong> llegó primero · ${formatTime(first.minutes)}`
            : sorted.map((u, i) => `<strong>${esc(u.name)}</strong>${i === 0 ? ' · primero' : ''} · ${formatTime(u.minutes)}`).join(' · ')}
        </div>
        <div class="${PREFIX}-actions">
          <button class="${PREFIX}-btn" id="${PREFIX}-ping-btn">${icon('megaphone', { size: 13 })} Avisar</button>
          <button class="${PREFIX}-btn ghost" id="${PREFIX}-finish-btn">${icon('check', { size: 13 })} Terminé</button>
        </div>
        <div class="${PREFIX}-pause-row">
          <span>${icon('pause', { size: 12 })} Pausar:</span>
          <button class="${PREFIX}-btn ghost sm" data-pause="5">5'</button>
          <button class="${PREFIX}-btn ghost sm" data-pause="15">15'</button>
          <button class="${PREFIX}-btn ghost sm" data-pause="30">30'</button>
        </div>
      </div>`;
  }

  // --- Notificaciones (sección siempre visible, no popover — el panel ya está docked) ---
  async function refreshNotifs(list?: AppNotification[]) {
    const data = list ?? (await getAll());
    const n = unreadCount(data);
    if (n > 0) { notifCountEl.textContent = n > 99 ? '99+' : String(n); notifCountEl.style.display = ''; }
    else notifCountEl.style.display = 'none';

    if (!data.length) {
      notifListEl.innerHTML = `<div class="${PREFIX}-notif-empty">Sin notificaciones</div>`;
      return;
    }
    notifListEl.innerHTML = data.slice(0, 30).map((x) => {
      const col = SEVERITY_COLOR[x.severity];
      const unread = !x.read;
      const ticket = x.ticketNumber || (x.ticketId ? `#${x.ticketId}` : '');
      return `
        <div class="${PREFIX}-nitem ${unread ? 'unread' : 'read'}" data-id="${x.id}" data-url="${esc(x.ticketUrl ?? '')}" style="--sev:${col.base};--sev-tint:${col.tint}">
          <div class="${PREFIX}-nitem-ico" style="color:${col.base}">${icon(x.icon, { size: 15 })}</div>
          <div class="${PREFIX}-nitem-body">
            <div class="${PREFIX}-nitem-title">${esc(x.title)}</div>
            <div class="${PREFIX}-nitem-text">${esc(x.body)}</div>
            <div class="${PREFIX}-nitem-meta">${ticket ? `<span class="${PREFIX}-nitem-ticket">${esc(ticket)}</span>·` : ''}<span>${relTime(x.ts)}</span></div>
          </div>
        </div>`;
    }).join('');
  }

  notifListEl.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(`.${PREFIX}-nitem`);
    if (!item) return;
    await markRead(item.dataset.id!);
    refreshNotifs();
    const url = item.dataset.url;
    if (url) window.open(url, '_blank');
  });
  root.querySelector(`#${PREFIX}-notif-readall`)!.addEventListener('click', async () => {
    await markAllRead();
    refreshNotifs();
  });

  const unsubNotifs = subscribe((list) => refreshNotifs(list));
  refreshNotifs();

  // --- Tema ---
  function applyTheme(t: ResolvedTheme) { root.dataset.nsbTheme = t; }
  let themePref: Awaited<ReturnType<typeof getThemePref>> = 'auto';
  getThemePref().then((p) => { themePref = p; applyTheme(resolveTheme(p)); });
  const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const mqHandler = () => { if (themePref === 'auto') applyTheme(resolveTheme('auto')); };
  mq?.addEventListener('change', mqHandler);
  const unsubPrefs = subscribePrefs(({ theme }) => {
    if (theme !== undefined) { themePref = theme; applyTheme(resolveTheme(theme)); }
  });

  return {
    el: root,
    setState: renderStatus,
    setOffline(show) { offline = show; renderWarnings(); },
    setHistoryWarning(count) { historyCount = count; renderWarnings(); },
    setAssignment(name) { assignedTo = name; renderWarnings(); },
    destroy() {
      unsubNotifs();
      unsubPrefs();
      mq?.removeEventListener('change', mqHandler);
      root.remove();
      document.getElementById(`${PREFIX}-push-style`)?.remove();
    },
  };
}

function injectFont() {
  if (document.getElementById('netsus-font-link')) return;
  const link = document.createElement('link');
  link.id = 'netsus-font-link';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;800&display=swap';
  document.head.appendChild(link);
}

function injectStyles() {
  if (document.getElementById(`${PREFIX}-styles`)) return;
  const s = document.createElement('style');
  s.id = `${PREFIX}-styles`;
  s.textContent = `
    #${PREFIX}-root {
      position: fixed; top: 0; right: 0; bottom: 0; width: ${SIDEBAR_WIDTH};
      z-index: 999995; display: flex; flex-direction: column;
      font-family: 'Montserrat', 'Segoe UI', system-ui, sans-serif;
      box-shadow: -8px 0 30px rgba(0,0,0,0.35);
      --bg: linear-gradient(180deg, #190637 0%, #0d0320 100%);
      --text: #fff; --dim: rgba(255,255,255,0.65); --faint: rgba(255,255,255,0.4);
      --border: rgba(255,255,255,0.1); --hover: rgba(255,255,255,0.06);
      --card-bg: rgba(255,255,255,0.05); --accent: #3867E9;
      background: var(--bg); color: var(--text); border-left: 1px solid var(--border);
      overflow: hidden;
    }
    #${PREFIX}-root[data-nsb-theme="light"] {
      --bg: linear-gradient(180deg, #F3F3F3 0%, #e7e7ec 100%);
      --text: #3B3B3B; --dim: rgba(59,59,59,0.85); --faint: rgba(59,59,59,0.65);
      --border: rgba(59,59,59,0.12); --hover: rgba(59,59,59,0.06);
      --card-bg: rgba(59,59,59,0.04);
    }
    .${PREFIX}-hdr { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .${PREFIX}-logo { height: 22px; }
    .${PREFIX}-hdr-title { font-size: 13px; font-weight: 800; }
    .${PREFIX}-hdr-sub { font-size: 10px; color: var(--dim); margin-top: -1px; }
    #${PREFIX}-warnings { flex-shrink: 0; }
    .${PREFIX}-warn {
      display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600;
      padding: 8px 18px; border-bottom: 1px solid var(--border);
    }
    .${PREFIX}-warn-gray { background: rgba(107,114,128,0.15); color: var(--dim); }
    .${PREFIX}-warn-amber { background: rgba(217,119,6,0.15); color: #d97706; }
    #${PREFIX}-status { padding: 16px 18px; flex-shrink: 0; }
    .${PREFIX}-status-idle {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 24px 10px; color: var(--faint); font-size: 12px; text-align: center;
    }
    .${PREFIX}-status-card { border-radius: 14px; padding: 14px 16px; }
    .${PREFIX}-status-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 4px; }
    .${PREFIX}-status-ticket { font-size: 11px; color: var(--dim); margin-bottom: 10px; }
    .${PREFIX}-status-solo { background: var(--card-bg); border: 1px solid var(--border); }
    .${PREFIX}-status-liberated { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #16a34a; }
    .${PREFIX}-status-liberated .${PREFIX}-status-ticket { color: #16a34a; opacity: 0.8; }
    .${PREFIX}-status-paused { background: rgba(56,103,233,0.12); border: 1px solid rgba(56,103,233,0.3); }
    .${PREFIX}-status-collision { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.35); }
    .${PREFIX}-avatars { display: flex; margin: 8px 0; }
    .${PREFIX}-avatars > div:not(:first-child) { margin-left: -8px; }
    .${PREFIX}-who { font-size: 11px; color: var(--dim); margin-bottom: 12px; line-height: 1.5; }
    .${PREFIX}-actions { display: flex; gap: 8px; margin-bottom: 10px; }
    .${PREFIX}-pause-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--faint); }
    .${PREFIX}-btn {
      border: none; border-radius: 16px; padding: 7px 14px; font-size: 12px; font-weight: 600;
      font-family: inherit; cursor: pointer; background: var(--accent); color: #fff;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .${PREFIX}-btn.ghost { background: var(--hover); color: var(--text); border: 1px solid var(--border); }
    .${PREFIX}-btn.sm { padding: 4px 10px; font-size: 11px; }
    .${PREFIX}-ico-btn {
      width: 26px; height: 26px; border-radius: 7px; cursor: pointer;
      background: transparent; border: none; color: var(--faint);
      display: flex; align-items: center; justify-content: center;
    }
    .${PREFIX}-ico-btn:hover { background: var(--hover); color: var(--text); }
    .${PREFIX}-notif-section { flex: 1; display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--border); }
    .${PREFIX}-notif-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; flex-shrink: 0; }
    .${PREFIX}-notif-title { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; }
    .${PREFIX}-notif-title svg { color: var(--accent); }
    .${PREFIX}-notif-count {
      background: #ef4444; color: #fff; font-size: 10px; font-weight: 800;
      min-width: 16px; height: 16px; border-radius: 8px; padding: 0 4px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .${PREFIX}-notif-list { flex: 1; overflow-y: auto; padding: 0 10px 10px; }
    .${PREFIX}-nitem {
      display: flex; gap: 8px; padding: 9px 8px; border-radius: 10px; cursor: pointer;
      border-left: 3px solid transparent; margin-bottom: 3px;
    }
    .${PREFIX}-nitem:hover { background: var(--hover); }
    .${PREFIX}-nitem.unread { background: var(--sev-tint); border-left-color: var(--sev); }
    .${PREFIX}-nitem.read { opacity: 0.6; }
    .${PREFIX}-nitem-ico { flex-shrink: 0; margin-top: 1px; }
    .${PREFIX}-nitem-body { flex: 1; min-width: 0; }
    .${PREFIX}-nitem-title { font-size: 12px; font-weight: 700; }
    .${PREFIX}-nitem-text {
      font-size: 11px; color: var(--dim); line-height: 1.3; margin-top: 1px;
      overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
      -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    .${PREFIX}-nitem-meta { font-size: 10px; color: var(--faint); margin-top: 3px; display: flex; gap: 4px; }
    .${PREFIX}-nitem-ticket { color: var(--accent); font-weight: 600; }
    .${PREFIX}-notif-empty { font-size: 11px; color: var(--faint); text-align: center; padding: 20px 0; }
  `;
  document.head.appendChild(s);
}
