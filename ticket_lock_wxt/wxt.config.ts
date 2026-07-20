import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Autotask CoView',
    description: 'Detecta colisiones entre técnicos trabajando en el mismo ticket de Autotask',
    permissions: ['storage', 'notifications', 'sidePanel', 'tabs'],
    host_permissions: ['https://netsus-two.vercel.app/*'],
  },
});
