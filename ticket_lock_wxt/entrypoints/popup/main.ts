const input = document.getElementById('nameInput') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLDivElement;
const current = document.getElementById('current') as HTMLDivElement;

chrome.storage.local.get('netsus_user', ({ netsus_user }) => {
  if (netsus_user) {
    current.textContent = `Conectado como: ${netsus_user}`;
    input.value = netsus_user;
  } else {
    current.textContent = 'Sin nombre configurado';
  }
});

saveBtn.addEventListener('click', () => {
  const name = input.value.trim();
  if (!name) return;
  chrome.storage.local.set({ netsus_user: name }, () => {
    current.textContent = `Conectado como: ${name}`;
    status.textContent = '✓ Guardado';
    setTimeout(() => (status.textContent = ''), 2000);
  });
});
