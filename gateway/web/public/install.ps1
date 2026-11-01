# abdalgani one-line installer (Windows PowerShell)
#   $env:ABDALGANI_API_KEY="sk-abd-..."; irm https://api.abdalgani.com/install.ps1 | iex; abdalgani-setup --tool OpenCode
$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/abdalganih1/Oh-My-abdalgani-code.git'
$Root = if ($env:ABDALGANI_HOME) { $env:ABDALGANI_HOME } else { Join-Path $HOME '.abdalgani' }
$Dir  = Join-Path $Root 'Oh-My-abdalgani-code'

function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
try { Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force } catch {}
# DNS: if github.com / npm / the gateway don't resolve, switch the active adapters to 1.1.1.1 / 8.8.8.8 (needs admin).
# Opt out: $env:ABDALGANI_NO_DNS_FIX = '1'
function Test-Dns { foreach ($h in 'api.abdalgani.com','github.com','registry.npmjs.org') { try { [Net.Dns]::GetHostEntry($h) | Out-Null } catch { return $false } }; return $true }
if ($env:ABDALGANI_NO_DNS_FIX -ne '1' -and -not (Test-Dns)) {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($admin) {
    Write-Host '→ DNS resolves nothing — switching the active network adapters to 1.1.1.1 / 8.8.8.8'
    Get-NetAdapter | Where-Object Status -eq 'Up' | Set-DnsClientServerAddress -ServerAddresses 1.1.1.1,8.8.8.8
    Clear-DnsClientCache
    if (Test-Dns) { Write-Host '✅ DNS fixed' -ForegroundColor Green } else { Write-Host '⚠️ still no DNS — a firewall may block port 53' -ForegroundColor Yellow }
  } else {
    Write-Host '⚠️ DNS is broken — open PowerShell as Administrator and re-run, or see https://github.com/abdalganih1/Oh-My-abdalgani-code#dns' -ForegroundColor Yellow
  }
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host '→ installing Git'; winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements; Refresh-Path }
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) { $nodeOk = [int]((node -e "console.log(process.versions.node.split('.')[0])")) -ge 20 }
if (-not $nodeOk) { Write-Host '→ installing Node.js LTS'; winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements; Refresh-Path }

New-Item -ItemType Directory -Force -Path $Root | Out-Null
if (Test-Path (Join-Path $Dir '.git')) { git -C $Dir pull --ff-only --quiet } else { git clone --depth 1 --quiet $Repo $Dir }
Push-Location $Dir; npm install --silent --no-audit --no-fund; Pop-Location

# permanent command (cmd + PowerShell): %LOCALAPPDATA%\abdalgani\bin\abdalgani-setup.cmd on the user PATH
$Bin = Join-Path ($env:LOCALAPPDATA) 'abdalgani\bin'
New-Item -ItemType Directory -Force -Path $Bin | Out-Null
Set-Content -Path (Join-Path $Bin 'abdalgani-setup.cmd') -Encoding ASCII -Value "@echo off`r`nnode `"$Dir\setup.js`" %*"
$userPath = [Environment]::GetEnvironmentVariable('Path','User')
if (($userPath -split ';') -notcontains $Bin) { [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $Bin), 'User') }
if (($env:Path -split ';') -notcontains $Bin) { $env:Path += ';' + $Bin }
function global:abdalgani-setup { node (Join-Path $Dir 'setup.js') @args }
Write-Host "✅ Ready. Run:  abdalgani-setup            (interactive)" -ForegroundColor Green
Write-Host "            or  abdalgani-setup --tool OpenCode --api-key sk-abd-..." -ForegroundColor Green
