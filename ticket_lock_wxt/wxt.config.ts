import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Autotask CoView',
    // Subir esta versión en cada build permite confirmar de un vistazo, en
    // chrome://extensions, si Chrome está corriendo el build nuevo o uno viejo.
    version: '1.1.0',
    description: 'Detecta colisiones entre técnicos trabajando en el mismo ticket de Autotask',
    // 'alarms' es imprescindible: sin él chrome.alarms queda undefined y la llamada
    // a chrome.alarms.create() del keep-alive tira un TypeError síncrono que mata al
    // service worker en el arranque ("Service worker registration failed. Status
    // code: 15"), lo que a su vez deja a los content scripts sin puente.
    permissions: ['storage', 'notifications', 'sidePanel', 'tabs', 'scripting', 'alarms'],
    action: {},
    host_permissions: ['https://netsus-two.vercel.app/*'],
  },
});
