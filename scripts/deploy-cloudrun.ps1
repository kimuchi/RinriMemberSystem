# ============================================================
# Cloud Run デプロイスクリプト (PowerShell)
# 使い方: npm run deploy:cloudrun
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " 倫理法人会 会員管理システム - Cloud Run デプロイ"
Write-Host "=========================================="

# === 設定（環境変数 or デフォルト値） ===
if ($env:GCP_PROJECT_ID) {
    $ProjectId = $env:GCP_PROJECT_ID
} else {
    $ProjectId = (gcloud config get-value project 2>$null)
}
$Region = if ($env:GCP_REGION) { $env:GCP_REGION } else { "asia-northeast1" }
$ServiceName = if ($env:CLOUD_RUN_SERVICE) { $env:CLOUD_RUN_SERVICE } else { "rinri-member-system" }
$RepoName = if ($env:ARTIFACT_REPO) { $env:ARTIFACT_REPO } else { "docker-repo" }
$ImageName = "${Region}-docker.pkg.dev/${ProjectId}/${RepoName}/${ServiceName}"
$SaName = if ($env:SERVICE_ACCOUNT) { $env:SERVICE_ACCOUNT } else { "" }

if (-not $ProjectId) {
    Write-Host "エラー: GCPプロジェクトIDが設定されていません" -ForegroundColor Red
    Write-Host "  gcloud config set project YOUR_PROJECT_ID"
    Write-Host "  または `$env:GCP_PROJECT_ID='xxx'; npm run deploy:cloudrun"
    exit 1
}

Write-Host ""
Write-Host "設定:"
Write-Host "  プロジェクト: $ProjectId"
Write-Host "  リージョン:   $Region"
Write-Host "  サービス名:   $ServiceName"
Write-Host "  イメージ:     $ImageName"
Write-Host ""

# === Cloud Build でビルド ===
Write-Host ">>> Cloud Build でDockerイメージをビルド中..."
gcloud builds submit `
    --tag "$ImageName" `
    --project "$ProjectId" `
    --timeout=600s

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# === Cloud Run にデプロイ ===
Write-Host ""
Write-Host ">>> Cloud Run にデプロイ中..."

$DeployArgs = @(
    "run", "deploy", $ServiceName,
    "--image", $ImageName,
    "--platform", "managed",
    "--region", $Region,
    "--project", $ProjectId,
    "--allow-unauthenticated",
    "--memory", "512Mi",
    "--cpu", "1",
    "--min-instances", "0",
    "--max-instances", "3",
    "--timeout", "60s",
    "--set-secrets=GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,SPREADSHEET_ID=SPREADSHEET_ID:latest,JWT_SECRET=JWT_SECRET:latest,REDIRECT_URI=REDIRECT_URI:latest"
)

# サービスアカウント指定がある場合
if ($SaName) {
    $DeployArgs += "--service-account=$SaName"
}

& gcloud @DeployArgs

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=========================================="
Write-Host " デプロイ完了！"
Write-Host "=========================================="

# URLを表示
$ServiceUrl = (gcloud run services describe $ServiceName `
    --platform managed `
    --region $Region `
    --project $ProjectId `
    --format='value(status.url)')

Write-Host ""
Write-Host "サービスURL: $ServiceUrl"
Write-Host ""
Write-Host "独自ドメインを設定済みの場合は、そちらのURLでアクセスしてください。"
Write-Host ""
