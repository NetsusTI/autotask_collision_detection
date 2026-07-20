import {
  getAll as getNotifs,
  markAllRead,
  markRead,
  unreadCount,
  subscribe,
  getRenagMinutes,
  RENAG_MIN_KEY,
  SEVERITY_COLOR,
  type AppNotification,
} from '@/lib/notifications';
import { icon } from '@/lib/icons';
import {
  getThemePref,
  setThemePref,
  resolveTheme,
  getTypePrefs,
  setTypeMuted,
  typeList,
  type ThemePref,
  type TypePrefs,
} from '@/lib/prefs';

const avatar = document.getElementById('avatar') as HTMLDivElement;
const current = document.getElementById('current') as HTMLDivElement;
const autoLabel = document.getElementById('autoLabel') as HTMLDivElement;
const input = document.getElementById('nameInput') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLDivElement;
const soundToggle = document.getElementById('soundToggle') as HTMLInputElement;

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function showUser(name: string, isAuto: boolean) {
  avatar.textContent = initials(name);
  current.textContent = name;
  autoLabel.textContent = isAuto
    ? 'Detectado automáticamente desde Autotask'
    : 'Configurado manualmente';
  input.value = name;
}

// Iconos estáticos de las etiquetas (los textos ya no llevan emoji inline en el HTML)
document.getElementById('soundLabel')!.innerHTML = icon('volume-2', { size: 13 }) + ' Sonido de alerta';
document.getElementById('renagLabel')!.innerHTML = icon('bell', { size: 13 }) + ' Re-avisar cada';
document.getElementById('themeLabel')!.innerHTML = icon('palette', { size: 13 }) + ' Tema';
document.getElementById('prefsSummary')!.innerHTML = icon('bell', { size: 12 }) + ' Tipos de notificación';
document.getElementById('collisionLabel')!.innerHTML = `<span style="color:#ef4444;display:flex">${icon('alert-triangle', { size: 12 })}</span> Colisiones activas`;
document.querySelector<HTMLButtonElement>('#themeSeg button[data-theme-val="light"]')!.innerHTML = icon('sun', { size: 12 });
document.querySelector<HTMLButtonElement>('#themeSeg button[data-theme-val="dark"]')!.innerHTML = icon('moon', { size: 12 });
const nameWarningIcon = document.querySelector('#nameWarning');
if (nameWarningIcon) nameWarningIcon.innerHTML = `<span style="display:inline-flex;vertical-align:middle;margin-right:4px">${icon('alert-triangle', { size: 12 })}</span>${nameWarningIcon.textContent!.trim()}`;

chrome.storage.local.get(['netsus_user', 'netsus_user_auto', 'netsus_sound'], ({ netsus_user, netsus_user_auto, netsus_sound }) => {
  if (netsus_user) {
    showUser(netsus_user, !!netsus_user_auto);
  } else {
    current.textContent = 'Sin nombre detectado';
    autoLabel.textContent = 'Abre Autotask para detectar automáticamente';
    avatar.textContent = '?';
    const warn = document.getElementById('nameWarning');
    if (warn) warn.style.display = 'block';
  }
  soundToggle.checked = netsus_sound !== 'off';
});

soundToggle.addEventListener('change', () => {
  chrome.storage.local.set({ netsus_sound: soundToggle.checked ? 'on' : 'off' });
});

saveBtn.addEventListener('click', () => {
  const name = input.value.trim();
  if (!name) return;
  chrome.storage.local.set({ netsus_user: name, netsus_user_auto: false }, () => {
    showUser(name, false);
    status.textContent = '✓ Guardado';
    setTimeout(() => (status.textContent = ''), 2000);
  });
});

document.getElementById('adminBtn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
});

// Chrome exige un gesto del usuario para abrir el side panel — este clic cuenta.
// Solo hace falta una vez por pestaña: una vez abierto, sigue la pestaña activa solo.
document.getElementById('openPanelBtn')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) {
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  }
});

function loadCollisions() {
  chrome.runtime.sendMessage(
    { type: 'NETSUS_API', method: 'GET', path: '/api/presence/status', body: null },
    (res: any) => {
      if (chrome.runtime.lastError || !res?.sent) return;
      const data: any[] = Array.isArray(res.data) ? res.data : [];
      const collisions = data.filter(t => t.users.length > 1);
      const section = document.getElementById('collisionSection') as HTMLElement;
      const list = document.getElementById('collisionList') as HTMLElement;
      if (!collisions.length) { section.style.display = 'none'; return; }
      section.style.display = '';
      list.innerHTML = collisions.map(t => {
        const names = t.users.map((u: any) => typeof u === 'string' ? u : u.name).join(' · ');
        const ticket = t.ticketNumber || '#' + t.ticketId;
        return `<div class="col-card">
          <div class="col-ticket">${ticket}</div>
          <div class="col-users">${names}</div>
        </div>`;
      }).join('');
    }
  );
}

