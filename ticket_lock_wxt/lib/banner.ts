// Banner inyectado directamente en la página de Autotask — la señal "a simple
// vista" que describe la propuesta a gerencia (superior en colisión/pausa,
// inferior para el aviso de asignación). Vive ADEMÁS del side panel (que sigue
// siendo el lugar de detalle completo/ajustes/buzón) — este módulo es solo un
// renderer más, driven por el mismo currentState/currentWarnings de content.ts.
import { icon } from './icons';
import { avatarHtml } from './avatar';
import type { TicketState, TicketWarnings } from './messaging';

export interface BannerActions {
  onPing: () => void;
  onFinish: () => void;
  onPause: (minutes: number) => void;
  onCancelPause: () => void;
  onToggleMinimize: () => void;
  onDismiss: () => void;
}

export interface BannerOpts {
  minimized: boolean;
  dismissed: boolean;
}

const BANNER_ID = 'netsus-banner';
const PILL_ID = 'netsus-assign-pill';

function formatTime(minutes: number): string {
  if (minutes < 1) return 'acaba de entrar';
  if (minutes === 1) return '1 min';
  return `${minutes} min`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// z-index alto (banda superior de int32) para ganarle a lo que sea que use Autotask.
const BASE_STYLE = `position:fixed;z-index:2147483000;font-family:'Montserrat','Segoe UI',system-ui,sans-serif;font-weight:400;`;
const CARD = 'border-radius:14px;padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.28);color:#fff;';
const ICON_BTN = 'background:rgba(255,255,255,0.15);border:none;border-radius:8px;width:26px;height:26px;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
const BTN = 'background:rgba(255,255,255,0.92);color:#111;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:inherit;';
const BTN_GHOST = 'background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.35);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:inherit;';
const BTN_GHOST_SM = 'background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.35);border-radius:8px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;';

const THEME = {
  collision: 'background:linear-gradient(135deg,#991b1b,#dc2626);',
  paused: 'background:linear-gradient(135deg,#1e3a8a,#3867E9);',
  liberated: 'background:linear-gradient(135deg,#14532d,#16a34a);',
};

function ensureRoot(): HTMLElement {
  let root = document.getElementById(BANNER_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = BANNER_ID;
    root.style.cssText = `${BASE_STYLE}top:16px;left:50%;transform:translateX(-50%);max-width:420px;width:calc(100% - 32px);`;
    document.body.appendChild(root);
  }
  return root;
}

function ensurePill(): HTMLElement {
  let pill = document.getElementById(PILL_ID);
  if (!pill) {
    pill = document.createElement('div');
    pill.id = PILL_ID;
    pill.style.cssText = `${BASE_STYLE}bottom:16px;right:16px;`;
    document.body.appendChild(pill);
  }
  return pill;
}

// Se llama en cada pushState() de content.ts — un renderer más de la misma
// máquina de estados que ya alimenta al side panel, sin mensajería nueva.
export function renderBanner(state: TicketState, warnings: TicketWarnings, opts: BannerOpts, actions: BannerActions): void {
  const root = ensureRoot();
  const pill = ensurePill();

  // Banner inferior de asignación — independiente del estado principal (la
  // propuesta lo describe como visible "solo en el ticket", o sea sin colisión).
  if (warnings.assignedTo && state.kind !== 'collision' && !opts.dismissed) {
    pill.style.display = '';
    pill.innerHTML = `<div style="${CARD}background:rgba(30,27,46,0.94);display:flex;align-items:center;gap:8px;font-size:12px;">
      ${icon('clipboard-list', { size: 14 })} Asignado a <strong>${escapeHtml(warnings.assignedTo)}</strong>
    </div>`;
  } else {
    pill.style.display = 'none';
    pill.innerHTML = '';
  }

  if (opts.dismissed || state.kind === 'idle' || state.kind === 'solo') {
    root.style.display = 'none';
    root.innerHTML = '';
    return;
  }

  root.style.display = '';

  if (opts.minimized) {
    const color = state.kind === 'collision' ? '#dc2626' : state.kind === 'paused' ? '#3867E9' : '#16a34a';
    const iconName = state.kind === 'collision' ? 'alert-triangle' : state.kind === 'paused' ? 'pause' : 'check-circle';
    root.innerHTML = `<button id="netsus-banner-expand" title="Expandir" style="
      width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;margin-left:auto;display:flex;
      align-items:center;justify-content:center;background:${color};color:#fff;box-shadow:0 8px 20px rgba(0,0,0,0.3);
    ">${icon(iconName, { size: 20 })}</button>`;
    document.getElementById('netsus-banner-expand')?.addEventListener('click', actions.onToggleMinimize);
    return;
  }

  if (state.kind === 'collision') {
    const sorted = [...state.others].sort((a, b) => b.minutes - a.minutes);
    const first = sorted[0];
    root.innerHTML = `
      <div style="${CARD}${THEME.collision}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px">${icon('alert-triangle', { size: 17 })} Ticket ocupado</div>
          <div style="display:flex;gap:4px">
            <button id="netsus-banner-min" title="Minimizar" style="${ICON_BTN}">${icon('chevron-right', { size: 14 })}</button>
            <button id="netsus-banner-close" title="Quitar" style="${ICON_BTN}">${icon('x', { size: 14 })}</button>
          </div>
        </div>
        <div style="font-size:12px;opacity:0.85;margin-bottom:8px">${escapeHtml(state.ticketLabel)}${state.ticketTitle ? ` — ${escapeHtml(state.ticketTitle)}` : ''}</div>
        <div style="display:flex;margin-bottom:8px">${sorted.map((u, i) => avatarHtml(u.name, i, 28)).join('')}</div>
        <div style="font-size:12px;margin-bottom:10px;line-height:1.5">
          ${sorted.length === 1
            ? `<strong>${escapeHtml(first.name)}</strong> llegó primero · ${formatTime(first.minutes)}`
            : sorted.map((u, i) => `<strong>${escapeHtml(u.name)}</strong>${i === 0 ? ' · primero' : ''} · ${formatTime(u.minutes)}`).join(' · ')}
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
          <button id="netsus-banner-ping" style="${BTN}">${icon('megaphone', { size: 13 })} Avisar</button>
          <button id="netsus-banner-finish" style="${BTN_GHOST}">${icon('check', { size: 13 })} Terminé</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px">
          <span style="opacity:0.85;display:inline-flex;align-items:center;gap:4px">${icon('pause', { size: 12 })} Pausar:</span>
          <button data-pause="5" style="${BTN_GHOST_SM}">5'</button>
          <button data-pause="15" style="${BTN_GHOST_SM}">15'</button>
          <button data-pause="30" style="${BTN_GHOST_SM}">30'</button>
        </div>
      </div>`;
    document.getElementById('netsus-banner-min')?.addEventListener('click', actions.onToggleMinimize);
    document.getElementById('netsus-banner-close')?.addEventListener('click', actions.onDismiss);
    document.getElementById('netsus-banner-ping')?.addEventListener('click', actions.onPing);
    document.getElementById('netsus-banner-finish')?.addEventListener('click', actions.onFinish);
    root.querySelectorAll<HTMLButtonElement>('[data-pause]').forEach((btn) => {
      btn.addEventListener('click', () => actions.onPause(parseInt(btn.dataset.pause!, 10)));
    });
    return;
  }

  if (state.kind === 'liberated') {
    root.innerHTML = `
      <div style="${CARD}${THEME.liberated}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px">
            ${icon('check-circle', { size: 16 })} El ticket está libre. Ya puedes trabajar en él.
          </div>
          <button id="netsus-banner-close" title="Quitar" style="${ICON_BTN}">${icon('x', { size: 14 })}</button>
        </div>
      </div>`;
    document.getElementById('netsus-banner-close')?.addEventListener('click', actions.onDismiss);
    return;
  }

  // paused
  const m = Math.floor(state.secsLeft / 60);
  const s = state.secsLeft % 60;
  root.innerHTML = `
    <div style="${CARD}${THEME.paused}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px">${icon('pause', { size: 16 })} Presencia pausada</div>
        <button id="netsus-banner-min" title="Minimizar" style="${ICON_BTN}">${icon('chevron-right', { size: 14 })}</button>
      </div>
      <div style="font-size:13px;margin-bottom:10px">Vuelves en ${m}:${s.toString().padStart(2, '0')}</div>
      <button id="netsus-banner-cancel" style="${BTN_GHOST}">Cancelar pausa</button>
    </div>`;
  document.getElementById('netsus-banner-min')?.addEventListener('click', actions.onToggleMinimize);
  document.getElementById('netsus-banner-cancel')?.addEventListener('click', actions.onCancelPause);
}

// Quita el banner/pill del DOM por completo — se usa al cambiar de ticket para
// no arrastrar el markup (y los listeners) del ticket anterior.
export function removeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
  document.getElementById(PILL_ID)?.remove();
}
