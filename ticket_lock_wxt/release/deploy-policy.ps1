# Aplica, en ESTA máquina, la política de Chrome/Edge que instala Autotask
# CoView de forma forzada desde Chrome Web Store / Edge Add-ons (no listada) y
# la mantiene actualizada sola, sin que el técnico haga nada. Correr UNA VEZ
# por máquina, como administrador — vía RMM (push remoto) o a mano.
#
# Requiere que el ítem ya exista en cada store (aunque sea la primera versión
# en revisión) — ver release/README-stores.md. Si se corre antes, la política
# queda cargada pero Chrome/Edge no van a poder instalar hasta que la store
# lo apruebe; no rompe nada, solo no hace efecto todavía.
#
# Chrome Web Store rechaza manifests con el campo "key" (ver
# release/README-stores.md), así que ya no hay forma de fijar el ID de
# antemano: cada store asigna el suyo en el momento de crear el ítem, y
# Chrome/Edge terminan con IDs DISTINTOS entre sí. Completar los dos
# placeholders de abajo con los IDs reales que muestre cada dashboard después
# de la primera subida.
#
# Requiere admin local (escribe en HKLM). Idempotente: correrlo de nuevo no
# rompe nada, solo re-escribe el mismo valor.

$ChromeExtensionId = "odmnjbbdpjncjkkcfialkhkjhpkkmack"
$EdgeExtensionId    = "TODO: ID que asignó Microsoft Partner Center"

# Cada store tiene su propia URL fija de auto-update (no la elegimos
# nosotros, son las oficiales de Google/Microsoft para extensiones
# gestionadas por política).
$ChromeUpdateUrl = "https://clients2.google.com/service/update2/crx"
$EdgeUpdateUrl    = "https://edge.microsoft.com/extensionwebstorebase/v1/crx"

function Set-ForceInstall($BasePath, $ExtensionId, $UpdateUrl) {
    $Path = "$BasePath\ExtensionInstallForcelist"
    New-Item -Path $Path -Force | Out-Null
    $Value = "$ExtensionId;$UpdateUrl"
    # Nombre de valor: cualquier string único por extensión forzada en esta
    # política — "1" alcanza porque hoy solo forzamos esta.
    Set-ItemProperty -Path $Path -Name "1" -Value $Value -Type String
}

Set-ForceInstall "HKLM:\SOFTWARE\Policies\Google\Chrome" $ChromeExtensionId $ChromeUpdateUrl
Set-ForceInstall "HKLM:\SOFTWARE\Policies\Microsoft\Edge" $EdgeExtensionId $EdgeUpdateUrl

Write-Host "Política aplicada. Chrome/Edge instalarán/actualizarán Autotask CoView solos"
Write-Host "(puede tardar unos minutos en aparecer la primera vez; Chrome debe reiniciarse"
Write-Host "o reabrirse para leer la política nueva)."
Write-Host ""
Write-Host "Si el técnico ya la tenía cargada a mano (chrome://extensions -> modo desarrollador"
Write-Host "-> Cargar descomprimida), conviene sacar esa copia manual para que no queden dos iconos."
