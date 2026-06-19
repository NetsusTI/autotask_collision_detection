const BASE_URL = 'https://netsus-two.vercel.app';
const API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm';
const ADMIN_PASSWORD = 'netsus2026';

let currentTab = 'live';

function doLogin() {
  const pwd = (document.getElementById('pwdInput') as HTMLInputElement).value;
  if (pwd === ADMIN_PASSWORD) {
    sessionStorage.setItem('netsus_admin', '1');
    showPanel();
  } else {
    const err = document.getElementById('loginError')!;
    err.style.display = 'block';
    setTimeout(() => (err.style.display = 'none'), 2000);
  }
}
(window as any).doLogin = doLogin;

function setTab(tab: string) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((el, i) => {
    (el as HTMLElement).classList.toggle('active', (i === 0 && tab === 'live') || (i === 1 && tab === 'history'));
  });
  (document.getElementById('liveTab') as HTMLElement).style.display = tab === 'live' ? '' : 'none';
  (document.getElementById('historyTab') as HTMLElement).style.display = tab === 'history' ? '' : 'none';
}
(window as any).setTab = setTab;

function showPanel() {
  (document.getElementById('loginScreen') as HTMLElement).style.display = 'none';
  (document.getElementById('panel') as HTMLElement).style.display = '';
  fetchData();
  setInterval(fetchData, 10000);
}

async function fetchData() {
  try {
    const [presRes, histRes] = await Promise.all([
      fetch(`${BASE_URL}/api/presence/status`, { headers: { 'x-api-key': API_KEY } }),
      fetch(`${BASE_URL}/api/presence/history`, { headers: { 'x-api-key': API_KEY } }),
    ]);
    const tickets = await presRes.json().catch(() => []);
    const history = await histRes.json().catch(() => []);
    renderLive(tickets);
    renderHistory(history);
    const now = new Date();
    document.getElementById('lastUpdate')!.textContent = now.toLocaleTimeString('es-CL');
  } catch {}
}

function renderLive(tickets: any[]) {
  const totalUsers = tickets.reduce((a: number, t: any) => a + t.users.length, 0);
  document.getElementById('statTickets')!.textContent = tickets.length;
  document.getElementById('statUsers')!.textContent = totalUsers;

  const el = document.getElementById('liveTab')!;
  if (!tickets.length) {
    el.innerHTML = `<div class="empty"><div class="emptyIcon">✅</div><div class="emptyText">Sin colisiones activas</div><div class="emptySub">Todos los técnicos trabajan sin conflictos</div></div>`;
    return;
  }
  el.innerHTML = tickets.map((t: any) => `
    <div class="ticketCard ${t.users.length > 1 ? 'collision' : ''}">
      <div class="ticketLeft">
        <div class="ticketIcon ${t.users.length > 1 ? 'col' : ''}">${t.users.length > 1 ? '⚠️' : '🎫'}</div>
        <div>
          <div class="ticketName">${t.ticketNumber ?? '#' + t.ticketId}</div>
          <div class="ticketMeta">${t.users.length} técnico${t.users.length > 1 ? 's' : ''} activo${t.users.length > 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="chips">
        ${t.users.map((u: string, i: number) => `<span class="chip ${i === 0 ? 'primary' : ''}">${u}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function renderHistory(history: any[]) {
  const today = history.filter((e: any) => Date.now() - e.ts < 86400000).length;
  document.getElementById('statHistory')!.textContent = today;

  const el = document.getElementById('historyTab')!;
  if (!history.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 0;color:rgba(255,255,255,0.3);font-size:14px">Sin colisiones registradas aún</div>`;
    return;
  }
  el.innerHTML = history.map((e: any) => `
    <div class="histCard">
      <div class="histLeft">
        <span style="font-size:16px">⚠️</span>
        <div>
          <div class="histTicket">${e.ticketNumber ?? '#' + e.ticketId}</div>
          <div class="histTime">${new Date(e.ts).toLocaleString('es-CL')}</div>
        </div>
      </div>
      <div class="chips">
        ${e.users.map((u: string, i: number) => `<span class="histChip ${i === 0 ? 'first' : ''}">${u}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

// Auto-login si ya autenticado
if (sessionStorage.getItem('netsus_admin') === '1') {
  showPanel();
}

document.getElementById('pwdInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});
