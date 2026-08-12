// Tarjeta embebida en la columna nativa de Autotask (la que trae "Organización/
// Contacto", "Resumen de tiempo", "Elemento de configuración"...) — a pedido
// explícito: el pill flotante de abajo-derecha quedaba poco visible/tapado, y se
// pidió que el aviso de asignación + notificaciones vivan ahí en vez de flotando.
//
// Reusa las clases reales de Autotask (.InsightContainer/.InsightShell/.Title/
// .Content) para heredar su fondo/tipografía sin tener que adivinarlos — son
// nombres semánticos e independientes del tema (dark/light), a diferencia de los
// ids (`z<hash>`) que sí cambian en cada carga y no sirven de selector.
// Sin Toggle/RefreshableInsightFooter: esos disparan la lógica propia de
// Autotask (colapsar/refrescar) vía manejadores globales — nuestra tarjeta no
// tiene ese controlador detrás, así que se omiten para no imitar algo que no
// funciona.
import { icon } from './icons';
import { avatarHtml } from './avatar';
import type { TicketState, TicketWarnings } from './messaging';
import { SEVERITY_COLOR, type AppNotification } from './notifications';

const WIDGET_ID = 'netsus-insight-widget';
const CONTENT_ID = `${WIDGET_ID}-content`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.floor(hrs / 24)} d`;
}

function findInsightContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.InsightContainer');
}

// Se consulta antes de decidir si el pill flotante de asignación (lib/banner.ts)
// debe seguir mostrándose — si esta tarjeta existe, el pill sobra (mismo dato
// dos veces en pantalla).
export function insightContainerAvailable(): boolean {
  return !!findInsightContainer();
}

function ensureShell(): HTMLElement | null {
  const existing = document.getElementById(WIDGET_ID);
  if (existing?.isConnected) return existing;
  const container = findInsightContainer();
  if (!container) return null;
  const shell = document.createElement('div');
  shell.id = WIDGET_ID;
  shell.className = 'InsightShell';
  shell.innerHTML = `<div class="Title"><div class="Text">Autotask CoView</div></div>` +
    `<div class="ContentContainer"><div class="Content" id="${CONTENT_ID}"></div></div>`;
  // Al final de la columna — es donde se pidió que apareciera (debajo de
  // "Elemento de configuración"), no antes de las tarjetas propias de Autotask.
  container.appendChild(shell);
  return shell;
}

export interface InsightActions {
  onPing: () => void;
  onFinish: () => void;
  onCancelPause: () => void;
}

// Se llama en cada pushState() de content.ts, igual que renderBanner — sin
// mensajería nueva, mismo estado. Devuelve true si logró pintarse (columna
// encontrada), false si Autotask todavía no la montó / esta vista no la trae
// (ej. otra pantalla, o layout futuro distinto): en ese caso content.ts deja el
// pill flotante como respaldo.
export function renderInsightWidget(
  state: TicketState,
  warnings: TicketWarnings,
  notifs: AppNotification[],
  actions: InsightActions,
): boolean {
  const shell = ensureShell();
  if (!shell) return false;
  const body = document.getElementById(CONTENT_ID);
  if (!body) return false;

  const parts: string[] = [];

  if (state.kind === 'collision') {
    const sorted = [...state.others].sort((a, b) => b.minutes - a.minutes);
    parts.push(`
      <div style="background:linear-gradient(135deg,#991b1b,#dc2626);border-radius:6px;padding:10px;margin:9px 0;color:#fff;">
        <div style="font-weight:700;font-size:12px;margin-bottom:6px;display:flex;align-items:center;gap:6px">${icon('alert-triangle', { size: 14 })} Ticket ocupado</div>
        <div style="font-size:11px;margin-bottom:8px">${sorted.map((u) => `<strong>${escapeHtml(u.name)}</strong>`).join(', ')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="${WIDGET_ID}-ping" style="background:rgba(255,255,255,.92);color:#111;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">Avisar</button>
          <button id="${WIDGET_ID}-finish" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">Terminé</button>
        </div>
      </div>`);
  } else if (state.kind === 'paused') {
    const m = Math.floor(state.secsLeft / 60);
    const s = state.secsLeft % 60;
    parts.push(`
      <div style="background:linear-gradient(135deg,#1e3a8a,#3867E9);border-radius:6px;padding:10px;margin:9px 0;color:#fff;font-size:11px;">
        Presencia pausada · vuelves en ${m}:${s.toString().padStart(2, '0')}
        <button id="${WIDGET_ID}-cancel" style="display:block;margin-top:6px;background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">Cancelar pausa</button>
      </div>`);
  } else if (state.kind === 'liberated') {
    parts.push(`<div style="background:linear-gradient(135deg,#14532d,#16a34a);border-radius:6px;padding:8px 10px;margin:9px 0;color:#fff;font-size:11px;">${icon('check-circle', { size: 13 })} Ticket libre — ya puedes trabajar en él</div>`);
  }

  if (warnings.assignedTo) {
    const activeNow = warnings.assignedPresent
      ? `<span style="color:#4ade80;display:inline-flex;align-items:center;gap:4px;margin-left:auto;white-space:nowrap"><span style="width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block"></span>activo ahora</span>`
      : '';
    parts.push(`
      <div style="border-left:3px solid #d97706;background:rgba(217,119,6,.08);border-radius:4px;padding:8px 10px;margin:9px 0;display:flex;align-items:center;gap:8px">
        ${avatarHtml(warnings.assignedTo, 0, 22)}
        <div style="font-size:11px;color:#d97706;flex:1;min-width:0">
          ${icon('clipboard-list', { size: 12 })} Asignado a <strong>${escapeHtml(warnings.assignedTo)}</strong>
          ${warnings.statusLabel ? `<div style="opacity:.75;font-size:10px;margin-top:1px">${escapeHtml(warnings.statusLabel)}</div>` : ''}
        </div>
        ${activeNow}
      </div>`);
  }

  parts.push(`<div style="font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;opacity:.55;margin:9px 0 6px">Notificaciones</div>`);
  const recent = notifs.slice(0, 5);
  if (!recent.length) {
    parts.push(`<div class="Text NoData VeryLowImportance">Sin notificaciones</div>`);
  } else {
    parts.push(recent.map((n) => {
      const color = SEVERITY_COLOR[n.severity].base;
      return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);align-items:flex-start">
        <span style="width:6px;height:6px;border-radius:50%;background:${color};margin-top:5px;flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:#c7c7c7">${escapeHtml(n.title)}</div>
          <div style="font-size:10.5px;opacity:.65;margin-top:1px">${escapeHtml(n.body)}</div>
        </div>
        <div style="font-size:10px;opacity:.45;flex-shrink:0">${timeAgo(n.ts)}</div>
      </div>`;
    }).join(''));
  }

  body.innerHTML = parts.join('');
  document.getElementById(`${WIDGET_ID}-ping`)?.addEventListener('click', actions.onPing);
  document.getElementById(`${WIDGET_ID}-finish`)?.addEventListener('click', actions.onFinish);
  document.getElementById(`${WIDGET_ID}-cancel`)?.addEventListener('click', actions.onCancelPause);
  return true;
}

export function removeInsightWidget(): void {
  document.getElementById(WIDGET_ID)?.remove();
}
