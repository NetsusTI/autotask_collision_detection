# Sistema de Bloqueo de Tickets - Autotask

## Checklist maestro de despliegue (orden recomendado)
1. [ ] Servidor: crear registro DNS `locks.netsus.com` apuntando al servidor propio
2. [ ] Servidor: instalar dependencias (gunicorn incluido) y definir `TICKET_LOCK_API_KEY` → sección "Instalación del servidor"
3. [ ] Servidor: configurar nginx + certbot para `locks.netsus.com` y levantar el servicio con systemd → sección "Despliegue en servidor propio"
4. [ ] Extensión: confirmar `SERVER_URL = 'https://locks.netsus.com'` y la misma API key en `API_KEY` (`background.ts`), recompilar → sección "Instalación / actualización de la extensión"
5. [ ] Probar desde tu PC que el lock funciona contra `https://locks.netsus.com` (no `127.0.0.1`)
6. [ ] Crear cuenta de desarrollador en Chrome Web Store y publicar la extensión como **Privada** → sección "Publicación y distribución"
7. [ ] En Google Admin Console, forzar la instalación de la extensión por ID → misma sección
8. [ ] Listo — los técnicos no necesitan instalar nada más, ni VPN ni Tailscale; solo se loguean en Autotask como siempre

## ¿Qué hace?
Muestra un aviso automático cuando otro técnico tiene abierto el mismo ticket en Autotask, evitando que dos personas trabajen simultáneamente en el mismo caso.

## Componentes
| Componente | Ubicación | Dónde corre |
|---|---|---|
| Servidor de locks | `ticket_lock_server.py` | Servidor Netsus (Python/Flask) |
| Extensión de Chrome | `ticket_lock_wxt/` (proyecto WXT) | Chrome de cada técnico |

La extensión está construida con **WXT** (framework moderno para extensiones de navegador, tipo Vite). El código fuente vive en `ticket_lock_wxt/entrypoints/` y se compila a una carpeta `.output/chrome-mv3/` que es lo que se carga en Chrome.

---

## Por qué la arquitectura tiene 2 partes (content script + background)

Inicialmente se probó con **Tampermonkey**, pero no funcionó de forma confiable (problemas de inyección del script). Se migró a una extensión de Chrome real.

Durante las pruebas con la extensión apareció un bloqueo de seguridad de Chrome llamado **Private Network Access (PNA)**: un sitio público (`https://ww12.autotask.net`) no puede hacer `fetch()` directo a una IP local (`127.0.0.1`) desde el content script, sin importar los headers CORS del servidor.

**Solución:** el `content script` (que corre dentro de la página de Autotask) ya NO llama al servidor directamente. En su lugar, le manda un mensaje al `background script` de la extensión (que sí tiene permisos elevados vía `host_permissions` en el manifest), y este hace la llamada real al servidor Flask.

```
Página Autotask → content.ts → (mensaje interno) → background.ts → fetch al servidor Flask
```

---

## Instalación del servidor

### Requisitos
- Python 3
- Librerías: `flask`, `flask-cors`

### Instalar dependencias
```bash
pip3 install flask flask-cors
```

### Iniciar el servidor (desarrollo/pruebas locales)
```bash
TICKET_LOCK_API_KEY='clave-secreta-aqui' python3 ticket_lock_server.py
```
El servidor queda escuchando en el puerto **5001**. Esto es solo para pruebas — el servidor de desarrollo de Flask trae su propia advertencia de "no usar en producción". Para producción, ver "Despliegue en servidor propio" (gunicorn + nginx).

### Autenticación por API key
Todas las peticiones al servidor (excepto el preflight OPTIONS) deben incluir el header `X-API-Key` con el mismo valor que `TICKET_LOCK_API_KEY`. Si no coincide, el servidor responde `401 Unauthorized`. Esta misma clave debe estar puesta en `ticket_lock_wxt/entrypoints/background.ts` (constante `API_KEY`) y la extensión debe recompilarse después de cualquier cambio de clave.

Si no se define la variable de entorno, el servidor usa por defecto `'CAMBIAR_ESTA_CLAVE'` — **no usar ese valor en producción**.

### Detalle técnico importante
El servidor incluye el header `Access-Control-Allow-Private-Network: true` (vía `@app.after_request`, registrado **antes** de `CORS(app)` para que no quede duplicado/sobreescrito). Esto es necesario para pasar las políticas de seguridad de Chrome, aunque ahora el fetch real lo hace el background script.

---

## Instalación / actualización de la extensión (desarrollo)

### Requisitos
- Node.js (v18+)
- Proyecto en `ticket_lock_wxt/`

### Compilar
```bash
cd ticket_lock_wxt
npm install      # solo la primera vez
npx wxt build
```
Esto genera `ticket_lock_wxt/.output/chrome-mv3/`.

### Cargar en Chrome
1. Ir a `chrome://extensions`
2. Activar **"Modo de desarrollador"** (interruptor arriba a la derecha)
3. Clic en **"Cargar extensión sin empaquetar"**
4. Seleccionar la carpeta `ticket_lock_wxt/.output/chrome-mv3`

