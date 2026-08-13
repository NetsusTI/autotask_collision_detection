#!/usr/bin/env bash
# Empaqueta la extensión (Chrome/Edge) firmada con la clave persistente y
# publica el .crx + updates.xml para que el auto-update de Chrome/Edge la
# recoja sola — ver release/README.md para el contexto completo y el paso
# único de política que activa esto en cada máquina.
#
# Requisito previo: haber subido `version` en wxt.config.ts respecto al build
# publicado anteriormente (Chrome ignora un update_url si la versión no es
# mayor a la instalada).
set -euo pipefail
cd "$(dirname "$0")/.."   # ticket_lock_wxt/

KEY="release/coview-signing-key.pem"
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
EXTENSION_ID="gkjaccjlghmeciimpckedphcjaaaabhj"
REPO_ROOT="$(cd .. && pwd)"
PUBLIC_DIR="$REPO_ROOT/public/extension"

if [ ! -f "$KEY" ]; then
  echo "Falta $KEY — sin esa clave el ID de la extensión cambiaría y la" >&2
  echo "política de instalación de cada técnico apuntaría a una extensión distinta." >&2
  exit 1
fi

echo "== Type-check =="
pnpm run compile

echo "== Build (chrome/edge/firefox) =="
pnpm run build
pnpm run build:edge
pnpm run build:firefox

echo "== Empaquetado firmado (Chrome/Edge comparten el mismo manifest+key → un solo .crx) =="
"$CHROME" --pack-extension="$(pwd)/.output/chrome-mv3" --pack-extension-key="$(pwd)/$KEY"

VERSION=$(node -pe "require('./.output/chrome-mv3/manifest.json').version")
echo "Versión empaquetada: $VERSION"

mkdir -p "$PUBLIC_DIR"
cp ".output/chrome-mv3.crx" "$PUBLIC_DIR/coview.crx"
cat > "$PUBLIC_DIR/updates.xml" << EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$EXTENSION_ID'>
    <updatecheck codebase='https://netsus-two.vercel.app/extension/coview.crx' version='$VERSION' />
  </app>
</gupdate>
EOF

echo "== Zips para instalación manual / Firefox =="
pnpm run zip
pnpm run zip:edge
pnpm run zip:firefox

echo
echo "Listo. Falta:"
echo "  1) git add public/extension/coview.crx public/extension/updates.xml (+ el resto de los cambios)"
echo "  2) git commit && git push  (Vercel redeploya y sirve el .crx/.xml nuevos)"
echo "  3) Los técnicos con la política ya aplicada quedan al día solos en unas horas —"
echo "     sin esa política, siguen necesitando 'Cargar descomprimida' con los zips de arriba."
