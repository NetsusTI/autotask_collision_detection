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
    // Además: en Chrome/Edge esta es la versión que decide si hay auto-update —
    // ver release/README.md. Sin subirla, un release nuevo no se propaga solo.
    version: '1.5.0',
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
    // Chrome/Edge: clave pública fija (release/coview-signing-key.pem, fuera del
    // repo) para que el ID de la extensión sea siempre el mismo entre builds, y
    // update_url para que el navegador la revise solo — ver release/README.md
    // para el paso único de política (ExtensionInstallForcelist) que activa esto
    // en cada máquina. Sin ese "key" el ID cambiaría en cada paquete y la política
    // apuntaría a una extensión distinta cada vez.
    ...(browser === 'firefox' ? {} : {
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsXxZZ2FEgTDUS5Rl7cBBbRnvxVJPdznSYLl8o2hHB/++SWqCcG/5b1UF7mtD5bYRlxpzagEaUIgTyupnexjqDf1gfahYAUEPRcMt8dAG6wH0JH/UzOOEfuUq9DmOb851p7CkCxgabznFy77//X7veQ9zg/FDfuJxQx2l5wWsynJqEFaDdBLE8UaZjnhnTVgdCAc+WqkVTfl4veEYLfeNVvXnX2hyGRM8pKTXMujzxbAgmdDnmthLt9F6nBI8acXk9jpyZ02HUfRLHbKmLbbZZL6H9LW0D9eg+S7lCk+P8uSwhF+hlohgXbaALcxR+a1X/WLamvXAFWqf3Hwx4upA4QIDAQAB',
      update_url: 'https://netsus-two.vercel.app/extension/updates.xml',
    }),
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
