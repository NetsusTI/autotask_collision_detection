# Aplica, en ESTA máquina, la política de Chrome/Edge que instala Autotask
# CoView de forma forzada y la mantiene actualizada sola (Chrome/Edge revisan
# update_url solos, sin que el técnico haga nada). Correr UNA VEZ por máquina,
# como administrador — vía RMM (push remoto) o a mano.
#
# Requiere admin local (escribe en HKLM). Idempotente: correrlo de nuevo no
# rompe nada, solo re-escribe el mismo valor.

$ExtensionId = "gkjaccjlghmeciimpckedphcjaaaabhj"
$UpdateUrl   = "https://netsus-two.vercel.app/extension/updates.xml"
$ForcelistValue = "$ExtensionId;$UpdateUrl"

function Set-ForceInstall($BasePath) {
    $Path = "$BasePath\ExtensionInstallForcelist"
    New-Item -Path $Path -Force | Out-Null
    # Nombre de valor: cualquier string único por extensión forzada en esta
    # política — "1" alcanza porque hoy solo forzamos esta.
    Set-ItemProperty -Path $Path -Name "1" -Value $ForcelistValue -Type String
}

Set-ForceInstall "HKLM:\SOFTWARE\Policies\Google\Chrome"
Set-ForceInstall "HKLM:\SOFTWARE\Policies\Microsoft\Edge"

Write-Host "Política aplicada. Chrome/Edge instalarán/actualizarán Autotask CoView solos"
Write-Host "(puede tardar unos minutos en aparecer la primera vez; Chrome debe reiniciarse"
Write-Host "o reabrirse para leer la política nueva)."
Write-Host ""
Write-Host "Si el técnico ya la tenía cargada a mano (chrome://extensions -> modo desarrollador"
Write-Host "-> Cargar descomprimida), conviene sacar esa copia manual para que no queden dos iconos."
