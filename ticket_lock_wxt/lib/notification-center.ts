// UI del centro de notificaciones (overlay in-page): campana flotante + bandeja.
// Se monta desde el content script sobre la página de Autotask. Lee del store
// compartido (lib/notifications) y refleja los estados aviso / no leída / leída
// con colores por severidad.

import {
  getAll,
  subscribe,
  markAllRead,
  markAllSeen,
  markRead,
  remove,
  clearAll,
  unreadCount,
  SEVERITY_COLOR,
  type AppNotification,
  type Severity,
} from './notifications';
import { icon } from './icons';
import {
  getThemePref,
  resolveTheme,
  getTypePrefs,
  isMuted,
  subscribePrefs,
  type ResolvedTheme,
} from './prefs';

export interface NotificationCenterHooks {
  // El content script provee el sonido (posee AudioContext y la preferencia).
  playSound?: (severity: Severity) => void;
  onOpenTicket?: (url: string) => void;
}

const PREFIX = 'ncx';

function relTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'ahora';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

export function mountNotificationCenter(hooks: NotificationCenterHooks = {}) {
  if (document.getElementById(`${PREFIX}-root`)) {
    return { destroy() {}, refresh() {} };
  }

  injectStyles();

  const root = document.createElement('div');
  root.id = `${PREFIX}-root`;
  root.innerHTML = `
    <button id="${PREFIX}-bell" class="${PREFIX}-bell" title="Notificaciones (Alt+N)">
      ${icon('bell', { size: 22 })}
      <span id="${PREFIX}-badge" class="${PREFIX}-badge" style="display:none">0</span>
    </button>
    <div id="${PREFIX}-panel" class="${PREFIX}-panel" style="display:none">
      <div class="${PREFIX}-head">
        <div class="${PREFIX}-title">${icon('inbox', { size: 16 })}<span>Notificaciones</span></div>
        <div class="${PREFIX}-head-actions">
          <button id="${PREFIX}-readall" class="${PREFIX}-ico-btn" title="Marcar todas como leídas">${icon('check-check', { size: 16 })}</button>
          <button id="${PREFIX}-clear" class="${PREFIX}-ico-btn" title="Vaciar">${icon('trash', { size: 15 })}</button>
          <button id="${PREFIX}-close" class="${PREFIX}-ico-btn" title="Cerrar">${icon('x', { size: 16 })}</button>
        </div>
      </div>
      <div id="${PREFIX}-list" class="${PREFIX}-list"></div>
    </div>
    <div id="${PREFIX}-toasts" class="${PREFIX}-toasts"></div>
  `;
  document.body.appendChild(root);

  const bell = root.querySelector<HTMLButtonElement>(`#${PREFIX}-bell`)!;
  const badge = root.querySelector<HTMLElement>(`#${PREFIX}-badge`)!;
  const panel = root.querySelector<HTMLElement>(`#${PREFIX}-panel`)!;
  const listEl = root.querySelector<HTMLElement>(`#${PREFIX}-list`)!;
  const toastsEl = root.querySelector<HTMLElement>(`#${PREFIX}-toasts`)!;

  const toastedIds = new Set<string>();
  let panelOpen = false;

  function renderBadge(list: AppNotification[]) {
    const n = unreadCount(list);
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = '';
      bell.classList.add('has-unread');
    } else {
      badge.style.display = 'none';
      bell.classList.remove('has-unread');
    }
  }

  function renderList(list: AppNotification[]) {
    if (!list.length) {
      listEl.innerHTML = `<div class="${PREFIX}-empty">${icon('check-circle', { size: 30 })}<div>Sin notificaciones</div><span>Aquí verás colisiones, avisos y alertas de Autotask</span></div>`;
      return;
    }
    listEl.innerHTML = list
      .map((n) => {
        const col = SEVERITY_COLOR[n.severity];
        const unread = !n.read;
        const ticket = n.ticketNumber || (n.ticketId ? `#${n.ticketId}` : '');
        return `
          <div class="${PREFIX}-item ${unread ? 'unread' : 'read'}" data-id="${n.id}" data-url="${esc(n.ticketUrl ?? '')}" style="--sev:${col.base};--sev-tint:${col.tint}">
            <div class="${PREFIX}-item-ico" style="color:${col.base}">${icon(n.icon, { size: 18 })}</div>
            <div class="${PREFIX}-item-body">
              <div class="${PREFIX}-item-title">${unread ? `<span class="${PREFIX}-dot" style="background:${col.base}"></span>` : ''}${esc(n.title)}</div>
              <div class="${PREFIX}-item-text">${esc(n.body)}</div>
              <div class="${PREFIX}-item-meta">${ticket ? `<span class="${PREFIX}-item-ticket">${esc(ticket)}</span>·` : ''}<span>${relTime(n.ts)}</span></div>
            </div>
            <button class="${PREFIX}-item-x" data-del="${n.id}" title="Eliminar">${icon('x', { size: 14 })}</button>
          </div>`;
      })
      .join('');
  }

  async function refresh(list?: AppNotification[]) {
    const data = list ?? (await getAll());
    renderBadge(data);
    if (panelOpen) renderList(data);
    // Avisos (toast) para lo no visto aún en esta pestaña; respeta el silenciado por tipo.
    const prefs = await getTypePrefs();
    for (const n of data) {
      if (!n.seen && !toastedIds.has(n.id)) {
        toastedIds.add(n.id);
        if (isMuted(prefs, n.type)) continue; // silenciado: solo badge/bandeja
        showToast(n);
        hooks.playSound?.(n.severity);
      }
    }
  }

  function applyTheme(t: ResolvedTheme) {
    root.dataset.ncxTheme = t;
  }

  function showToast(n: AppNotification) {
    const col = SEVERITY_COLOR[n.severity];
    const el = document.createElement('div');
    el.className = `${PREFIX}-toast`;
    el.style.setProperty('--g1', col.grad[0]);
    el.style.setProperty('--g2', col.grad[1]);
    el.innerHTML = `
      <div class="${PREFIX}-toast-ico">${icon(n.icon, { size: 20, color: '#fff' })}</div>
      <div class="${PREFIX}-toast-body">
        <div class="${PREFIX}-toast-title">${esc(n.title)}</div>
        <div class="${PREFIX}-toast-text">${esc(n.body)}</div>
      </div>`;
    el.addEventListener('click', () => {
      openPanel();
      el.remove();
    });
    toastsEl.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
    }, 6000);
  }

  async function openPanel() {
    panelOpen = true;
    panel.style.display = '';
    requestAnimationFrame(() => panel.classList.add('open'));
    const data = await getAll();
    renderList(data);
    await markAllSeen(); // abrir el buzón cuenta como "visto" (corta el aviso)
  }

  function closePanel() {
    panelOpen = false;
    panel.classList.remove('open');
    setTimeout(() => { if (!panelOpen) panel.style.display = 'none'; }, 180);
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  bell.addEventListener('click', togglePanel);
  root.querySelector(`#${PREFIX}-close`)!.addEventListener('click', closePanel);
  root.querySelector(`#${PREFIX}-readall`)!.addEventListener('click', async () => {
    await markAllRead();
    refresh();
  });
  root.querySelector(`#${PREFIX}-clear`)!.addEventListener('click', async () => {
    await clearAll();
    toastedIds.clear();
    refresh();
  });

  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const delBtn = target.closest<HTMLElement>(`[data-del]`);
    if (delBtn) {
      e.stopPropagation();
      await remove(delBtn.dataset.del!);
      refresh();
      return;
    }
    const item = target.closest<HTMLElement>(`.${PREFIX}-item`);
    if (!item) return;
    const id = item.dataset.id!;
    const url = item.dataset.url;
    await markRead(id);
    refresh();
    if (url) {
      if (hooks.onOpenTicket) hooks.onOpenTicket(url);
      else window.open(url, '_blank');
    }
  });

  // Cerrar al hacer click fuera.
  document.addEventListener('click', (e) => {
    if (!panelOpen) return;
    const t = e.target as Node;
    if (!panel.contains(t) && !bell.contains(t)) closePanel();
  });

  // Alt+N para abrir/cerrar.
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'n' || e.key === 'N')) togglePanel();
  });

  // Tema: aplica el resuelto y reacciona a cambios de preferencia o del esquema del sistema.
  let themePref: Awaited<ReturnType<typeof getThemePref>> = 'auto';
  getThemePref().then((p) => { themePref = p; applyTheme(resolveTheme(p)); });
  const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const mqHandler = () => { if (themePref === 'auto') applyTheme(resolveTheme('auto')); };
  mq?.addEventListener('change', mqHandler);
  const unsubPrefs = subscribePrefs(({ theme }) => {
    if (theme !== undefined) { themePref = theme; applyTheme(resolveTheme(theme)); }
    refresh();
  });

  const unsub = subscribe((list) => refresh(list));
  refresh();

  return {
    refresh: () => refresh(),
    destroy() {
      unsub();
      unsubPrefs();
      mq?.removeEventListener('change', mqHandler);
      root.remove();
    },
  };
}

