const avatar = document.getElementById('avatar') as HTMLDivElement;
const current = document.getElementById('current') as HTMLDivElement;
const autoLabel = document.getElementById('autoLabel') as HTMLDivElement;
const input = document.getElementById('nameInput') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLDivElement;

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function showUser(name: string, isAuto: boolean) {
  avatar.textContent = initials(name);
  current.textContent = name;
  autoLabel.textContent = isAuto ? 'Detectado automáticamente desde Autotask' : 'Configurado manualmente';
  input.value = name;
}

chrome.storage.local.get(['netsus_user', 'netsus_user_auto'], ({ netsus_user, netsus_user_auto }) => {
  if (netsus_user) {
    showUser(netsus_user, !!netsus_user_auto);
  } else {
    current.textContent = 'Sin nombre detectado';
    autoLabel.textContent = 'Abre Autotask para detectar automáticamente';
    avatar.textContent = '?';
  }
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
