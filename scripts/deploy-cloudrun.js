#!/usr/bin/env node
// ============================================================
// Cloud Run デプロイスクリプト (クロスプラットフォーム)
// 使い方: npm run deploy:cloudrun
// ============================================================

const { execSync } = require("child_process");

function run(cmd) {
  console.log(`>>> ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch (e) {
    console.error("");
    console.error(`エラー: コマンドが失敗しました (終了コード: ${e.status})`);
    console.error("上記のエラーメッセージを確認してください。");
    process.exit(e.status || 1);
  }
}

function getOutput(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

console.log("==========================================");
console.log(" 倫理法人会 会員管理システム - Cloud Run デプロイ");
console.log("==========================================");

// === 設定（環境変数 or デフォルト値） ===
let projectId = process.env.GCP_PROJECT_ID;
if (!projectId) {
  try {
    projectId = getOutput("gcloud config get-value project");
  } catch {
    // ignore
  }
}
const region = process.env.GCP_REGION || "asia-northeast1";
const serviceName = process.env.CLOUD_RUN_SERVICE || "rinri-member-system";
const repoName = process.env.ARTIFACT_REPO || "docker-repo";
const imageName = `${region}-docker.pkg.dev/${projectId}/${repoName}/${serviceName}`;
const saName = process.env.SERVICE_ACCOUNT || "";

if (!projectId) {
  console.error("エラー: GCPプロジェクトIDが設定されていません");
  console.error("  gcloud config set project YOUR_PROJECT_ID");
  console.error("  または GCP_PROJECT_ID=xxx npm run deploy:cloudrun");
  process.exit(1);
}

console.log("");
console.log("設定:");
console.log(`  プロジェクト: ${projectId}`);
console.log(`  リージョン:   ${region}`);
console.log(`  サービス名:   ${serviceName}`);
console.log(`  イメージ:     ${imageName}`);
console.log("");

// === Cloud Build でビルド ===
console.log(">>> Cloud Build でDockerイメージをビルド中...");
run(`gcloud builds submit --tag "${imageName}" --project "${projectId}" --timeout=600s`);

// === Cloud Run にデプロイ ===
console.log("");
console.log(">>> Cloud Run にデプロイ中...");

const deployArgs = [
  `gcloud run deploy ${serviceName}`,
  `--image ${imageName}`,
  "--platform managed",
  `--region ${region}`,
  `--project ${projectId}`,
  "--allow-unauthenticated",
  "--memory 512Mi",
  "--cpu 1",
  "--min-instances 0",
  "--max-instances 3",
  "--timeout 60s",
  "--set-secrets=GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,SPREADSHEET_ID=SPREADSHEET_ID:latest,JWT_SECRET=JWT_SECRET:latest,REDIRECT_URI=REDIRECT_URI:latest",
];

if (saName) {
  deployArgs.push(`--service-account=${saName}`);
}

run(deployArgs.join(" "));

console.log("");
console.log("==========================================");
console.log(" デプロイ完了！");
console.log("==========================================");

// URLを表示
try {
  const serviceUrl = getOutput(
    `gcloud run services describe ${serviceName} --platform managed --region ${region} --project ${projectId} --format="value(status.url)"`
  );
  console.log("");
  console.log(`サービスURL: ${serviceUrl}`);
} catch {
  console.log("");
  console.log("サービスURLの取得に失敗しました。Cloud Runコンソールで確認してください。");
}

console.log("");
console.log("独自ドメインを設定済みの場合は、そちらのURLでアクセスしてください。");
console.log("");
