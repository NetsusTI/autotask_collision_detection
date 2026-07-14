# Autotask CoView

Extensión de Chrome para detectar colisiones entre técnicos trabajando en el mismo ticket de Autotask simultáneamente.

## ¿Qué hace?

Cuando dos técnicos abren el mismo ticket al mismo tiempo, el segundo ve un banner de alerta en la parte superior de la página. El ticket queda bloqueado para evitar modificaciones simultáneas. Cuando el primer técnico termina, el segundo recibe una notificación de que ya puede trabajar.

## Componentes

- **Extensión de Chrome** — detecta el ticket activo y muestra alertas en tiempo real
- **API en Vercel** — registra la presencia de cada técnico con TTL automático en Redis
- **Panel de administración** — `netsus-two.vercel.app/admin` muestra todas las colisiones activas en tiempo real

## Instalación de la extensión

1. Descarga el `.zip` desde `ticket_lock_wxt/.output/`
2. Ve a `chrome://extensions/`
3. Activa **Modo desarrollador**
4. Arrastra el `.zip` o usa **Cargar extensión sin empaquetar** apuntando a `.output/chrome-mv3/`
5. Abre la extensión y escribe tu nombre

## Deploy

Requiere variables de entorno en Vercel:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
TICKET_LOCK_API_KEY=...
```

Para deployar:

```bash
vercel --prod
```

## Tecnologías

- WXT (extensión Chrome MV3)
- Next.js 16 + TypeScript
- Upstash Redis (presencia con TTL)
- Vercel (hosting serverless)

---

Desarrollado por Netsus · Innovación Tecnológica — 2026
