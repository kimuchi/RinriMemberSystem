#!/usr/bin/env node
// ============================================================
// GitHub Actions CI/CD セットアップスクリプト
// Workload Identity Federation を使った認証設定を自動化
// 使い方: npm run setup:cicd
// ============================================================

const { execSync } = require("child_process");
const readline = require("readline");

function run(cmd, { ignoreError = false, input } = {}) {
  console.log(`>>> ${cmd}`);
  try {
    if (input !== undefined) {
      execSync(cmd, { stdio: ["pipe", "inherit", "inherit"], input });
    } else {
      execSync(cmd, { stdio: "inherit" });
    }
  } catch (e) {
    if (ignoreError) return false;
    console.error(`エラー: コマンドが失敗しました (終了コード: ${e.status})`);
    throw e;
  }
  return true;
}

function getOutput(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
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
  console.log(" GitHub Actions CI/CD セットアップ");
  console.log(" (Workload Identity Federation)");
  console.log("==========================================");
  console.log("");

  // === 設定値の取得 ===
  let projectId;
  try {
    projectId = getOutput("gcloud config get-value project");
  } catch {
    // ignore
  }
  projectId = (await prompt(`GCPプロジェクトID [${projectId || ""}]: `)) || projectId;
  if (!projectId) {
    console.error("エラー: プロジェクトIDが必要です");
    process.exit(1);
  }

  const githubRepo = await prompt("GitHubリポジトリ (例: your-org/rinri-member-system): ");
  if (!githubRepo) {
    console.error("エラー: GitHubリポジトリが必要です");
    process.exit(1);
  }

  const region = (await prompt("Cloud Runリージョン [asia-northeast1]: ")) || "asia-northeast1";
  const serviceName = (await prompt("Cloud Runサービス名 [rinri-member-system]: ")) || "rinri-member-system";
  const poolId = (await prompt("Workload Identity Pool ID [github-pool]: ")) || "github-pool";
  const providerId = (await prompt("Workload Identity Provider ID [github-provider]: ")) || "github-provider";

  console.log("");
  console.log("設定内容:");
  console.log(`  プロジェクトID:   ${projectId}`);
  console.log(`  GitHubリポジトリ: ${githubRepo}`);
  console.log(`  リージョン:       ${region}`);
  console.log(`  サービス名:       ${serviceName}`);
  console.log(`  Pool ID:          ${poolId}`);
  console.log(`  Provider ID:      ${providerId}`);
  console.log("");

  const confirm = await prompt("続行しますか？ (y/N): ");
  if (confirm !== "y" && confirm !== "Y") {
    console.log("中止しました");
    process.exit(1);
  }

  // === プロジェクト設定 ===
  run(`gcloud config set project ${projectId}`);

  // === IAM Credentials API を有効化 ===
  console.log("");
  console.log(">>> 必要なAPIを有効化中...");
  run("gcloud services enable iamcredentials.googleapis.com", { ignoreError: true });
  run("gcloud services enable iam.googleapis.com", { ignoreError: true });

  // === プロジェクト番号を取得 ===
  console.log("");
  console.log(">>> プロジェクト番号を取得中...");
  const projectNumber = getOutput(
    `gcloud projects describe ${projectId} --format="value(projectNumber)"`
  );
  console.log(`  プロジェクト番号: ${projectNumber}`);

  // === Workload Identity Pool 作成 ===
  console.log("");
  console.log(">>> Workload Identity Pool を作成中...");
  if (!run(
    `gcloud iam workload-identity-pools create "${poolId}" --project="${projectId}" --location="global" --display-name="GitHub Actions Pool"`,
    { ignoreError: true }
  )) {
    console.log("  (既に存在します)");
  }

  // === Workload Identity Provider 作成 ===
  console.log("");
  console.log(">>> Workload Identity Provider を作成中...");
  if (!run(
    `gcloud iam workload-identity-pools providers create-oidc "${providerId}" --project="${projectId}" --location="global" --workload-identity-pool="${poolId}" --display-name="GitHub Provider" --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" --issuer-uri="https://token.actions.githubusercontent.com"`,
    { ignoreError: true }
  )) {
    console.log("  (既に存在します)");
  }

  // === サービスアカウントへのバインド ===
  const saEmail = `rinri-system-sa@${projectId}.iam.gserviceaccount.com`;
  console.log("");
  console.log(">>> サービスアカウントにWorkload Identity バインドを設定中...");
  run(
    `gcloud iam service-accounts add-iam-policy-binding "${saEmail}" --project="${projectId}" --role="roles/iam.workloadIdentityUser" --member="principalSet://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/attribute.repository/${githubRepo}"`,
    { ignoreError: true }
  );

  // === サービスアカウントに必要なロールを付与 ===
  console.log("");
  console.log(">>> サービスアカウントに必要なロールを付与中...");
  const roles = [
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/cloudbuild.builds.builder",
    "roles/iam.serviceAccountUser",
  ];
  for (const role of roles) {
    run(
      `gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:${saEmail}" --role="${role}"`,
      { ignoreError: true }
    );
  }

  // === 結果表示 ===
  const wifProvider = `projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;

  console.log("");
  console.log("==========================================");
  console.log(" セットアップ完了！");
  console.log("==========================================");
  console.log("");
  console.log("以下の値をGitHubリポジトリの Secrets に設定してください:");
  console.log("  Settings → Secrets and variables → Actions → New repository secret");
  console.log("");
  console.log("┌─────────────────────┬─────────────────────────────────────┐");
  console.log("│ Secret Name         │ 値                                  │");
  console.log("├─────────────────────┼─────────────────────────────────────┤");
  console.log(`│ GCP_PROJECT_ID      │ ${projectId}`);
  console.log(`│ WIF_PROVIDER        │ ${wifProvider}`);
  console.log(`│ WIF_SERVICE_ACCOUNT │ ${saEmail}`);
  console.log("└─────────────────────┴─────────────────────────────────────┘");
  console.log("");
  console.log("設定後、main ブランチへの push で自動デプロイされます。");
  console.log("");
}

main().catch((err) => {
  console.error("");
  console.error("セットアップが中断されました。エラー内容を確認して再度実行してください。");
  process.exit(1);
});
