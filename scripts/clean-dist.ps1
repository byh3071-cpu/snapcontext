$Root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$Target = Join-Path $Root 'dist'

if (Test-Path -LiteralPath $Target) {
  Remove-Item -LiteralPath $Target -Recurse -Force
}
