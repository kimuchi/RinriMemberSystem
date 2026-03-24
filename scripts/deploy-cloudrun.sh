#!/bin/bash
set -euo pipefail

# ============================================================
# Cloud Run デプロイスクリプト
# 使い方: npm run deploy:cloudrun
# ============================================================

echo "=========================================="
echo " 倫理法人会 会員管理システム - Cloud Run デプロイ"
echo "=========================================="

# === 設定（環境変数 or デフォルト値） ===
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-rinri-member-system}"
REPO_NAME="${ARTIFACT_REPO:-docker-repo}"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
SA_NAME="${SERVICE_ACCOUNT:-}"

if [ -z "$PROJECT_ID" ]; then
  echo "エラー: GCPプロジェクトIDが設定されていません"
  echo "  gcloud config set project YOUR_PROJECT_ID"
  echo "  または GCP_PROJECT_ID=xxx npm run deploy:cloudrun"
  exit 1
fi

echo ""
echo "設定:"
echo "  プロジェクト: $PROJECT_ID"
echo "  リージョン:   $REGION"
echo "  サービス名:   $SERVICE_NAME"
echo "  イメージ:     $IMAGE_NAME"
echo ""

# === Cloud Build でビルド ===
echo ">>> Cloud Build でDockerイメージをビルド中..."
gcloud builds submit \
  --tag "$IMAGE_NAME" \
  --project "$PROJECT_ID" \
  --timeout=600s

# === Cloud Run にデプロイ ===
echo ""
echo ">>> Cloud Run にデプロイ中..."

DEPLOY_CMD="gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --timeout 60s \
  --set-secrets=GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,SPREADSHEET_ID=SPREADSHEET_ID:latest,JWT_SECRET=JWT_SECRET:latest,REDIRECT_URI=REDIRECT_URI:latest"

# サービスアカウント指定がある場合
if [ -n "$SA_NAME" ]; then
  DEPLOY_CMD="$DEPLOY_CMD --service-account=$SA_NAME"
fi

eval "$DEPLOY_CMD"

echo ""
echo "=========================================="
echo " デプロイ完了！"
echo "=========================================="

# URLを表示
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(status.url)')

echo ""
echo "サービスURL: $SERVICE_URL"
echo ""
echo "独自ドメインを設定済みの場合は、そちらのURLでアクセスしてください。"
echo ""
