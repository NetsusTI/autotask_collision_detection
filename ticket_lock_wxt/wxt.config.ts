import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Chrome/Edge (mismo motor, misma manifest.json) usan sidePanel nativo. Firefox no
  // tiene chrome.sidePanel — WXT genera sidebar_action automáticamente a partir del
  // mismo entrypoint entrypoints/sidepanel/ (ver node_modules/wxt/dist/core/utils/
  // manifest.mjs), así que el HTML/JS del panel no necesita ningún cambio; solo hay
  // que evitar declarar el permiso 'sidePanel' (Chrome-only) en el build de Firefox.
  manifest: ({ browser }) => ({
    name: 'Autotask CoView',
    // Subir esta versión en cada build permite confirmar de un vistazo, en
    // chrome://extensions, si Chrome está corriendo el build nuevo o uno viejo.
    version: '1.4.3',
    description: 'Detecta colisiones entre técnicos trabajando en el mismo ticket de Autotask',
    // 'alarms' es imprescindible: sin él chrome.alarms queda undefined y la llamada
    // a chrome.alarms.create() del keep-alive tira un TypeError síncrono que mata al
    // service worker en el arranque ("Service worker registration failed. Status
    // code: 15"), lo que a su vez deja a los content scripts sin puente.
    permissions: [
      'storage', 'notifications', 'tabs', 'scripting', 'alarms',
      ...(browser === 'firefox' ? [] : ['sidePanel']),
    ],
    action: {},
    host_permissions: ['https://netsus-two.vercel.app/*'],
    // Requerido por Firefox para firmar/instalar de forma permanente (sin esto,
    // "Cargar complemento temporal" en about:debugging funciona igual, pero cada
    // recarga genera un ID nuevo). No afecta a Chrome/Edge, que ignoran este campo.
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'coview@netsus.cl',
          strict_min_version: '109.0',
        },
      },
    } : {}),
  }),
  // El aviso de "data_collection_permissions" solo aplica a extensiones nuevas que
  // se publican en addons.mozilla.org — esta build es para carga interna del equipo
  // (about:debugging → Cargar complemento temporal), no para la tienda de Firefox.
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  // Sourcemaps en el build: sin esto, los stack traces de chrome://extensions apuntan
  // a una línea de bundle minificado y hay que ingeniería-inversa para ubicarlos.
  // Con esto, "Ver en DevTools" salta directo a la línea real de content.ts.
  vite: () => ({
    build: { sourcemap: true },
  }),
});