### Si se modifica el código
Después de `npx wxt build`, hay que recargar la extensión en `chrome://extensions` (ícono 🔄 en su tarjeta) y luego recargar la pestaña de Autotask (F5).

### Primera vez que se usa
Al abrir un ticket de Autotask por primera vez con la extensión instalada, aparecerá un cuadro (`prompt`) pidiendo el nombre del técnico. Se ingresa una sola vez y queda guardado en `localStorage` del navegador.

### Configurar la dirección del servidor para producción
La URL del servidor está hardcodeada en `ticket_lock_wxt/entrypoints/background.ts`:
```ts
const SERVER_URL = 'http://127.0.0.1:5001';
const API_KEY = '...'; // debe coincidir exactamente con TICKET_LOCK_API_KEY del servidor
```
Para producción, `SERVER_URL` ya está puesto en `https://locks.netsus.com` y `host_permissions` en `wxt.config.ts` incluye `https://locks.netsus.com/*`. Si la API key cambia, actualizar `API_KEY` aquí y recompilar (`npx wxt build`).

---

## Despliegue en servidor propio (locks.netsus.com)

Netsus ya tiene un servidor propio con dominio y HTTPS gestionados (nginx + certbot), así que el servidor de locks se despliega ahí directamente — sin Tailscale, sin VPN, sin nada que instalar en los PCs de los técnicos. La seguridad queda dada por HTTPS + la API key (`X-API-Key`).

Los archivos de despliegue están en `ticket_lock_deploy/` (en este mismo repo):
- `requirements.txt` — dependencias Python (flask, flask-cors, gunicorn)
- `ticket-lock.service` — unidad systemd para correr el servidor con gunicorn
- `locks.netsus.com.nginx.conf` — config de nginx como reverse proxy

### 1. DNS
Agregar un registro **A** (o CNAME si usan algún proxy/CDN) para `locks.netsus.com` apuntando a la IP pública del servidor.

### 2. Preparar el servidor
```bash
ssh tu-usuario@servidor-netsus
sudo mkdir -p /opt/ticket-lock
sudo useradd -r -s /usr/sbin/nologin ticketlock   # usuario sin login, solo para correr el servicio
```
Copiar `ticket_lock_server.py` y `ticket_lock_deploy/requirements.txt` a `/opt/ticket-lock/`, luego:
```bash
cd /opt/ticket-lock
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
sudo chown -R ticketlock:ticketlock /opt/ticket-lock
```

### 3. Definir la API key real
Editar `ticket_lock_deploy/ticket-lock.service` y reemplazar `CAMBIAR_ESTA_CLAVE` por una clave generada, por ejemplo:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```
Esa misma clave va en `API_KEY` dentro de `ticket_lock_wxt/entrypoints/background.ts`.

### 4. Levantar el servicio con systemd
```bash
sudo cp ticket_lock_deploy/ticket-lock.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ticket-lock
sudo systemctl status ticket-lock
```
Esto deja el servidor corriendo en `127.0.0.1:5001` (solo local, no expuesto directo), con reinicio automático si se cae o si el servidor reinicia.

### 5. nginx + HTTPS
```bash
sudo cp ticket_lock_deploy/locks.netsus.com.nginx.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/locks.netsus.com.nginx.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d locks.netsus.com
```
Certbot reescribe automáticamente la config de nginx para servir HTTPS (puerto 443) y redirigir HTTP → HTTPS, además de configurar la renovación automática del certificado.

### 6. Verificar desde afuera
```bash
curl https://locks.netsus.com/status -H "X-API-Key: la-clave-real"
```
Debería responder `{}` (sin locks activos todavía).

### Por qué este enfoque y no Tailscale
Se evaluó usar Tailscale (con o sin Funnel) para el acceso remoto, pero como Netsus ya cuenta con infraestructura propia con dominio y HTTPS, resultó más simple desplegar ahí directamente: nadie necesita instalar nada adicional (ni VPN ni Tailscale) en su PC, y la superficie expuesta es solo este servicio HTTP detrás de HTTPS + API key — el mismo nivel de exposición que cualquier otro servicio interno de la empresa ya publicado en su dominio.

---

## Publicación y distribución de la extensión (Chrome Web Store privado + Google Admin)

Para que la extensión aparezca sola en el Chrome de cada técnico (sin que tengan que activar "Modo de desarrollador" ni saber qué es "Cargar sin empaquetar"), se publica como ítem **privado** del Chrome Web Store y se fuerza su instalación desde Google Admin Console.

### 1. Cuenta de desarrollador en Chrome Web Store
- Entrar a https://chrome.google.com/webstore/devconsole con una cuenta de Google del dominio de la empresa (no personal, para que quede bajo control de la organización).
- Pagar el fee único de registro (USD 5).

### 2. Empaquetar la extensión
```bash
cd ticket_lock_wxt/.output/chrome-mv3
zip -r ../../ticket-lock-extension.zip .
```
Esto genera `ticket_lock_wxt/ticket-lock-extension.zip`, listo para subir.

### 3. Publicar como Privada
- En el devconsole, "Nuevo ítem" → subir el `.zip`.
- Completar nombre, descripción corta e icono (los íconos por defecto de WXT ya están en el build; se pueden reemplazar después).
- En **Visibilidad**, elegir **"Privada"** y restringir a la organización (esta opción solo aparece porque la cuenta es de un dominio Google Workspace) — así nadie fuera de la empresa puede verla ni instalarla, y no aparece en búsquedas públicas.
- Enviar a revisión. Los ítems privados suelen aprobarse rápido (horas, no días).
- Una vez aprobado, copiar el **ID de la extensión** (aparece en la URL del ítem en el devconsole, es un string largo de letras).

### 4. Forzar instalación desde Google Admin Console
- Entrar a https://admin.google.com con una cuenta con permisos de administrador.
- Ir a **Dispositivos → Chrome → Aplicaciones y extensiones → Usuarios y navegadores**.
- Seleccionar la unidad organizativa donde están los técnicos (o toda la organización).
- Clic en el botón **"+"** → **"Agregar Chrome app o extensión por ID"** → pegar el ID copiado en el paso anterior.
- En la política de instalación, elegir **"Forzar instalación"**.
- Guardar.

Con esto, la extensión aparece sola en el Chrome de cada técnico la próxima vez que abran el navegador (puede tardar unos minutos en propagarse), y se actualiza sola cada vez que se suba una nueva versión del `.zip` al devconsole.

### Actualizaciones futuras
Cada vez que se modifique el código (`npx wxt build` + re-empaquetar el zip), hay que subir una nueva versión en el devconsole con el número de versión incrementado en `wxt.config.ts`/`package.json`. Google Admin la distribuye automáticamente a todos los Chrome donde está forzada — no hay que volver a tocar la configuración de Admin Console.

---

## Cómo funciona (flujo normal)

```
Técnico A abre ticket → Extensión registra "Técnico A tiene ticket 12345"
Técnico B abre mismo ticket → Extensión consulta servidor → muestra banner rojo:
   ⚠️ Técnico A tiene este ticket abierto ahora mismo
