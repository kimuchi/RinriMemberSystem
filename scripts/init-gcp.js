#!/usr/bin/env node
// ============================================================
// 初期GCPセットアップスクリプト (クロスプラットフォーム)
// 使い方: npm run deploy:init
// ============================================================

const { execSync } = require("child_process");
const crypto = require("crypto");
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
    if (ignoreError) {
      return false;
    }
    console.error("");
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
  const apis = [
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "sheets.googleapis.com",
    "drive.googleapis.com",
    "iamcredentials.googleapis.com",
  ];
  let apiFailed = false;
  for (const api of apis) {
    const ok = run(`gcloud services enable ${api}`, { ignoreError: true });
    if (!ok) {
      console.error(`  警告: ${api} の有効化に失敗しました。権限を確認してください。`);
      apiFailed = true;
    }
  }
  if (apiFailed) {
    console.log("");
    console.log("一部のAPIの有効化に失敗しました。");
    console.log("プロジェクトのオーナーまたは編集者の権限が必要です。");
    console.log("権限のあるアカウントで再度実行するか、GCPコンソールから手動で有効化してください。");
    const cont = await prompt("このまま続行しますか？ (y/N): ");
    if (cont !== "y" && cont !== "Y") {
      console.log("中止しました");
      process.exit(1);
    }
  }

  // === Artifact Registry リポジトリ作成 ===
  console.log(">>> Artifact Registryリポジトリを作成中...");
  if (!run(
    `gcloud artifacts repositories create docker-repo --repository-format=docker --location=${region} --description="Docker images for rinri member system"`,
    { ignoreError: true }
  )) {
    console.log("  (既に存在するか、権限がありません)");
  }

  // === サービスアカウント作成 ===
  const saName = "rinri-system-sa";
  const saEmail = `${saName}@${projectId}.iam.gserviceaccount.com`;

  console.log(">>> サービスアカウントを作成中...");
  if (!run(
    `gcloud iam service-accounts create ${saName} --display-name="Rinri Member System Service Account"`,
    { ignoreError: true }
  )) {
    console.log("  (既に存在するか、権限がありません)");
  }

  // === Secret Manager API を有効化 ===
  console.log(">>> Secret Manager APIを有効化中...");
  run("gcloud services enable secretmanager.googleapis.com", { ignoreError: true });

  // === シークレット環境変数の設定 ===
  console.log("");
  console.log("==========================================");
  console.log(" シークレット環境変数の設定");
  console.log("==========================================");
  console.log("");
  console.log("先にGoogle Cloud Console で以下を準備してください:");
  console.log("  - OAuth 2.0 クレデンシャル (APIs & Services → Credentials)");
  console.log("    アプリケーションの種類: ウェブアプリケーション");
  console.log(`    承認済みリダイレクトURI: https://${customDomain}/auth/callback`);
  console.log("  - Googleスプレッドシート (URLからIDをコピー)");
  console.log(`    サービスアカウント (${saEmail}) に編集権限を付与`);
  console.log("");

  const setupSecrets = await prompt("シークレットを今すぐ設定しますか？ (y/N): ");
  if (setupSecrets === "y" || setupSecrets === "Y") {
    const googleClientId = await prompt("Google OAuth クライアントID: ");
    const googleClientSecret = await prompt("Google OAuth クライアントシークレット: ");
    const spreadsheetId = await prompt("スプレッドシートID: ");
    const jwtSecret = crypto.randomBytes(32).toString("hex");
    const redirectUri = `https://${customDomain}/auth/callback`;

    console.log("");
    console.log(`  JWT_SECRET を自動生成しました: ${jwtSecret}`);
    console.log(`  REDIRECT_URI: ${redirectUri}`);
    console.log("");

    const secretEntries = [
      { name: "GOOGLE_CLIENT_ID", value: googleClientId },
      { name: "GOOGLE_CLIENT_SECRET", value: googleClientSecret },
      { name: "SPREADSHEET_ID", value: spreadsheetId },
      { name: "JWT_SECRET", value: jwtSecret },
      { name: "REDIRECT_URI", value: redirectUri },
    ];

    // シークレット作成
    for (const { name, value } of secretEntries) {
      if (!value) {
        console.log(`  スキップ: ${name} (値が空です)`);
        continue;
      }
      console.log(`>>> シークレット ${name} を作成中...`);
      // 既存のシークレットがあれば新しいバージョンを追加、なければ作成
      const created = run(
        `gcloud secrets create ${name} --data-file=- --project=${projectId}`,
        { ignoreError: true, input: value }
      );
      if (!created) {
        console.log(`  ${name} は既に存在します。新しいバージョンを追加します...`);
        run(
          `gcloud secrets versions add ${name} --data-file=- --project=${projectId}`,
          { ignoreError: true, input: value }
        );
      }
    }

    // IAM権限付与（サービスアカウントにSecret Managerアクセス権を付与）
    console.log("");
    console.log(">>> シークレットへのアクセス権限を付与中...");
    run(
      `gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:${saEmail}" --role="roles/secretmanager.secretAccessor"`,
      { ignoreError: true }
    );
    console.log("  サービスアカウントへのシークレット権限付与が完了しました。");
  } else {
    console.log("");
    console.log("後でシークレットを設定する場合は、このスクリプトを再度実行してください。");
  }

  // === 残りの手動セットアップ ===
  console.log("");
  console.log("==========================================");
  console.log(" 残りのセットアップ");
  console.log("==========================================");
  console.log("");
  console.log("1. 初回デプロイ（Cloud Runサービスの作成）");
  console.log("");
  console.log("   以下のコマンドでDockerイメージのビルドとCloud Runサービスの");
  console.log("   作成・デプロイが自動的に行われます:");
  console.log("");
  console.log("     npm run deploy:cloudrun");
  console.log("");
  console.log(`   → デプロイ完了後、Cloud Runが自動生成するURLが表示されます`);
  console.log(`     (例: https://${serviceName}-xxxxxxxx-an.a.run.app)`);
  console.log("   → まずこのURLでアプリが動作することを確認してください");
  console.log("");
  console.log("2. 独自ドメインの設定（カスタムドメインマッピング）");
  console.log("");
  console.log("   ※ 手順1のデプロイが完了してからこの手順を実施してください");
  console.log("     （サービスが存在しないとドメインマッピングを追加できません）");
  console.log("");
  console.log("   【手順A】Cloud Run コンソールでドメインマッピングを追加");
  console.log(`   a. https://console.cloud.google.com/run?project=${projectId} を開く`);
  console.log(`   b. サービス一覧から「${serviceName}」をクリック`);
  console.log("   c. 上部メニューの「カスタムドメインを管理」をクリック");
  console.log("      （または「インテグレーション」タブ →「カスタムドメインを追加」）");
  console.log("   d. ドメインマッピングのタイプ: 「Cloud Run ドメインマッピング」を選択");
  console.log(`   e. 対象サービス: 「${serviceName}」を選択`);
  console.log(`   f. ドメイン名: 「${customDomain}」を入力`);
  console.log("   g. 「マッピングを追加」をクリック");
  console.log("      → 画面にDNSレコード情報が表示されます");
  console.log("");
  console.log("   【手順B】DNSレコードの設定（ドメイン管理画面で実施）");
  console.log(`   お使いのドメインレジストラ（お名前.com, ムームードメインなど）の`);
  console.log("   DNS設定画面で以下のレコードを追加してください:");
  console.log("");
  console.log(`     タイプ: CNAME`);
  console.log(`     ホスト名: ${customDomain}`);
  console.log(`     値: ghs.googlehosted.com.`);
  console.log("");
  console.log("   ※ DNS反映には数分〜最大48時間かかることがあります");
  console.log("   ※ SSL証明書はGoogleが自動で発行・管理します");
  console.log("");
  console.log("==========================================");
  console.log(" セットアップが完了しました");
  console.log("==========================================");
}

main().catch((err) => {
  console.error("");
  console.error("セットアップが中断されました。エラー内容を確認して再度実行してください。");
  process.exit(1);
});
