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
    if (footer) footer.innerHTML = '<span style="color:#ef4444">⚠ Sin conexión al servidor</span>';
  }
});