Técnico A cierra la pestaña → ticket se libera automáticamente
Técnico B recarga → ya no aparece el banner
```

### Detalles técnicos
- El lock se mantiene vivo con un **heartbeat cada 20 segundos**
- Si el técnico cierra el navegador o la pestaña sin liberar, el lock expira automáticamente en **40 segundos**
- El script detecta automáticamente el ticket por la URL (no requiere configuración adicional)

---

## Endpoints del servidor (para diagnóstico)

| Método | URL | Descripción |
|---|---|---|
| GET | `/status` | Ver todos los tickets bloqueados actualmente |
| POST | `/lock/{id}` | Bloquear un ticket |
| DELETE | `/lock/{id}` | Liberar un ticket |
| POST | `/heartbeat/{id}` | Mantener el lock vivo |

### Ejemplo - ver tickets activos
```bash
curl https://locks.netsus.com/status -H "X-API-Key: clave-secreta-aqui"
```

### Ejemplo - simular que otro técnico tiene el ticket (para pruebas)
```bash
curl -X POST https://locks.netsus.com/lock/23964 -H "Content-Type: application/json" -H "X-API-Key: clave-secreta-aqui" -d '{"user":"Técnico de Prueba"}'
```

---

## Solución de problemas

| Problema | Causa | Solución |
|---|---|---|
| No aparece banner | Servidor apagado | Verificar que el servicio esté corriendo (`sudo systemctl status ticket-lock`, `curl https://locks.netsus.com/status`) |
| No pide nombre | Extensión no cargada o deshabilitada | Revisar `chrome://extensions`, que esté activa (toggle azul) |
| Error "blocked by CORS policy... loopback address space" | Private Network Access de Chrome bloqueando fetch directo desde la página | Ya resuelto en esta versión: el fetch lo hace el background script, no el content script |
| Aparece botón rojo "Errores" en la extensión | Algo falló en tiempo de ejecución | Clic en "Errores" para ver el detalle; si dice "Servidor no disponible" y es de antes de reiniciar el servidor, se puede ignorar |
| Lock no se libera | Browser cerrado abruptamente | Esperar 40 segundos, se libera solo |
| Cambios en el código no se reflejan | Falta recompilar o recargar | `npx wxt build` → recargar extensión en `chrome://extensions` → F5 en Autotask |
| Error 401 / "Clave de API incorrecta" en consola | La `API_KEY` de `background.ts` no coincide con `TICKET_LOCK_API_KEY` del servidor | Verificar que ambos valores sean idénticos, recompilar la extensión si se cambió |
| No conecta desde un PC remoto | DNS de `locks.netsus.com` no resuelve, o nginx/certbot mal configurado | Probar `curl https://locks.netsus.com/status` desde fuera de la red de la oficina; revisar `sudo nginx -t` y `sudo systemctl status nginx` |