loadCollisions();

chrome.runtime.sendMessage({ type: 'NETSUS_STATUS' }, (res: any) => {
  if (chrome.runtime.lastError) return;
  if (res && !res.online) {
    const footer = document.getElementById('footer');
    if (footer) footer.innerHTML = `<span style="color:#ef4444;display:inline-flex;align-items:center;gap:4px">${icon('alert-triangle', { size: 11 })} Sin conexión al servidor</span>`;
  }
});

// --- Centro de notificaciones (espejo del buzón compartido) ---
const notifList = document.getElementById('notifList') as HTMLElement;
const notifCount = document.getElementById('notifCount') as HTMLElement;

function relTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'ahora';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function renderNotifs(list: AppNotification[]) {
  const n = unreadCount(list);
  if (n > 0) { notifCount.textContent = n > 99 ? '99+' : String(n); notifCount.style.display = ''; }
  else notifCount.style.display = 'none';

  if (!list.length) {
    notifList.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
    return;
  }
  notifList.innerHTML = list.slice(0, 15).map((x) => {
    const col = SEVERITY_COLOR[x.severity];
    const unread = !x.read;
    return `<div class="notif-item ${unread ? 'unread' : 'read'}" data-id="${x.id}" data-url="${escHtml(x.ticketUrl ?? '')}" style="--sev:${col.base};--tint:${col.tint}">
      <div class="notif-ico" style="color:${col.base}">${icon(x.icon, { size: 16 })}</div>
      <div class="notif-body">
        <div class="notif-title">${unread ? `<span class="notif-dot" style="background:${col.base}"></span>` : ''}${escHtml(x.title)}</div>
        <div class="notif-text">${escHtml(x.body)}</div>
        <div class="notif-time">${relTime(x.ts)}</div>
      </div>
    </div>`;
  }).join('');
}

notifList.addEventListener('click', async (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('.notif-item');
  if (!item) return;
  await markRead(item.dataset.id!);
  const url = item.dataset.url;
  if (url) chrome.tabs.create({ url });
  renderNotifs(await getNotifs());
});

document.getElementById('notifReadAll')?.addEventListener('click', async () => {
  await markAllRead();
  renderNotifs(await getNotifs());
});

const renagInput = document.getElementById('renagInput') as HTMLInputElement;
getRenagMinutes().then((m) => { renagInput.value = String(m); });
renagInput.addEventListener('change', () => {
  let v = parseInt(renagInput.value) || 3;
  v = Math.max(1, Math.min(60, v));
  renagInput.value = String(v);
  chrome.storage.local.set({ [RENAG_MIN_KEY]: v });
});

getNotifs().then(renderNotifs);
subscribe(renderNotifs);

// --- Tema ---
function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}
function highlightSeg(pref: ThemePref) {
  document.querySelectorAll<HTMLButtonElement>('#themeSeg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.themeVal === pref);
  });
}
getThemePref().then((p) => { applyTheme(p); highlightSeg(p); });
document.querySelectorAll<HTMLButtonElement>('#themeSeg button').forEach((b) => {
  b.addEventListener('click', async () => {
    const v = (b.dataset.themeVal || 'auto') as ThemePref;
    await setThemePref(v);
    applyTheme(v);
    highlightSeg(v);
  });
});

// --- Preferencias por tipo ---
function renderTypePrefs(prefs: TypePrefs) {
  const list = document.getElementById('typePrefsList') as HTMLElement;
  list.innerHTML = typeList().map(function (t) {
    var muted = prefs[t.type] && prefs[t.type]!.muted === true;
    return '<div class="pref-row"><span class="pref-label">' + t.label + '</span>' +
      '<label class="toggle"><input type="checkbox" data-type="' + t.type + '" ' + (muted ? '' : 'checked') + '><span class="slider"></span></label></div>';
  }).join('');
  list.querySelectorAll<HTMLInputElement>('input[data-type]').forEach((inp) => {
    inp.addEventListener('change', () => setTypeMuted(inp.dataset.type as any, !inp.checked));
  });
}
getTypePrefs().then(renderTypePrefs);
