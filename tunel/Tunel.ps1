# Comparte el Mezclador (http://localhost:8099) con tu socio por internet, con un túnel
# gratis de Cloudflare. Pide clave: el enlace y la clave quedan en el Escritorio, en
# "Mezclador-socio.txt". El enlace cambia cada vez que se reinicia el PC; la clave no.
# Para dejar de compartir: cierra "cloudflared" en el Administrador de tareas.
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'cloudflared.exe'
if (-not (Test-Path $exe)) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $exe -UseBasicParsing
}
$desk = [Environment]::GetFolderPath('Desktop')
$txt = Join-Path $desk 'Mezclador-socio.txt'
$log = Join-Path $env:TEMP 'mezclador-tunel.log'
$keyFile = Join-Path $env:USERPROFILE '.mezclador-clave'
while ($true) {
  Remove-Item $log -ErrorAction SilentlyContinue
  $p = Start-Process -FilePath $exe -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8099', '--logfile', $log -WindowStyle Hidden -PassThru
  $link = $null
  for ($i = 0; $i -lt 60 -and -not $link -and -not $p.HasExited; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $log) { $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if ($m) { $link = $m.Matches[0].Value } }
  }
  if ($link) {
    $clave = if (Test-Path $keyFile) { (Get-Content $keyFile -Raw).Trim() } else { '(abre primero el Mezclador)' }
    @(
      'Mezclador RadioRun, para tu socio',
      '',
      "Enlace:  $link",
      'Usuario: socio',
      "Clave:   $clave",
      '',
      'Pásale estas tres líneas. El enlace funciona mientras este PC esté encendido.',
      'Si reinicias el PC, el enlace cambia: vuelve a abrir este archivo y pásale el nuevo.',
      "Actualizado: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    ) | Set-Content -Path $txt -Encoding UTF8
  }
  $p.WaitForExit()
  Start-Sleep -Seconds 10
}
