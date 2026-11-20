# Comparte el Mezclador (http://localhost:8099) con tu socio por internet, con un túnel
# gratis de Cloudflare. Pide clave: el enlace y la clave quedan en el Escritorio, en
# "mezclador-radiorun.txt". El enlace cambia cada vez que se reinicia el PC; la clave no.
# Para dejar de compartir: cierra "cloudflared" en el Administrador de tareas.
$ErrorActionPreference = 'Stop'
# Enlace FIJO (gratis) con ngrok: si en esta carpeta están "ngrok-token.txt" (el authtoken de tu
# cuenta de ngrok, lo pegas tú; no se sube a ningún lado) y "ngrok-dominio.txt" (tu dominio gratis,
# p. ej. algo.ngrok-free.app), se usa ngrok y el enlace no cambia nunca. Si no, Cloudflare (cambia).
$tokFile = Join-Path $PSScriptRoot 'ngrok-token.txt'
$domFile = Join-Path $PSScriptRoot 'ngrok-dominio.txt'
if ((Test-Path $tokFile) -and (Test-Path $domFile)) {
  $ngrok = Join-Path $PSScriptRoot 'ngrok.exe'
  if (-not (Test-Path $ngrok)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $zip = Join-Path $env:TEMP 'ngrok.zip'
    Invoke-WebRequest 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $PSScriptRoot -Force
  }
  $env:NGROK_AUTHTOKEN = (Get-Content $tokFile -Raw).Trim()
  $dom = ((Get-Content $domFile -Raw).Trim() -replace '^https?://', '' -replace '/.*$', '')
  $desk = [Environment]::GetFolderPath('Desktop')
  $keyFile = Join-Path $env:USERPROFILE '.mezclador-clave'
  $ErrorActionPreference = 'Continue'
  while ($true) {
    $clave = if (Test-Path $keyFile) { (Get-Content $keyFile -Raw).Trim() } else { '(abre primero el Mezclador)' }
    @(
      'Mezclador RadioRun, para tu socio',
      '',
      "Enlace:  https://$dom",
      'Usuario: radiorun',
      "Clave:   $clave",
      '',
      'Este enlace es fijo: no cambia aunque reinicies el PC. Funciona mientras el PC esté encendido.',
      'La primera vez ngrok muestra un aviso: pulsa "Visit Site" y luego pon usuario y clave.',
      "Actualizado: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    ) | Set-Content -Path (Join-Path $desk 'mezclador-radiorun.txt') -Encoding UTF8
    $p = Start-Process -FilePath $ngrok -ArgumentList 'http', '--url', "https://$dom", 'http://127.0.0.1:8099', '--log', (Join-Path $env:TEMP 'mezclador-ngrok.log') -WindowStyle Hidden -PassThru
    $p.WaitForExit()
    Start-Sleep -Seconds 10
  }
}
$exe = Join-Path $PSScriptRoot 'cloudflared.exe'
if (-not (Test-Path $exe)) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $exe -UseBasicParsing
}
$desk = [Environment]::GetFolderPath('Desktop')
$txt = Join-Path $desk 'mezclador-radiorun.txt'
$log = Join-Path $env:TEMP 'mezclador-tunel.log'
$keyFile = Join-Path $env:USERPROFILE '.mezclador-clave'
$ErrorActionPreference = 'Continue'  # from here on, a hiccup must never stop the loop
# Is the tunnel really answering? (a quick tunnel can die while cloudflared keeps running:
# "Tunnel not found"). 401 = alive and asking for the password.
function Alive($u) {
  try { Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 20 | Out-Null; return $true }
  catch { $r = $_.Exception.Response; return [bool]($r -and [int]$r.StatusCode -eq 401) }
}
while ($true) {
  Remove-Item $log -ErrorAction SilentlyContinue
  $p = Start-Process -FilePath $exe -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8099', '--logfile', $log -WindowStyle Hidden -PassThru
  $link = $null
  for ($i = 0; $i -lt 60 -and -not $link -and -not $p.HasExited; $i++) {
    Start-Sleep -Seconds 2
    try {
      # Read a copy: cloudflared keeps the log open while it writes.
      $t = [IO.File]::Open($log, 'Open', 'Read', 'ReadWrite'); $sr = New-Object IO.StreamReader($t); $all = $sr.ReadToEnd(); $sr.Close()
      $m = [regex]::Match($all, 'https://[a-z0-9-]+\.trycloudflare\.com'); if ($m.Success) { $link = $m.Value }
    } catch {}
  }
  if ($link) {
    $clave = if (Test-Path $keyFile) { (Get-Content $keyFile -Raw).Trim() } else { '(abre primero el Mezclador)' }
    @(
      'Mezclador RadioRun, para tu socio',
      '',
      "Enlace:  $link",
      'Usuario: radiorun',
      "Clave:   $clave",
      '',
      'Pásale estas tres líneas. El enlace funciona mientras este PC esté encendido.',
      'Si reinicias el PC, el enlace cambia: vuelve a abrir este archivo y pásale el nuevo.',
      "Actualizado: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    ) | Set-Content -Path $txt -Encoding UTF8
  }
  # Watch it: if the link stops answering 3 times in a row, start a new tunnel (new link in the file).
  $fails = 0
  while (-not $p.HasExited) {
    Start-Sleep -Seconds 60
    if ($link -and -not (Alive $link)) { $fails++ } else { $fails = 0 }
    if ($fails -ge 3 -or -not $link) { try { Stop-Process -Id $p.Id -Force } catch {}; break }
  }
  Start-Sleep -Seconds 10
}
