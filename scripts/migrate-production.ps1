# Run Prisma migrations against the production database.
# Requires DATABASE_URL and DIRECT_URL (production) to be set.
#
# Option A - Use .env.production (create it, do not commit):
#   Copy your production URLs from Vercel/Supabase into .env.production:
#     DATABASE_URL="postgresql://..."
#     DIRECT_URL="postgresql://..."
#   Then run: .\scripts\migrate-production.ps1
#
# Option B - Set env vars for this session then run:
#   $env:DATABASE_URL="postgresql://..."
#   $env:DIRECT_URL="postgresql://..."
#   npx prisma migrate deploy

$ErrorActionPreference = "Stop"
$projectRoot = Join-Path -Path $PSScriptRoot -ChildPath ".."
$envFile = Join-Path -Path $projectRoot -ChildPath ".env.production"

if (Test-Path $envFile) {
    Write-Host "Loading .env.production..."
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $key = $matches[1]
            $val = $matches[2].Trim().Trim('"').Trim("'")
            Set-Item -Path "Env:$key" -Value $val
        }
    }
}

if (-not $env:DATABASE_URL) {
    Write-Host "ERROR: DATABASE_URL is not set. Create .env.production with DATABASE_URL and DIRECT_URL, or set them in this session." -ForegroundColor Red
    exit 1
}
if (-not $env:DIRECT_URL) {
    Write-Host "ERROR: DIRECT_URL is not set." -ForegroundColor Red
    exit 1
}

Write-Host "Running migrations against the database (see DATABASE_URL host)..." -ForegroundColor Cyan
Set-Location $projectRoot
npx prisma migrate deploy
Write-Host "Done." -ForegroundColor Green
