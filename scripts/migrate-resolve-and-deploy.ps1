# If a migration failed because the column/table already exists (P3018),
# mark that migration as applied then run remaining migrations.
#
# Usage: .\scripts\migrate-resolve-and-deploy.ps1
# Requires .env.production with DATABASE_URL and DIRECT_URL (or set them in this session).

$ErrorActionPreference = "Stop"
$projectRoot = Join-Path -Path $PSScriptRoot -ChildPath ".."
$envFile = Join-Path -Path $projectRoot -ChildPath ".env.production"

if (Test-Path $envFile) {
    Write-Host "Loading .env.production..." -ForegroundColor Cyan
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $key = $matches[1]
            $val = $matches[2].Trim().Trim('"').Trim("'")
            Set-Item -Path "Env:$key" -Value $val
        }
    }
}

if (-not $env:DATABASE_URL -or -not $env:DIRECT_URL) {
    Write-Host "ERROR: DATABASE_URL and DIRECT_URL must be set (.env.production or this session)." -ForegroundColor Red
    exit 1
}

Set-Location $projectRoot

# Mark the migration that failed (column "slug" already exists) as already applied
Write-Host "Marking migration 20250211000000_add_company_slug_and_allowed_domains as applied..." -ForegroundColor Cyan
npx prisma migrate resolve --applied "20250211000000_add_company_slug_and_allowed_domains"

Write-Host "Running remaining migrations..." -ForegroundColor Cyan
npx prisma migrate deploy
Write-Host "Done." -ForegroundColor Green
