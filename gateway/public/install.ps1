# abdalgani one-line installer (Windows PowerShell)
#   $env:ABDALGANI_API_KEY="sk-abd-..."; irm https://api.abdalgani.com/install.ps1 | iex; abdalgani-setup --tool OpenCode
$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/abdalganih1/Oh-My-abdalgani-code.git'
$Root = if ($env:ABDALGANI_HOME) { $env:ABDALGANI_HOME } else { Join-Path $HOME '.abdalgani' }
$Dir  = Join-Path $Root 'Oh-My-abdalgani-code'

function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
try { Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force } catch {}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host '→ installing Git'; winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements; Refresh-Path }
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) { $nodeOk = [int]((node -p "process.versions.node.split('.')[0]")) -ge 20 }
if (-not $nodeOk) { Write-Host '→ installing Node.js LTS'; winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements; Refresh-Path }

New-Item -ItemType Directory -Force -Path $Root | Out-Null
if (Test-Path (Join-Path $Dir '.git')) { git -C $Dir pull --ff-only --quiet } else { git clone --depth 1 --quiet $Repo $Dir }
Push-Location $Dir; npm install --silent --no-audit --no-fund; Pop-Location

function global:abdalgani-setup { node (Join-Path $Dir 'setup.js') @args }
Write-Host "✅ Ready. Run:  abdalgani-setup            (interactive)" -ForegroundColor Green
Write-Host "            or  abdalgani-setup --tool OpenCode --api-key sk-abd-..." -ForegroundColor Green
