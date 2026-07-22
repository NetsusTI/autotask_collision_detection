// Avatar de iniciales compartido — usado por el side panel y por el banner in-page
// (ticket_lock_wxt/lib/banner.ts), para que ambas superficies muestren el mismo
// color/iniciales para un mismo técnico dentro de una colisión.

const COLORS = ['#f97316', '#01BFFA', '#8C52FF', '#22c55e', '#ec4899'];

export function avatarInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

export function avatarColor(idx: number): string {
  return COLORS[idx % COLORS.length];
}

export function avatarHtml(name: string, idx: number, size = 32): string {
  const fontSize = Math.round(size * 0.34);
  return `<div style="
    width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;
    background:${avatarColor(idx)};border:2px solid rgba(0,0,0,0.2);
    display:flex;align-items:center;justify-content:center;
    font-size:${fontSize}px;font-weight:800;color:#fff;
  ">${avatarInitials(name)}</div>`;
}
