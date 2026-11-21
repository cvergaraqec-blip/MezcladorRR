# Mezclador RadioRun: sirve esta carpeta en http://localhost:8099 y abre el navegador.
# No instala nada: usa lo que ya trae Windows. Se cierra con "Cerrar Mezclador.bat".
param([int]$Port = 8099, [switch]$NoBrowser)
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path)).TrimEnd('\') + '\'
$url = "http://localhost:$Port/"
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add($url)
try { $l.Start() } catch { if (-not $NoBrowser) { Start-Process $url }; exit }
if (-not $NoBrowser) { Start-Process $url }
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.wav'='audio/wav'; '.mp3'='audio/mpeg'; '.css'='text/css'; '.png'='image/png'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }
while ($l.IsListening) {
  try {
    $c = $l.GetContext()
    $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
    if ($p -eq '') { $p = 'index.html' }
    $f = [IO.Path]::GetFullPath((Join-Path $root $p))
    if ($c.Request.HttpMethod -eq 'GET' -and $f.StartsWith($root) -and (Test-Path -LiteralPath $f -PathType Leaf)) {
      $b = [IO.File]::ReadAllBytes($f)
      $e = [IO.Path]::GetExtension($f).ToLower()
      $c.Response.ContentType = $(if ($types.ContainsKey($e)) { $types[$e] } else { 'application/octet-stream' })
      $c.Response.Headers.Add('Cache-Control', 'no-cache')
      $c.Response.ContentLength64 = $b.Length
      $c.Response.OutputStream.Write($b, 0, $b.Length)
    } else { $c.Response.StatusCode = 404 }
    $c.Response.Close()
  } catch { }
}
