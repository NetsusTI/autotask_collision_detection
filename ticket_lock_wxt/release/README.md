# Auto-actualización de la extensión (Chrome/Edge)

Antes: cada push había que avisar a cada técnico "recarga la extensión". Ahora,
en las máquinas donde se aplicó la política de una vez (ver abajo), Chrome/Edge
la instalan y actualizan solos — sin que el técnico haga nada.

## Cómo funciona

1. La extensión está firmada con una clave privada fija
   (`release/coview-signing-key.pem`, fuera del repo — ver `.gitignore`). Esa
   clave es lo único que hace que el **ID de la extensión** sea siempre el
   mismo entre builds: `gkjaccjlghmeciimpckedphcjaaaabhj`.
2. `wxt.config.ts` declara `update_url` apuntando a
   `https://netsus-two.vercel.app/extension/updates.xml` (Chrome/Edge revisan
   esa URL solos, cada pocas horas).
3. `public/extension/updates.xml` + `public/extension/coview.crx` (ambos
   servidos por Vercel desde `public/`, el mismo repo/deploy de siempre) son
   lo que Chrome/Edge leen para saber si hay versión nueva y de dónde bajarla.
4. En cada máquina de técnico se aplicó UNA VEZ (`deploy-policy.ps1`, ver
   abajo) la política `ExtensionInstallForcelist` de Chrome y Edge, que les
   dice "esta extensión, instálala y mantenla al día sola".

Chrome/Edge y Firefox son mundos separados en esto — ver la nota de Firefox
más abajo.

## Publicar una actualización

1. Subir `version` en `wxt.config.ts` (Chrome ignora `update_url` si la
   versión nueva no es *mayor* a la que ya está instalada — este paso es
   obligatorio, no cosmético, en este flujo).
2. Desde `ticket_lock_wxt/`: `bash release/pack-and-publish.sh`
   (type-check + build de los 3 navegadores + empaquetado firmado del
   `.crx` + reescribe `public/extension/updates.xml` con la versión nueva +
   regenera los zips de instalación manual/Firefox).
3. `git add -A && git commit && git push` (esto incluye
   `public/extension/coview.crx` y `updates.xml` — sin commitear/pushear
   esos dos archivos, Vercel sigue sirviendo la versión vieja y nadie recibe
   la actualización).
4. Listo — los técnicos con la política aplicada quedan al día solos, en
   general dentro de las próximas horas (Chrome no lo hace instantáneo).

## Activar esto en una máquina de técnico (una sola vez)

Correr `release/deploy-policy.ps1` como administrador en esa máquina — vía
RMM (recomendado, push remoto silencioso) o a mano. Es idempotente, se puede
re-correr sin problema. Si el técnico ya tenía la extensión cargada a mano
("Cargar descomprimida"), conviene sacar esa copia después de que aparezca la
instalada por política, para que no queden dos iconos.

## ⚠️ La clave privada es el punto único de falla

`release/coview-signing-key.pem` (gitignored, generada 2026-08-12) es lo que
mantiene el mismo ID de extensión entre versiones. **Hay que respaldarla en
un lugar seguro** (gestor de contraseñas, vault, etc.) — si se pierde, el
próximo build necesita una clave nueva → un ID nuevo → hay que volver a tocar
la política en cada máquina y las instalaciones viejas quedan huérfanas (no
se actualizan solas a la nueva). No hay forma de recuperar la clave perdida.

## Firefox no queda cubierto por esto

El auto-update de complementos fuera de addons.mozilla.org en Firefox estable
exige que Mozilla firme el `.xpi` (o un build "unbranded"/ESR con política
empresarial distinta) — es un mecanismo separado del de Chrome/Edge y no se
resolvió en este cambio. Los técnicos en Firefox siguen necesitando recargar
manualmente (`about:debugging` → Recargar) por ahora.
