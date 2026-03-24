# ============================================================
# 初期GCPセットアップスクリプト (PowerShell)
# 使い方: powershell -ExecutionPolicy Bypass -File scripts/init-gcp.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " 倫理法人会 会員管理システム - GCPセットアップ"
Write-Host "=========================================="
Write-Host ""

# === 設定値（対話式入力） ===
$ProjectId = Read-Host "GCPプロジェクトID"
$Region = Read-Host "Cloud Runリージョン [asia-northeast1]"
if (-not $Region) { $Region = "asia-northeast1" }
$ServiceName = Read-Host "Cloud Runサービス名 [rinri-member-system]"
if (-not $ServiceName) { $ServiceName = "rinri-member-system" }
$CustomDomain = Read-Host "独自ドメイン (例: staff.marunouchi-rinri.org)"

Write-Host ""
Write-Host "設定内容:"
Write-Host "  プロジェクトID: $ProjectId"
Write-Host "  リージョン:     $Region"
Write-Host "  サービス名:     $ServiceName"
Write-Host "  ドメイン:       $CustomDomain"
Write-Host ""
$Confirm = Read-Host "続行しますか？ (y/N)"
if ($Confirm -ne "y" -and $Confirm -ne "Y") {
    Write-Host "中止しました"
    exit 1
}

# === プロジェクト設定 ===
Write-Host ""
Write-Host ">>> GCPプロジェクトを設定中..."
gcloud config set project $ProjectId

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# === 必要なAPIを有効化 ===
Write-Host ">>> APIを有効化中..."
gcloud services enable `
    run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    sheets.googleapis.com `
    drive.googleapis.com `
    iamcredentials.googleapis.com

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# === Artifact Registry リポジトリ作成 ===
Write-Host ">>> Artifact Registryリポジトリを作成中..."
gcloud artifacts repositories create docker-repo `
    --repository-format=docker `
    --location=$Region `
    --description="Docker images for rinri member system" 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "  (既に存在します)"
}

# === サービスアカウント作成 ===
$SaName = "rinri-system-sa"
$SaEmail = "${SaName}@${ProjectId}.iam.gserviceaccount.com"

Write-Host ">>> サービスアカウントを作成中..."
gcloud iam service-accounts create $SaName `
    --display-name="Rinri Member System Service Account" 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "  (既に存在します)"
}

# === 権限付与 ===
Write-Host ">>> 権限を付与中..."

Write-Host ""
Write-Host "=========================================="
Write-Host " 手動セットアップが必要な項目"
Write-Host "=========================================="
Write-Host ""
Write-Host "1. Googleスプレッドシートの作成"
Write-Host "   - 新しいスプレッドシートを作成してください"
Write-Host "   - URLからスプレッドシートIDをコピー"
Write-Host "   - サービスアカウント ($SaEmail) に"
Write-Host "     編集権限を付与してください"
Write-Host ""
Write-Host "2. Google OAuth 2.0 クレデンシャルの作成"
Write-Host "   - Google Cloud Console → APIs & Services → Credentials"
Write-Host "   - 「認証情報を作成」→「OAuthクライアントID」"
Write-Host "   - アプリケーションの種類: ウェブアプリケーション"
Write-Host "   - 承認済みリダイレクトURI:"
Write-Host "     https://${CustomDomain}/auth/callback"
Write-Host "   - クライアントIDとシークレットをメモ"
Write-Host ""
Write-Host "3. Cloud Run にシークレット環境変数を設定"
Write-Host "   以下のコマンドでシークレットを作成:"
Write-Host ""
Write-Host "   echo 'YOUR_CLIENT_ID' | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-"
Write-Host "   echo 'YOUR_CLIENT_SECRET' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-"
Write-Host "   echo 'YOUR_SPREADSHEET_ID' | gcloud secrets create SPREADSHEET_ID --data-file=-"
Write-Host "   echo 'YOUR_JWT_SECRET' | gcloud secrets create JWT_SECRET --data-file=-"
Write-Host "   echo 'https://${CustomDomain}/auth/callback' | gcloud secrets create REDIRECT_URI --data-file=-"
Write-Host ""
Write-Host "   シークレットへのアクセス権限を付与:"
Write-Host "   `$ProjectNumber = (gcloud projects describe $ProjectId --format='value(projectNumber)')"
Write-Host "   foreach (`$Secret in @('GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SPREADSHEET_ID','JWT_SECRET','REDIRECT_URI')) {"
Write-Host "     gcloud secrets add-iam-policy-binding `$Secret ``"
Write-Host "       --member=`"serviceAccount:`${ProjectNumber}-compute@developer.gserviceaccount.com`" ``"
Write-Host "       --role=`"roles/secretmanager.secretAccessor`""
Write-Host "   }"
Write-Host ""
Write-Host "4. 独自ドメインの設定"
Write-Host "   - Cloud Run コンソールでカスタムドメインマッピングを設定"
Write-Host "   - DNSにCNAMEレコードを追加: ${CustomDomain} → ghs.googlehosted.com"
Write-Host ""
Write-Host "5. デプロイ"
Write-Host "   npm run deploy:cloudrun"
Write-Host ""
Write-Host "=========================================="
Write-Host " セットアップの基本部分が完了しました"
Write-Host "=========================================="
