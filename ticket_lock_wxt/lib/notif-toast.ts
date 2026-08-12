// Aviso flotante para notificaciones que llegan del servidor (cola, asignación,
// respuesta de cliente, SLA, crítico) mientras el técnico NO está dentro de un
// ticket — ej. viendo un tablero o una lista. lib/banner.ts solo se pinta con
// estado de UN ticket (colisión/pausa/asignación), así que fuera de un ticket
// no había ninguna señal en pantalla más que el toast del sistema operativo
// (chrome.notifications, en entrypoints/background.ts) — insuficiente si el SO
// lo descarta o el técnico no llegó a verlo a tiempo.
import { icon } from './icons';
import { SEVERITY_COLOR, type AppNotification } from './notifications';

const STACK_ID = 'netsus-toast-stack';
const AUTO_DISMISS_MS = 12000;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function ensureStack(): HTMLElement {
  let stack = document.getElementById(STACK_ID);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = STACK_ID;
    // abajo-izquierda, apilando hacia arriba (column-reverse) — el más nuevo
    // queda pegado al borde inferior. A la izquierda (no derecha) para no
    // superponerse con el pill de asignación de lib/banner.ts, que vive en
    // bottom:16px;right:16px dentro de un ticket.
    stack.style.cssText = 'position:fixed;z-index:2147483000;bottom:16px;left:16px;display:flex;flex-direction:column-reverse;gap:8px;max-width:340px;font-family:\'Montserrat\',\'Segoe UI\',system-ui,sans-serif;';
    document.body.appendChild(stack);
  }
  return stack;
}

// Se llama una vez por notificación NUEVA (dedupe lo resuelve content.ts,
// comparando contra los ids ya vistos por esta instancia del content script).
export function showNotifToast(n: AppNotification, onOpen?: () => void): void {
  const stack = ensureStack();
  const color = SEVERITY_COLOR[n.severity];
  const card = document.createElement('div');
  card.style.cssText = `background:linear-gradient(135deg,${color.grad[0]},${color.grad[1]});border-radius:12px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,0.28);color:#fff;font-weight:400;cursor:${n.ticketUrl ? 'pointer' : 'default'};animation:netsus-toast-in .25s ease-out;`;
  card.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:8px">
      ${icon(n.icon, { size: 16 })}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px">${escapeHtml(n.title)}</div>
        <div style="font-size:11px;opacity:0.85;margin-top:2px">${escapeHtml(n.body)}</div>
      </div>
      <button title="Cerrar" style="background:rgba(255,255,255,0.15);border:none;border-radius:6px;width:20px;height:20px;color:#fff;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">${icon('x', { size: 12 })}</button>
    </div>`;

  const dismiss = () => {
    card.style.transition = 'opacity .2s, transform .2s';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-20px)';
    setTimeout(() => card.remove(), 200);
  };
  card.querySelector('button')?.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
  if (n.ticketUrl) {
    card.addEventListener('click', () => { onOpen?.(); window.location.href = n.ticketUrl!; });
  }

  stack.appendChild(card);
  setTimeout(dismiss, AUTO_DISMISS_MS);

  if (!document.getElementById('netsus-toast-style')) {
    const style = document.createElement('style');
    style.id = 'netsus-toast-style';
    style.textContent = '@keyframes netsus-toast-in { from { opacity:0; transform:translateX(-20px); } to { opacity:1; transform:translateX(0); } }';
    document.head.appendChild(style);
  }
}
