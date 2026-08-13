# Despliegue a las stores (Chrome Web Store, Edge Add-ons, Firefox AMO) — no listada

La extensión todavía **no está instalada en ninguna máquina de técnico** —
esto es un primer despliegue, no una migración con instalaciones que
preservar. Ya se aplicaron los cambios de código que dependían de esto (ver
"Ya hecho" abajo); lo que queda es todo lo que pasa fuera del repo: cuentas,
subida a cada store, y activar la política en las máquinas reales.

## Decisiones

- **Visibilidad: No listada / Unlisted en las 3 stores.** No aparece en
  búsquedas; se instala solo por ID directo o por política empresarial (que
  es como se va a instalar acá).
- **Auto-deploy en cada release.** Un tag `vX.Y.Z` dispara el job
  `publish-extension` en `.github/workflows/ci.yml`, que builda, empaqueta y
  sube el paquete a las 3 stores. La propagación real a las máquinas sigue
  dependiendo de: (a) que la store apruebe la revisión, y (b) el ciclo de
  chequeo de `ExtensionInstallForcelist` (dentro de unas horas, no
  instantáneo) — el pipeline automatiza la subida, no la revisión humana de
  cada store.

## Ya hecho (en este repo)

- [wxt.config.ts](../wxt.config.ts): se sacaron `key` y `update_url`.
  **Corrección sobre una versión anterior de esta guía:** Chrome Web Store
  rechaza de plano cualquier manifest con el campo `key` ("No se admite el
  campo key en el archivo de manifiesto") — no hay forma de fijar el ID de
  antemano subiendo a la store. Como no hay instalaciones previas que
  preservar (ver arriba), esto no es un problema — cada store va a asignar su
  propio ID, y Chrome/Edge van a terminar con IDs **distintos entre sí**
  (a diferencia de lo que se podía hacer con el esquema self-hosted, donde
  ambos compartían el mismo `.pem`).
- [deploy-policy.ps1](deploy-policy.ps1): apunta a las URLs oficiales de
  auto-update de cada store (`clients2.google.com` para Chrome,
  `edge.microsoft.com` para Edge) en vez de a Vercel. Los IDs quedaron como
  placeholders (`$ChromeExtensionId` / `$EdgeExtensionId`) — hay que
  completarlos a mano con lo que asigne cada dashboard (paso 2 abajo) antes
  de correr el script en una máquina real.
- [ci.yml](../../.github/workflows/ci.yml): job `publish-extension`, gatillado
  por tags `v*`, que builda + zipea + corre `wxt submit` contra las 3 stores.
  Queda inerte (falla al llegar a `wxt submit`) hasta que existan los secrets
  de la sección 3.

Firefox no necesita nada de esto: su ID ya está fijo por
`browser_specific_settings.gecko.id: 'coview@netsus.cl'`, independiente de
dónde se publique.

El repo se maneja con **pnpm** (workspace declarado en
`pnpm-workspace.yaml`, raíz + `ticket_lock_wxt`, un solo `pnpm-lock.yaml`).
`npm ci`/`npm run` ya no aplican en ningún paso de este documento ni de
`ci.yml`/`pack-and-publish.sh`.

## Lo que falta — pasos manuales, en orden

### 1. Cuentas de developer (una vez, cuenta de equipo, no personal)

| Store | Dónde | Costo |
|---|---|---|
| Chrome Web Store | [Developer Dashboard](https://chrome.google.com/webstore/devconsole) | USD 5 único |
| Edge Add-ons | [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge) | Gratis |
| Firefox AMO | [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) | Gratis |

### 2. Primera subida manual a cada store

```bash
cd ticket_lock_wxt
pnpm run compile
pnpm run build         && pnpm run zip
pnpm run build:edge    && pnpm run zip:edge
pnpm run build:firefox && pnpm run zip:firefox
```

**Chrome Web Store:** Dashboard → "New item" → subir `.output/*-chrome.zip` →
Distribución **Unlisted** → **anotar el ID que asigna el dashboard** (va en
`$ChromeExtensionId` de `deploy-policy.ps1`, paso 4). Completar:
- Ícono 128×128 (`public/icon/128.png`), al menos 1 screenshot (1280×800 o
  640×400).
- Pestaña "Privacy": *single purpose* (una frase: detecta colisiones entre
  técnicos en tickets de Autotask) + justificación de cada permiso
  (`storage`, `notifications`, `tabs`, `scripting`, `alarms`, `sidePanel`,
  `host_permissions` a `netsus-two.vercel.app`, content script en
  `*.autotask.net`) + **URL de política de privacidad** (obligatoria — página
  simple, puede vivir en el mismo Vercel).
- Enviar a revisión.

**Edge Add-ons (Partner Center):** mismo flujo con `*-edge.zip`, visibilidad
**Unlisted**. Anotar también el ID que asigna (va en `$EdgeExtensionId`) —
va a ser un ID distinto al de Chrome, es esperado.

**Firefox (AMO):** "Submit a New Add-on" → **"On your own"**
(self-distribution/no listada) → subir el zip de `zip:firefox` + el zip de
fuentes que WXT genera junto a él (necesario porque el código está
bundleado). Firma automática en la mayoría de los casos; revisión manual solo
si el validador detecta algo (permisos nuevos, código sin fuentes claras).

### 3. Credenciales para publicar sin intervención manual (CI)

Cargar como secrets del repo (Settings → Secrets and variables → Actions):

- **Chrome**: proyecto en Google Cloud Console con la Chrome Web Store API
  habilitada → OAuth client (tipo "Desktop") → flujo de refresh token una vez
  (offline) → `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
  `CHROME_REFRESH_TOKEN`, `CHROME_EXTENSION_ID`.
- **Edge**: Partner Center → API access → `EDGE_CLIENT_ID`,
  `EDGE_CLIENT_SECRET`, `EDGE_ACCESS_TOKEN_URL`, `EDGE_PRODUCT_ID`.
- **Firefox**: addons.mozilla.org/developers → "Manage API Keys" →
  `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `FIREFOX_EXTENSION_ID`.

> ⚠️ Antes de confiar en el job `publish-extension` tal como quedó en
> `ci.yml`: correr localmente `pnpm exec wxt submit --help` y
> `pnpm exec wxt submit init` (genera un `.env.submit` con las variables que
> espera la versión de `wxt` instalada, `^0.20.27`) y confirmar que los nombres de
> flags coinciden. Ajustar el step "Submit a las 3 stores" si no coinciden —
> la lógica de fondo (zips por navegador + credenciales por store) es
> estable, los flags puntuales no los verifiqué contra esta versión exacta.

### 4. Activar la instalación real en las máquinas

Una vez aprobadas las 3 (o al menos Chrome/Edge, que es lo que usa
`deploy-policy.ps1`):

```powershell
# Como administrador, vía RMM (recomendado) o a mano, en cada máquina de técnico:
release/deploy-policy.ps1
```

Es idempotente — se puede correr antes de que las stores aprueben sin que
pase nada malo, y una vez aprobadas, Chrome/Edge instalan solos dentro de las
próximas horas.

### 5. Primer release real vía CI

```bash
git tag v1.6.0
git push origin v1.6.0
```

Dispara `publish-extension`. Revisar el resultado en Actions — si alguna
store rechaza el paquete, no hay reintento automático razonable: hay que
mirar el dashboard de esa store, corregir lo que pida, y taguear de nuevo.

## Checklist antes de considerar esto en producción

- [ ] IDs reales de Chrome Web Store y Edge Add-ons anotados y cargados en
      `$ChromeExtensionId`/`$EdgeExtensionId` de `deploy-policy.ps1` — van a
      ser distintos entre sí, y distintos del ID del `.crx` self-hosted viejo
      (`gkjaccjlghmeciimpckedphcjaaaabhj`, que ya no aplica a este flujo).
      Firefox sigue siendo `coview@netsus.cl`, ese no cambia.
- [ ] Página de política de privacidad publicada y linkeada en las 3 fichas.
- [ ] `deploy-policy.ps1` corrido en al menos una máquina de prueba,
      confirmando instalación real desde la store.
- [ ] Un release de prueba (tag) corrido de punta a punta antes del primer
      release real con técnicos dependiendo de él.
- [ ] Decidir si `release/coview-signing-key.pem` y `pack-and-publish.sh`
      (el `.crx` self-hosted original) siguen teniendo algún uso ahora que la
      distribución es 100% vía stores, o se pueden retirar — ya no cumplen
      ningún rol en fijar el ID de Chrome/Edge.
