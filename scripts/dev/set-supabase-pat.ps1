<#
.SYNOPSIS
  Stocke un Personal Access Token Supabase en variable d'environnement
  utilisateur — utilisé par les opérations Management API (push email
  templates, update auth config, etc.).

.DESCRIPTION
  Le PAT n'est PAS stocké en clair dans le repo ni dans l'historique
  PowerShell : on le saisit dans un Read-Host -AsSecureString puis on
  le pose dans HKEY_CURRENT_USER\Environment via .NET.

  Une fois posé, toute nouvelle session PowerShell (et tout outil qui
  lit User-level env vars) verra `$env:SUPABASE_PAT`.

.EXAMPLE
  PS> .\scripts\dev\set-supabase-pat.ps1
  (saisit le PAT, validation immédiate)

  Plus tard, dans n'importe quelle session :
  PS> $env:SUPABASE_PAT  # affiche le token
#>
[CmdletBinding()]
param(
  [switch]$Clear  # passer -Clear pour supprimer la variable
)

if ($Clear) {
  [Environment]::SetEnvironmentVariable('SUPABASE_PAT', $null, 'User')
  Write-Host "✓ SUPABASE_PAT supprimé du profil utilisateur." -ForegroundColor Yellow
  Write-Host "  (Ouvrez une nouvelle session pour que le changement soit pris en compte.)" -ForegroundColor DarkGray
  return
}

Write-Host ""
Write-Host "Configuration du Personal Access Token Supabase" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Le PAT (format sbp_xxxx) sera stocké en variable d'environnement" -ForegroundColor Gray
Write-Host "utilisateur Windows. Il N'apparaîtra PAS dans l'historique PowerShell." -ForegroundColor Gray
Write-Host ""
Write-Host "Génère le sur : https://supabase.com/dashboard/account/tokens" -ForegroundColor Gray
Write-Host ""

# Read as SecureString so the value is masked + never lands in PSReadLine history.
$secure = Read-Host -Prompt 'Colle ton PAT (saisie masquée)' -AsSecureString
if (-not $secure -or $secure.Length -eq 0) {
  Write-Host "✗ Saisie vide — abandon." -ForegroundColor Red
  exit 1
}

# Convert SecureString → plain string only in-memory, never logged.
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Format check
if ($plain -notmatch '^sbp_[a-f0-9]{40,}$') {
  Write-Host "✗ Le PAT ne ressemble pas à un token Supabase (attendu: sbp_xxxx 40+ chars)." -ForegroundColor Red
  Write-Host "  Reçu: $($plain.Substring(0,[Math]::Min(8,$plain.Length)))…" -ForegroundColor DarkGray
  exit 1
}

# Quick sanity check — call the management API to verify the PAT works.
Write-Host ""
Write-Host "Validation auprès de l'API Supabase..." -ForegroundColor Gray
try {
  $check = Invoke-RestMethod `
    -Method GET `
    -Uri 'https://api.supabase.com/v1/projects' `
    -Headers @{ Authorization = "Bearer $plain" } `
    -TimeoutSec 10
  $count = ($check | Measure-Object).Count
  Write-Host "✓ PAT valide. $count projet(s) accessible(s)." -ForegroundColor Green
} catch {
  Write-Host "✗ La validation a échoué : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  Le PAT est peut-être révoqué ou mal copié. Variable non posée." -ForegroundColor DarkGray
  exit 1
}

# Persist as user-level env var (visible in all future PowerShell + dev tools).
[Environment]::SetEnvironmentVariable('SUPABASE_PAT', $plain, 'User')
# Aussi disponible dans la session courante.
$env:SUPABASE_PAT = $plain

Write-Host ""
Write-Host "✓ Variable utilisateur SUPABASE_PAT posée." -ForegroundColor Green
Write-Host "  Elle est disponible immédiatement dans cette session, et" -ForegroundColor DarkGray
Write-Host "  automatiquement dans toute nouvelle session PowerShell." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Pour la supprimer plus tard :" -ForegroundColor DarkGray
Write-Host "  .\scripts\dev\set-supabase-pat.ps1 -Clear" -ForegroundColor DarkGray
Write-Host ""

# Clean up the plain-text variable from memory (best effort).
$plain = $null
[GC]::Collect()
