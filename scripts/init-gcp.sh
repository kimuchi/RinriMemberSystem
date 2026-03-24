#!/bin/bash
set -euo pipefail

# ============================================================
# 初期GCPセットアップスクリプト
# 使い方: bash scripts/init-gcp.sh
# ============================================================

echo "=========================================="
echo " 倫理法人会 会員管理システム - GCPセットアップ"
echo "=========================================="
echo ""

# === 設定値（環境に合わせて変更） ===
read -p "GCPプロジェクトID: " PROJECT_ID
read -p "Cloud Runリージョン [asia-northeast1]: " REGION
REGION=${REGION:-asia-northeast1}
read -p "Cloud Runサービス名 [rinri-member-system]: " SERVICE_NAME
SERVICE_NAME=${SERVICE_NAME:-rinri-member-system}
read -p "独自ドメイン (例: staff.marunouchi-rinri.org): " CUSTOM_DOMAIN

echo ""
echo "設定内容:"
echo "  プロジェクトID: $PROJECT_ID"
echo "  リージョン:     $REGION"
echo "  サービス名:     $SERVICE_NAME"
echo "  ドメイン:       $CUSTOM_DOMAIN"
echo ""
read -p "続行しますか？ (y/N): " CONFIRM
[[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && echo "中止しました" && exit 1

# === プロジェクト設定 ===
echo ""
echo ">>> GCPプロジェクトを設定中..."
gcloud config set project "$PROJECT_ID"

# === 必要なAPIを有効化 ===
echo ">>> APIを有効化中..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sheets.googleapis.com \
  drive.googleapis.com \
  iamcredentials.googleapis.com

# === Artifact Registry リポジトリ作成 ===
echo ">>> Artifact Registryリポジトリを作成中..."
gcloud artifacts repositories create docker-repo \
  --repository-format=docker \
  --location="$REGION" \
  --description="Docker images for rinri member system" \
  2>/dev/null || echo "  (既に存在します)"

# === サービスアカウント作成 ===
SA_NAME="rinri-system-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo ">>> サービスアカウントを作成中..."
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Rinri Member System Service Account" \
  2>/dev/null || echo "  (既に存在します)"

# === 権限付与 ===
echo ">>> 権限を付与中..."
# Cloud Run 呼び出し権限（公開アクセス用）
# Sheets API / Drive API アクセス用の権限はスプレッドシートの共有で行う

echo ""
echo "=========================================="
echo " 手動セットアップが必要な項目"
echo "=========================================="
echo ""
echo "1. Googleスプレッドシートの作成"
echo "   - 新しいスプレッドシートを作成してください"
echo "   - URLからスプレッドシートIDをコピー"
echo "   - サービスアカウント ($SA_EMAIL) に"
echo "     編集権限を付与してください"
echo ""
echo "2. Google OAuth 2.0 クレデンシャルの作成"
echo "   - Google Cloud Console → APIs & Services → Credentials"
echo "   - 「認証情報を作成」→「OAuthクライアントID」"
echo "   - アプリケーションの種類: ウェブアプリケーション"
echo "   - 承認済みリダイレクトURI:"
echo "     https://${CUSTOM_DOMAIN}/auth/callback"
echo "   - クライアントIDとシークレットをメモ"
echo ""
echo "3. Cloud Run にシークレット環境変数を設定"
echo "   以下のコマンドでシークレットを作成:"
echo ""
echo "   echo -n 'YOUR_CLIENT_ID' | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-"
echo "   echo -n 'YOUR_CLIENT_SECRET' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-"
echo "   echo -n 'YOUR_SPREADSHEET_ID' | gcloud secrets create SPREADSHEET_ID --data-file=-"
echo "   echo -n 'YOUR_JWT_SECRET' | gcloud secrets create JWT_SECRET --data-file=-"
echo "   echo -n 'https://${CUSTOM_DOMAIN}/auth/callback' | gcloud secrets create REDIRECT_URI --data-file=-"
echo ""
echo "   シークレットへのアクセス権限を付与:"
echo "   PROJECT_NUMBER=\$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')"
echo "   for SECRET in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SPREADSHEET_ID JWT_SECRET REDIRECT_URI; do"
echo "     gcloud secrets add-iam-policy-binding \$SECRET \\"
echo "       --member=\"serviceAccount:\${PROJECT_NUMBER}-compute@developer.gserviceaccount.com\" \\"
echo "       --role=\"roles/secretmanager.secretAccessor\""
echo "   done"
echo ""
echo "4. 独自ドメインの設定"
echo "   - Cloud Run コンソールでカスタムドメインマッピングを設定"
echo "   - DNSにCNAMEレコードを追加: ${CUSTOM_DOMAIN} → ghs.googlehosted.com"
echo ""
echo "5. デプロイ"
echo "   npm run deploy:cloudrun"
echo ""
echo "=========================================="
echo " セットアップの基本部分が完了しました"
echo "=========================================="