function injectBrandFont() {
  if (document.getElementById('netsus-font-link')) return;
  const link = document.createElement('link');
  link.id = 'netsus-font-link';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;800&display=swap';
  document.head.appendChild(link);
}

function injectStyles() {
  injectBrandFont();
  if (document.getElementById(`${PREFIX}-styles`)) return;
  const s = document.createElement('style');
  s.id = `${PREFIX}-styles`;
  s.textContent = `
    #${PREFIX}-root {
      font-family: 'Montserrat', 'Segoe UI', system-ui, sans-serif;
      --p-bg:#0f172a; --p-border:rgba(255,255,255,0.1); --p-shadow:0 16px 48px rgba(0,0,0,0.55);
      --text:#f1f5f9; --dim:rgba(255,255,255,0.6); --faint:rgba(255,255,255,0.4);
      --hover:rgba(255,255,255,0.06); --head-bg:rgba(255,255,255,0.02);
      --bell-bg:linear-gradient(135deg,#1f2937,#111827); --bell-border:rgba(255,255,255,0.12);
      --bell-icon:#fff; --badge-ring:#111827; --accent:#93c5fd; --read-op:0.62;
    }
    #${PREFIX}-root[data-ncx-theme="light"] {
      --p-bg:#ffffff; --p-border:rgba(0,0,0,0.1); --p-shadow:0 16px 48px rgba(0,0,0,0.2);
      --text:#0f172a; --dim:rgba(15,23,42,0.65); --faint:rgba(15,23,42,0.45);
      --hover:rgba(15,23,42,0.05); --head-bg:rgba(15,23,42,0.03);
      --bell-bg:#ffffff; --bell-border:rgba(15,23,42,0.14);
      --bell-icon:#334155; --badge-ring:#ffffff; --accent:#2563eb; --read-op:0.55;
    }
    .${PREFIX}-bell {
      position: fixed; left: 20px; bottom: 20px; z-index: 999990;
      width: 52px; height: 52px; border-radius: 50%;
      background: var(--bell-bg); color: var(--bell-icon);
      border: 1px solid var(--bell-border);
      box-shadow: 0 6px 20px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: transform .15s, box-shadow .15s;
    }
    .${PREFIX}-bell:hover { transform: translateY(-2px); box-shadow: 0 8px 26px rgba(0,0,0,0.5); }
    .${PREFIX}-bell.has-unread { animation: ${PREFIX}-ring 2.4s ease-in-out infinite; }
    @keyframes ${PREFIX}-ring {
      0%,88%,100% { transform: rotate(0); }
      90% { transform: rotate(-9deg); } 93% { transform: rotate(8deg); } 96% { transform: rotate(-5deg); }
    }
    .${PREFIX}-badge {
      position: absolute; top: -3px; right: -3px; min-width: 20px; height: 20px;
      padding: 0 5px; border-radius: 10px; background: #ef4444; color: #fff;
      font-size: 11px; font-weight: 800; line-height: 20px; text-align: center;
      box-shadow: 0 0 0 2px var(--badge-ring); box-sizing: border-box;
    }
    .${PREFIX}-panel {
      position: fixed; left: 20px; bottom: 82px; z-index: 999991;
      width: 372px; max-width: calc(100vw - 40px); max-height: 72vh;
      background: var(--p-bg); color: var(--text);
      border: 1px solid var(--p-border); border-radius: 16px;
      box-shadow: var(--p-shadow);
      display: flex; flex-direction: column; overflow: hidden;
      opacity: 0; transform: translateY(10px) scale(0.98);
      transition: opacity .18s ease, transform .18s ease;
    }
    .${PREFIX}-panel.open { opacity: 1; transform: translateY(0) scale(1); }
    .${PREFIX}-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border-bottom: 1px solid var(--p-border);
      background: var(--head-bg);
    }
    .${PREFIX}-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: var(--text); }
    .${PREFIX}-title svg { color: #3867E9; }
    .${PREFIX}-head-actions { display: flex; gap: 4px; }
    .${PREFIX}-ico-btn {
      width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
      background: transparent; border: none; color: var(--faint);
      display: flex; align-items: center; justify-content: center; transition: .15s;
    }
    .${PREFIX}-ico-btn:hover { background: var(--hover); color: var(--text); }
    .${PREFIX}-list { overflow-y: auto; padding: 6px; }
    .${PREFIX}-item {
      display: flex; gap: 10px; padding: 10px 10px; border-radius: 10px;
      cursor: pointer; position: relative; transition: background .12s;
      border-left: 3px solid transparent;
    }
    .${PREFIX}-item:hover { background: var(--hover); }
    .${PREFIX}-item.unread { background: var(--sev-tint); border-left-color: var(--sev); }
    .${PREFIX}-item.read { opacity: var(--read-op); }
    .${PREFIX}-item-ico { flex-shrink: 0; margin-top: 1px; }
    .${PREFIX}-item-body { flex: 1; min-width: 0; }
    .${PREFIX}-item-title {
      display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700;
      color: var(--text); margin-bottom: 2px;
    }
    .${PREFIX}-item.read .${PREFIX}-item-title { font-weight: 600; }
    .${PREFIX}-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .${PREFIX}-item-text {
      font-size: 12px; color: var(--dim); line-height: 1.35;
      overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
      -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    .${PREFIX}-item-meta { font-size: 11px; color: var(--faint); margin-top: 4px; display: flex; gap: 5px; align-items: center; }
    .${PREFIX}-item-ticket { color: var(--accent); font-weight: 600; }
    .${PREFIX}-item-x {
      position: absolute; top: 8px; right: 8px; width: 22px; height: 22px;
      border: none; background: transparent; color: var(--faint);
      border-radius: 6px; cursor: pointer; display: none; align-items: center; justify-content: center;
    }
    .${PREFIX}-item:hover .${PREFIX}-item-x { display: flex; }
    .${PREFIX}-item-x:hover { background: var(--hover); color: var(--text); }
    .${PREFIX}-empty {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 40px 20px; text-align: center; color: var(--dim); font-size: 13px; font-weight: 600;
    }
    .${PREFIX}-empty span { font-size: 11px; color: var(--faint); font-weight: 400; }
    .${PREFIX}-toasts {
      position: fixed; left: 20px; bottom: 82px; z-index: 999992;
      display: flex; flex-direction: column-reverse; gap: 8px; pointer-events: none;
    }
    .${PREFIX}-toast {
      pointer-events: auto; width: 340px; max-width: calc(100vw - 40px);
      display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px;
      border-radius: 12px; color: #fff; cursor: pointer;
      background: linear-gradient(135deg, var(--g1), var(--g2));
      box-shadow: 0 10px 30px rgba(0,0,0,0.45);
      animation: ${PREFIX}-toast-in .22s ease-out;
    }
    .${PREFIX}-toast.out { animation: ${PREFIX}-toast-out .25s ease-in forwards; }
    @keyframes ${PREFIX}-toast-in { from { transform: translateX(-110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes ${PREFIX}-toast-out { from { transform: translateX(0); opacity: 1; } to { transform: translateX(-110%); opacity: 0; } }
    .${PREFIX}-toast-ico { flex-shrink: 0; margin-top: 1px; }
    .${PREFIX}-toast-title { font-size: 13px; font-weight: 800; }
    .${PREFIX}-toast-text { font-size: 12px; opacity: 0.9; margin-top: 2px; }
  `;
  document.head.appendChild(s);
}
