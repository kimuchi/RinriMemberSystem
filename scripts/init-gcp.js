#!/usr/bin/env node
// ============================================================
// 初期GCPセットアップスクリプト (クロスプラットフォーム)
// 使い方: npm run deploy:init
// ============================================================

const { execSync } = require("child_process");
const readline = require("readline");

function run(cmd) {
  console.log(`>>> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log("==========================================");
  console.log(" 倫理法人会 会員管理システム - GCPセットアップ");
  console.log("==========================================");
  console.log("");

  // === 設定値（対話式入力） ===
  const projectId = await prompt("GCPプロジェクトID: ");
  const region = (await prompt("Cloud Runリージョン [asia-northeast1]: ")) || "asia-northeast1";
  const serviceName = (await prompt("Cloud Runサービス名 [rinri-member-system]: ")) || "rinri-member-system";
  const customDomain = await prompt("独自ドメイン (例: staff.marunouchi-rinri.org): ");

  console.log("");
  console.log("設定内容:");
  console.log(`  プロジェクトID: ${projectId}`);
  console.log(`  リージョン:     ${region}`);
  console.log(`  サービス名:     ${serviceName}`);
  console.log(`  ドメイン:       ${customDomain}`);
  console.log("");

  const confirm = await prompt("続行しますか？ (y/N): ");
  if (confirm !== "y" && confirm !== "Y") {
    console.log("中止しました");
    process.exit(1);
  }

  // === プロジェクト設定 ===
  console.log("");
  console.log(">>> GCPプロジェクトを設定中...");
  run(`gcloud config set project ${projectId}`);

  // === 必要なAPIを有効化 ===
  console.log(">>> APIを有効化中...");
  run(
    "gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sheets.googleapis.com drive.googleapis.com iamcredentials.googleapis.com"
  );

  // === Artifact Registry リポジトリ作成 ===
  console.log(">>> Artifact Registryリポジトリを作成中...");
  try {
    run(
      `gcloud artifacts repositories create docker-repo --repository-format=docker --location=${region} --description="Docker images for rinri member system"`
    );
  } catch {
    console.log("  (既に存在します)");
  }

  // === サービスアカウント作成 ===
  const saName = "rinri-system-sa";
  const saEmail = `${saName}@${projectId}.iam.gserviceaccount.com`;

  console.log(">>> サービスアカウントを作成中...");
  try {
    run(
      `gcloud iam service-accounts create ${saName} --display-name="Rinri Member System Service Account"`
    );
  } catch {
    console.log("  (既に存在します)");
  }

  // === 権限付与 ===
  console.log(">>> 権限を付与中...");

  console.log("");
  console.log("==========================================");
  console.log(" 手動セットアップが必要な項目");
  console.log("==========================================");
  console.log("");
  console.log("1. Googleスプレッドシートの作成");
  console.log("   - 新しいスプレッドシートを作成してください");
  console.log("   - URLからスプレッドシートIDをコピー");
  console.log(`   - サービスアカウント (${saEmail}) に`);
  console.log("     編集権限を付与してください");
  console.log("");
  console.log("2. Google OAuth 2.0 クレデンシャルの作成");
  console.log("   - Google Cloud Console → APIs & Services → Credentials");
  console.log("   - 「認証情報を作成」→「OAuthクライアントID」");
  console.log("   - アプリケーションの種類: ウェブアプリケーション");
  console.log("   - 承認済みリダイレクトURI:");
  console.log(`     https://${customDomain}/auth/callback`);
  console.log("   - クライアントIDとシークレットをメモ");
  console.log("");
  console.log("3. Cloud Run にシークレット環境変数を設定");
  console.log("   以下のコマンドでシークレットを作成:");
  console.log("");
  console.log("   echo -n 'YOUR_CLIENT_ID' | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-");
  console.log("   echo -n 'YOUR_CLIENT_SECRET' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-");
  console.log("   echo -n 'YOUR_SPREADSHEET_ID' | gcloud secrets create SPREADSHEET_ID --data-file=-");
  console.log("   echo -n 'YOUR_JWT_SECRET' | gcloud secrets create JWT_SECRET --data-file=-");
  console.log(`   echo -n 'https://${customDomain}/auth/callback' | gcloud secrets create REDIRECT_URI --data-file=-`);
  console.log("");
  console.log("   シークレットへのアクセス権限を付与:");
  console.log(`   PROJECT_NUMBER=$(gcloud projects describe ${projectId} --format='value(projectNumber)')`);
  console.log("   for SECRET in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SPREADSHEET_ID JWT_SECRET REDIRECT_URI; do");
  console.log("     gcloud secrets add-iam-policy-binding $SECRET \\");
  console.log('       --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \\');
  console.log('       --role="roles/secretmanager.secretAccessor"');
  console.log("   done");
  console.log("");
  console.log("4. 独自ドメインの設定");
  console.log("   - Cloud Run コンソールでカスタムドメインマッピングを設定");
  console.log(`   - DNSにCNAMEレコードを追加: ${customDomain} → ghs.googlehosted.com`);
  console.log("");
  console.log("5. デプロイ");
  console.log("   npm run deploy:cloudrun");
  console.log("");
  console.log("==========================================");
  console.log(" セットアップの基本部分が完了しました");
  console.log("==========================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
