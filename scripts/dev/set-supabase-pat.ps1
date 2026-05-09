<#
.SYNOPSIS
  Stocke un Personal Access Token Supabase en variable d'environnement
  utilisateur, utilise par les operations Management API (push email
  templates, update auth config, etc.).

.DESCRIPTION
  Le PAT n'est PAS stocke en clair dans le repo ni dans l'historique
  PowerShell : on le saisit dans un Read-Host -AsSecureString puis on
  le pose dans HKEY_CURRENT_USER\Environment via .NET.

  Une fois pose, toute nouvelle session PowerShell verra
  $env:SUPABASE_PAT.

.EXAMPLE
  PS> .\scripts\dev\set-supabase-pat.ps1
  (saisit le PAT, validation immediate)

  PS> .\scripts\dev\set-supabase-pat.ps1 -Clear
  (supprime la variable utilisateur)
#>
[CmdletBinding()]
param(
  [switch]$Clear
)

if ($Clear) {
  [Environment]::SetEnvironmentVariable('SUPABASE_PAT', $null, 'User')
  Write-Host "[OK] SUPABASE_PAT supprime du profil utilisateur." -ForegroundColor Yellow
  Write-Host "     (Ouvrez une nouvelle session pour propager le changement.)" -ForegroundColor DarkGray
  return
}

Write-Host ""
Write-Host "Configuration du Personal Access Token Supabase" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Le PAT (format sbp_xxxx) sera stocke en variable utilisateur Windows." -ForegroundColor Gray
Write-Host "Saisie masquee : il n'apparait PAS dans l'historique PowerShell." -ForegroundColor Gray
Write-Host ""
Write-Host "Genere le sur : https://supabase.com/dashboard/account/tokens" -ForegroundColor Gray
Write-Host ""

$secure = Read-Host -Prompt 'Colle ton PAT (saisie masquee)' -AsSecureString
if (-not $secure -or $secure.Length -eq 0) {
  Write-Host "[KO] Saisie vide -- abandon." -ForegroundColor Red
  exit 1
}

# Convert SecureString -> plain string in-memory only, never logged.
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
}
finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Format check
if ($plain -notmatch '^sbp_[a-f0-9]{40,}$') {
  Write-Host "[KO] Le PAT ne ressemble pas a un token Supabase (attendu: sbp_xxxx, 40+ chars)." -ForegroundColor Red
  if ($plain.Length -gt 0) {
    $preview = $plain.Substring(0, [Math]::Min(8, $plain.Length))
    Write-Host "     Recu: $preview..." -ForegroundColor DarkGray
  }
  exit 1
}

Write-Host ""
Write-Host "Validation aupres de l'API Supabase..." -ForegroundColor Gray
try {
  $check = Invoke-RestMethod -Method GET -Uri 'https://api.supabase.com/v1/projects' -Headers @{ Authorization = "Bearer $plain" } -TimeoutSec 10
  $count = ($check | Measure-Object).Count
  Write-Host "[OK] PAT valide. $count projet(s) accessible(s)." -ForegroundColor Green
}
catch {
  Write-Host "[KO] La validation a echoue : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "     Le PAT est peut-etre revoque ou mal copie. Variable NON posee." -ForegroundColor DarkGray
  exit 1
}

[Environment]::SetEnvironmentVariable('SUPABASE_PAT', $plain, 'User')
$env:SUPABASE_PAT = $plain

Write-Host ""
Write-Host "[OK] Variable utilisateur SUPABASE_PAT posee." -ForegroundColor Green
Write-Host "     Disponible immediatement dans cette session, et automatiquement" -ForegroundColor DarkGray
Write-Host "     dans toute nouvelle session PowerShell." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Pour la supprimer plus tard :" -ForegroundColor DarkGray
Write-Host "  .\scripts\dev\set-supabase-pat.ps1 -Clear" -ForegroundColor DarkGray
Write-Host ""

$plain = $null
[GC]::Collect()
