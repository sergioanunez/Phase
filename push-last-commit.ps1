# Fix "Everything up-to-date" when pushing
# ==========================================
# "Everything up-to-date" means: there is NO local commit that the remote doesn't have.
# So either (1) you never committed your changes, or (2) you already pushed.
# This script: shows status, COMMITS any unstaged changes, then PUSHES.
# Run from project root: .\push-last-commit.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== 1. Current status ===" -ForegroundColor Cyan
git status

Write-Host "`n=== 2. Last 3 commits ===" -ForegroundColor Cyan
git log -3 --oneline

Write-Host "`n=== 3. Unpushed commits (if empty, push will say 'Everything up-to-date') ===" -ForegroundColor Cyan
$branch = git rev-parse --abbrev-ref HEAD
$remoteRef = "origin/$branch"
$unpushed = git log $remoteRef..HEAD --oneline 2>$null
if ($unpushed) {
  $unpushed
} else {
  Write-Host "(none - so 'git push' has nothing to send)"
}

Write-Host "`n=== 4. Staging all known changed files ===" -ForegroundColor Cyan
$files = @(
  "lib/twilio.ts",
  "app/api/sms/webhook/route.ts",
  "components/task-modal.tsx",
  "app/admin/page.tsx",
  "components/edit-user-dialog.tsx",
  "app/api/tasks/[id]/send-confirmation/route.ts",
  "app/super-admin/companies/page.tsx",
  "app/api/super-admin/companies/[companyId]/route.ts"
)
foreach ($f in $files) {
  if (Test-Path -LiteralPath $f) { git add $f; Write-Host "  added $f" }
}

Write-Host "`n=== 5. Status after staging ===" -ForegroundColor Cyan
git status --short

$staged = git diff --cached --name-only
if ($staged) {
  Write-Host "`n=== 6. Committing and pushing ===" -ForegroundColor Green
  git commit -m "fix: SMS confirmation (lenient Y/YES, logging, tooltip); admin phone display; super-admin delete"
  git push
  Write-Host "`nDone. Check Vercel for new deploy." -ForegroundColor Green
} else {
  Write-Host "`nNo staged changes. Either:" -ForegroundColor Yellow
  Write-Host "  - All changes are already committed. Run: git push"
  Write-Host "  - Or your edits are in other files. Run: git status"
  git push
}
