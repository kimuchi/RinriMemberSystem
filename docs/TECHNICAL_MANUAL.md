# 倫理法人会 単会会員管理システム - 技術マニュアル

## 目次

1. [システム概要](#1-システム概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [前提条件](#3-前提条件)
4. [デプロイガイド](#4-デプロイガイド)
5. [スプレッドシート構成](#5-スプレッドシート構成)
6. [API仕様](#6-api仕様)
7. [カスタムフィールド設計](#7-カスタムフィールド設計)
8. [Googleフォーム連携設計](#8-googleフォーム連携設計)
9. [CSVインポート設計](#9-csvインポート設計)
10. [データ正規化](#10-データ正規化)
11. [認証フロー](#11-認証フロー)
12. [トラブルシューティング](#12-トラブルシューティング)
13. [運用保守](#13-運用保守)

---

## 1. システム概要

倫理法人会の単会向け会員管理Webシステムです。
任意の単会が独立してデプロイし、独自ドメインで運用できます。

### 主要機能

| 機能 | 説明 |
|------|------|
| 会員名簿管理 | 会員情報のCRUD、検索、フィルタ、全列ソート |
| カスタムフィールド | 単会固有の選択肢フィールドを動的追加 |
| 追加列の自動検出 | スプレッドシートに列を追加すると自動で画面に反映 |
| イベント管理 | イベントの登録、出席管理、種類別参加率集計 |
| Googleフォーム連携 | フォーム回答から出席者を自動マッチング・一括登録 |
| CSVインポート | CSVファイルから会員名簿への一括インポート（値マッピング対応） |
| イベント参加履歴 | 会員ごとの参加回数・期間指定・出席状態での絞り込み |
| ダッシュボード | 登録済/見込み/お声がけ中の人数、直近参加率表示 |
| ユーザー管理 | Googleアカウントベースの認証、ロール別権限管理 |
| スプレッドシート連携 | 全データがGoogle Sheetsに保存、直接編集可能 |

### 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 18 + Vite + React Router v6 |
| バックエンド | Express.js (Node.js 20) |
| データベース | Google Sheets API v4 |
| 認証 | Google OAuth 2.0 + JWT |
| インフラ | Google Cloud Run (Docker) |
| CI/CD | GitHub Actions (Workload Identity Federation) |
| セキュリティ | Helmet.js, Rate Limiting, httpOnly Cookie |

---

## 2. アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│                   ブラウザ                        │
│              (React SPA)                         │
└──────────────┬──────────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────────┐
│            Cloud Run                             │
│  ┌─────────────────────────────────┐             │
│  │   Express.js Server             │             │
│  │  ├── /auth/*   (Google OAuth)   │             │
│  │  ├── /api/dashboard             │             │
│  │  ├── /api/members               │             │
│  │  ├── /api/events                │             │
│  │  ├── /api/settings              │             │
│  │  └── Static Files (React dist)  │             │
│  └─────────────┬───────────────────┘             │
└────────────────┼────────────────────────────────┘
                 │ Google APIs
┌────────────────▼────────────────────────────────┐
│  Google Sheets API  │  Google Drive API          │
│  (データ読み書き)    │  (共有権限管理)            │
└──────────────┬──────┴───────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│         Google Spreadsheet                       │
│  ├── 会員名簿                                    │
│  ├── イベント / イベント出席                      │
│  ├── ユーザー / 設定                              │
│  ├── 入会ステータス選択肢                         │
│  ├── カスタムフィールド / カスタムフィールド選択肢  │
│  └── イベント種類                                 │
└─────────────────────────────────────────────────┘
```

### 列名ベースアクセス

スプレッドシートのデータは **列名（ヘッダー行）ベース** でアクセスします。
列の順序を変更したり、間に列を挿入しても、ヘッダー名が一致する限りシステムは正常に動作します。

```javascript
// server/services/sheets.js の核心ロジック
const headers = rows[0];  // 1行目 = ヘッダー
const headerMap = {};
headers.forEach((h, i) => { headerMap[h] = i; });
// 以後すべての読み書きは headerMap[列名] でインデックスを解決
```

---

## 3. 前提条件

### 必要なアカウント・ツール

| 項目 | 要件 |
|------|------|
| Googleアカウント | Google Cloud プロジェクトが作成可能なもの |
| Google Cloud プロジェクト | 課金有効化済み |
| gcloud CLI | インストール済みかつログイン済み |
| Git | インストール済み |
| 独自ドメイン | DNSレコードを編集できること |

### GCP必要サービス

- Cloud Run
- Cloud Build
- Artifact Registry
- Secret Manager
- Google Sheets API
- Google Drive API

---

## 4. デプロイガイド

このガイドに従うだけで、ゼロからデプロイが完了します。

### Step 1: リポジトリのクローンと依存パッケージ

```bash
git clone https://github.com/YOUR_ORG/rinri-member-system.git
cd rinri-member-system
npm run install:all
```

### Step 2: GCP初期セットアップ

```bash
npm run deploy:init
```

対話形式で以下を入力します：
- **GCPプロジェクトID**: Google Cloud Console で作成済みのプロジェクト（課金有効化済み）
- **Cloud Runリージョン**: `asia-northeast1`（東京）推奨、Enterでデフォルト
- **Cloud Runサービス名**: `rinri-member-system` 推奨、Enterでデフォルト
- **独自ドメイン**: 例 `staff.marunouchi-rinri.org`

このスクリプトが自動で行うこと：
1. GCPプロジェクトの設定
2. 必要なAPI（Cloud Run, Cloud Build, Artifact Registry, Sheets API, Drive API, Secret Manager）の有効化
3. Artifact Registryリポジトリ（docker-repo）の作成
4. サービスアカウント（`rinri-system-sa`）の作成
5. シークレットの登録（OAuth情報、スプレッドシートID等を対話入力）

> **注意**: スクリプト実行前に gcloud CLI のインストールとログイン（`gcloud auth login`）が必要です。

### Step 3: Googleスプレッドシートの作成

1. Google ドライブで新しいスプレッドシートを作成
2. URLからスプレッドシートIDを取得
   ```
   https://docs.google.com/spreadsheets/d/{ここがID}/edit
   ```
3. サービスアカウントにスプレッドシートの **編集権限** を付与
   - スプレッドシートの「共有」から以下のアドレスを追加：
   ```
   rinri-system-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

> **注意**: シートやヘッダーは初回ログイン時に自動作成されます。空のスプレッドシートで大丈夫です。
> Step 2 でシークレット登録をスキップした場合は、[Step 3b: 手動でシークレットを登録](#step-3b-手動でシークレットを登録任意) を実行してください。

### Step 4: Google OAuth 2.0 クレデンシャルの作成

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. **認証情報を作成** → **OAuthクライアントID**
3. アプリケーションの種類: **ウェブアプリケーション**
4. 承認済みリダイレクトURI に追加:
   ```
   https://あなたのドメイン/auth/callback
   ```
5. 作成後、**クライアントID** と **クライアントシークレット** をメモ

> **OAuth同意画面** の設定も必要です：
> - テスト中: 「外部」を選択 → テストユーザーにメールアドレスを追加
> - 本番公開時: 「本番環境に公開」を実施

Step 2 でシークレット登録済みの場合は Step 5 へ進んでください。

### Step 3b: 手動でシークレットを登録（任意）

Step 2 でシークレット登録をスキップした場合のみ実行：

```bash
PROJECT_ID=$(gcloud config get-value project)

echo -n 'YOUR_GOOGLE_CLIENT_ID' | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
echo -n 'YOUR_GOOGLE_CLIENT_SECRET' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
echo -n 'YOUR_SPREADSHEET_ID' | gcloud secrets create SPREADSHEET_ID --data-file=-
echo -n "$(openssl rand -base64 32)" | gcloud secrets create JWT_SECRET --data-file=-
echo -n 'https://あなたのドメイン/auth/callback' | gcloud secrets create REDIRECT_URI --data-file=-

# サービスアカウントにシークレットへのアクセス権を付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:rinri-system-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 5: Cloud Run にデプロイ

```bash
npm run deploy:cloudrun
```

デプロイ完了後、Cloud Run が生成するURL（例: `https://rinri-member-system-xxxxxxxx-an.a.run.app`）が表示されます。
まずこのURLでアプリが動作することを確認してください。

> 環境変数でカスタマイズも可能です：
> ```bash
> GCP_PROJECT_ID=my-project GCP_REGION=asia-northeast1 npm run deploy:cloudrun
> ```

### Step 6: 独自ドメインの設定

1. [Cloud Run コンソール](https://console.cloud.google.com/run) でサービスを選択
2. 上部メニューの **「カスタムドメインを管理」** をクリック
3. ドメインマッピングのタイプ: **「Cloud Run ドメインマッピング」** を選択
4. 対象サービスを選択し、ドメイン名を入力
5. 表示されるDNSレコード情報に従い、ドメインレジストラのDNS設定で以下を追加：

```
タイプ: CNAME
ホスト名: staff.marunouchi-rinri.org（あなたのドメイン）
値: ghs.googlehosted.com.
```

> - DNS反映には数分〜最大48時間かかることがあります
> - SSL証明書は Google が自動で発行・管理します

### Step 7: 初回ログイン

1. ブラウザで `https://あなたのドメイン` にアクセス
2. Googleアカウントでログイン
3. **最初にログインしたユーザーがオーナー**として自動登録される
4. 単会名を入力してセットアップ完了
5. スプレッドシートに全シートとヘッダーが自動作成される

### Step 8: GitHub Actions によるCI/CDセットアップ

mainブランチへのpushで自動デプロイされる仕組みを構築します。

#### 自動セットアップ（推奨）

```bash
npm run setup:cicd
```

対話形式で以下を入力：
- **GCPプロジェクトID**
- **GitHubリポジトリ名**: `your-org/rinri-member-system`（大文字小文字に注意）
- **Cloud Runリージョン**: Enterでデフォルト（`asia-northeast1`）
- **Cloud Runサービス名**: Enterでデフォルト（`rinri-member-system`）
- **Workload Identity Pool ID**: Enterでデフォルト（`github-pool`）
- **Workload Identity Provider ID**: Enterでデフォルト（`github-provider`）

スクリプトが自動で行うこと：
1. IAM Credentials API の有効化
2. Workload Identity Pool の作成
3. Workload Identity Provider の作成（`--attribute-condition` によるリポジトリ制限つき）
4. サービスアカウントへの Workload Identity バインド
5. サービスアカウントへの必要なIAMロール付与（Cloud Run Admin, Artifact Registry Writer, Cloud Build Builder, Service Account User）

#### 手動セットアップ

自動スクリプトを使わない場合は以下を実行（Linux/macOS）：

```bash
PROJECT_ID="your-project-id"
REPO="your-org/rinri-member-system"

# Workload Identity Pool 作成
gcloud iam workload-identity-pools create "github-pool" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Provider 作成（--attribute-condition が必須）
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# サービスアカウントへのバインド
SA_EMAIL="rinri-system-sa@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"

# 必要なIAMロールを付与
for ROLE in roles/run.admin roles/artifactregistry.writer roles/cloudbuild.builds.builder roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SA_EMAIL}" --role="$ROLE"
done
```

Windows（コマンドプロンプト）の場合：
```cmd
gcloud iam workload-identity-pools providers create-oidc github-provider ^
  --project=YOUR_PROJECT_ID ^
  --location=global ^
  --workload-identity-pool=github-pool ^
  --display-name="GitHub Provider" ^
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" ^
  --attribute-condition="assertion.repository=='your-org/rinri-member-system'" ^
  --issuer-uri="https://token.actions.githubusercontent.com"
```

> **重要**: `--attribute-condition` は必須です。これがないと Provider の作成が失敗します。

#### GitHub Secrets に設定

スクリプト完了時に表示される値を、GitHubリポジトリの **Settings → Secrets and variables → Actions → New repository secret** に登録します。

| Secret Name | 値 | 例 |
|-------------|------|-----|
| `GCP_PROJECT_ID` | GCPプロジェクトID | `marunouchi-rinri` |
| `WIF_PROVIDER` | Provider のフルパス | `projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `WIF_SERVICE_ACCOUNT` | サービスアカウントのメール | `rinri-system-sa@marunouchi-rinri.iam.gserviceaccount.com` |

> **注意**: `WIF_PROVIDER` の `projects/` の後は**プロジェクト番号（数字）**です。プロジェクトID（文字列）ではありません。

設定後、`main` ブランチへの push で自動デプロイされます。
GitHub Actions の画面から手動実行（`workflow_dispatch`）も可能です。

#### CI/CDのトラブルシューティング

| エラー | 原因 | 対処 |
|--------|------|------|
| `invalid_target` / Pool or provider doesn't exist | Providerが未作成 or 削除済み | `gcloud iam workload-identity-pools providers list --workload-identity-pool=github-pool --location=global` で確認 |
| `attribute condition must reference` | `--attribute-condition` が未指定 | Provider作成時に `--attribute-condition` を付けて再作成 |
| `WIF_PROVIDER` の値が不正 | プロジェクトIDとプロジェクト番号を混同 | `gcloud projects describe PROJECT_ID --format="value(projectNumber)"` で番号を確認 |
| Permission denied on deploy | サービスアカウントの権限不足 | `roles/run.admin`, `roles/artifactregistry.writer` 等が付与されているか確認 |

---

## 5. スプレッドシート構成

### 会員名簿

| 列名 | 用途 | 備考 |
|------|------|------|
| ID | システム内部ID | 自動生成、変更不可 |
| 氏名 | 会員名 | 必須 |
| ふりがな | 読み仮名 | ソートに使用 |
| メールアドレス | 連絡先 | |
| 携帯電話番号 | 連絡先 | |
| 会社名 | 所属企業 | |
| 住所 | 住所 | |
| 会社電話番号 | 会社連絡先 | |
| 入会ステータス | 入会状態 | 選択肢は設定で管理 |
| 備考 | 自由記述 | |
| 登録日 | 作成日時 | ISO 8601 |
| 更新日 | 最終更新日時 | ISO 8601 |
| (カスタムフィールド列) | 動的追加 | 設定画面から追加 |

### イベント

| 列名 | 用途 | 備考 |
|------|------|------|
| ID | イベントID | 自動生成 |
| イベント名 | イベント名称 | 必須 |
| 日付 | 開催日 | YYYY-MM-DD |
| 種類 | イベント種類 | 設定で管理 |
| 備考 | 自由記述 | |

### イベント出席

| 列名 | 用途 | 備考 |
|------|------|------|
| ID | 出席レコードID | 自動生成 |
| イベントID | 紐づくイベント | 外部キー |
| 会員ID | 紐づく会員 | 外部キー |
| 氏名 | 会員名（表示用） | |
| 出席状態 | 事前登録/出席/欠席/遅刻 | |
| 備考 | 自由記述 | |

### フォーム連携設定

| 列名 | 用途 | 備考 |
|------|------|------|
| イベントID | 紐づくイベント | 外部キー |
| スプレッドシートID | フォーム回答のシートID | |
| シート名 | 対象シート名 | |
| マッピング | フィールド対応表 | JSON文字列 |

### その他のシート

- **ユーザー**: ログインユーザー管理（メール、名前、ロール）
- **設定**: 単会名などの一般設定
- **入会ステータス選択肢**: ドロップダウンの選択肢
- **カスタムフィールド / カスタムフィールド選択肢**: 動的フィールド定義
- **イベント種類**: イベント種類の選択肢

詳細は `server/services/sheets.js` の `setupSpreadsheet()` メソッドを参照。

---

## 6. API仕様

### 認証

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/auth/login` | GET | Google OAuth開始 |
| `/auth/callback` | GET | OAuthコールバック |
| `/auth/me` | GET | 現在のユーザー情報 |
| `/auth/setup` | POST | 初回セットアップ（単会名設定） |
| `/auth/logout` | GET | ログアウト |

### 会員 (要認証)

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/api/members` | GET | 会員一覧（カスタムフィールド含む） |
| `/api/members/:id` | GET | 会員詳細 |
| `/api/members` | POST | 会員追加 |
| `/api/members/:id` | PUT | 会員更新 |
| `/api/members/:id/status` | PATCH | ステータスのインライン更新 |
| `/api/members/:id` | DELETE | 会員削除 |

### イベント (要認証)

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/api/events` | GET | イベント一覧 |
| `/api/events/:id` | GET | イベント詳細（出席者含む） |
| `/api/events` | POST | イベント追加 |
| `/api/events/:id` | PUT | イベント更新 |
| `/api/events/:id` | DELETE | イベント削除 |
| `/api/events/:id/attendance` | POST | 出席登録 |
| `/api/events/:eid/attendance/:aid` | PATCH | 出席状態更新 |
| `/api/events/:eid/attendance/:aid` | DELETE | 出席削除 |

### 設定 (要認証、一部オーナーのみ)

| エンドポイント | メソッド | 権限 | 説明 |
|----------------|----------|------|------|
| `/api/settings/general` | GET | 全員 | 一般設定取得 |
| `/api/settings/general` | PUT | オーナー | 一般設定更新 |
| `/api/settings/users` | GET | オーナー | ユーザー一覧 |
| `/api/settings/users` | POST | オーナー | ユーザー追加 |
| `/api/settings/users/:id` | DELETE | オーナー | ユーザー削除 |
| `/api/settings/statuses` | GET | 全員 | 入会ステータス選択肢 |
| `/api/settings/statuses` | POST | オーナー | 選択肢追加 |
| `/api/settings/statuses/:row` | PUT | オーナー | 選択肢更新 |
| `/api/settings/statuses/:row` | DELETE | オーナー | 選択肢削除 |
| `/api/settings/custom-fields` | GET | 全員 | カスタムフィールド一覧 |
| `/api/settings/custom-fields` | POST | オーナー | フィールド追加 |
| `/api/settings/custom-fields/:id` | PUT | オーナー | フィールド更新 |
| `/api/settings/custom-fields/:id` | DELETE | オーナー | フィールド無効化 |
| `/api/settings/custom-fields/:fid/options` | POST | オーナー | 選択肢追加 |
| `/api/settings/custom-fields/:fid/options/:row` | DELETE | オーナー | 選択肢削除 |
| `/api/settings/event-types` | GET | 全員 | イベント種類一覧 |
| `/api/settings/event-types` | POST | オーナー | 種類追加 |
| `/api/settings/event-types/:row` | DELETE | オーナー | 種類削除 |

### CSVインポート (要認証)

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/api/members/import/fields` | GET | マッピング先フィールド一覧（選択肢つき） |
| `/api/members/import/preview` | POST | CSVデータのプレビュー（名簿照合・差分検出） |
| `/api/members/import/execute` | POST | インポート実行（新規追加・既存更新） |

### フォーム連携 (要認証)

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/api/events/:id/form` | GET | フォーム連携設定を取得 |
| `/api/events/:id/form/connect` | POST | フォームスプレッドシートに接続（ヘッダー・シート名取得） |
| `/api/events/:id/form/mapping` | PUT | フィールドマッピングを保存 |
| `/api/events/:id/form` | DELETE | フォーム連携を解除 |
| `/api/events/:id/form/preview` | POST | 取り込みプレビュー（名簿照合・差分検出） |
| `/api/events/:id/form/execute` | POST | 取り込み実行（出席登録・会員情報更新・新規追加） |

### ダッシュボード (要認証)

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/api/dashboard` | GET | ダッシュボードデータ（会員数・参加率等） |

---

## 7. カスタムフィールド設計

カスタムフィールドは、単会固有の選択肢フィールドを会員名簿に動的追加する仕組みです。

### データフロー

```
1. オーナーが設定画面でフィールド追加
   → 「カスタムフィールド」シートにレコード追加
   → 「会員名簿」シートに列を自動追加

2. オーナーが選択肢を追加
   → 「カスタムフィールド選択肢」シートにレコード追加

3. 会員編集時
   → カスタムフィールドの値が「会員名簿」シートの該当列に書き込まれる

4. フィールド無効化時
   → 「カスタムフィールド」シートの「有効」列を false に設定
   → 「会員名簿」シートの列は残す（データ保護）
   → システムの画面には表示されなくなる
```

### スプレッドシート上での見え方

```
| ID | 氏名 | ... | 入会ステータス | BNIステータス | 紹介元 |
|    |      |     |               |  ← カスタム → |  ← カスタム →  |
```

---

## 8. Googleフォーム連携設計

Googleフォームの回答スプレッドシートからイベント出席者を一括取り込みする機能です。

### データフロー

```
1. イベント画面で「フォーム連携」を開く
2. フォーム回答のスプレッドシートURL/IDを入力して接続
   → 外部スプレッドシートのヘッダーとシート一覧を取得
3. フィールドマッピングを設定
   → フォーム列 → 会員名簿列の対応を定義
   → 名前照合用フィールド、参加/不参加フィールド、スキップ値を設定
4. プレビュー実行
   → フォーム回答を読み込み、名簿と照合
   → 既存会員: 名前の正規化マッチング（スペース除去・カタカナ→ひらがな）
   → 差分検出: フォーム回答と名簿の値を比較し、変更点をハイライト
   → 重複検出: 同一人物の複数回答を検出（どちらを使うか選択可能）
   → 既登録チェック: すでに出席登録済みの会員を検出
5. 取り込み実行
   → 出席登録（バッチ書き込み）
   → 会員情報の差分更新（ユーザーが選択した項目のみ）
   → 未登録者の新規会員追加
```

### バッチ処理による最適化

API呼び出し回数を最小化するため、以下をバッチ処理しています：

- **出席行の一括追加**: `appendRows()` で複数行を1回のAPI呼び出しで追加
- **新規会員の一括追加**: 名簿への追加もバッチ化
- **二重登録防止**: 取り込み実行前に既存出席データをチェックし、重複をスキップ

### マッピング設定の保存形式

`フォーム連携設定` シートの `マッピング` 列にJSON文字列で保存：

```json
{
  "fieldMap": {
    "お名前": "氏名",
    "ふりがな": "ふりがな",
    "メールアドレス": "メールアドレス"
  },
  "nameField": "お名前",
  "participationField": "参加しますか？",
  "skipValues": ["不参加", "欠席"]
}
```

---

## 9. CSVインポート設計

CSVファイルから会員名簿への一括インポート機能です。イベントに紐づかず、会員データの初期投入や外部データの取り込みに使用します。

### データフロー（4ステップ）

```
1. CSVファイルをアップロード
   → クライアント側でCSVを解析（UTF-8、クォート・改行対応）
   → ヘッダー行と全データ行を取得

2. 列マッピングを設定
   → CSV列 → 会員名簿列の対応を定義
   → 氏名照合キーを指定（名簿との突合に使用）
   → 自動推測: 列名が一致するものは自動マッピング

3. 値マッピングを設定（選択式フィールドのみ）
   → 入会ステータスやカスタムフィールドなどの select 型フィールドが対象
   → CSVの固有値一覧と件数を表示
   → 各値をどの選択肢に対応させるか設定
   → 完全一致するものは自動マッピング

4. プレビュー → 実行
   → 名前の正規化マッチングで既存会員と照合
   → 差分検出: CSVの値と名簿の値を比較
   → 重複検出: 同一名の複数行を検出（採用行を選択可能）
   → 実行: 新規会員の一括追加（appendRows）＋ 既存会員の情報更新
```

### フォーム連携との違い

| 項目 | フォーム連携 | CSVインポート |
|------|-------------|---------------|
| データ元 | Googleスプレッドシート | CSVファイル |
| イベント紐づけ | あり（出席登録） | なし（会員データのみ） |
| 設定の保存 | シートに保存（繰り返し使用） | 保存しない（1回限り） |
| 値マッピング | なし | あり（選択式フィールド対応） |
| マッチングキー | 氏名（正規化） | 氏名（正規化） |

### 値マッピングの仕組み

CSVの自由テキスト値を、システムの選択肢に変換する機能です。

**対象フィールド:**
- 入会ステータス（例: CSV `"メンバー"` → 名簿 `"新規登録済"`)
- カスタムフィールド（例: CSV `"Gold"` → 名簿 `"ゴールド会員"`)

**処理の流れ:**
1. マッピング対象のCSV列から固有値を抽出
2. 各値の出現件数を表示
3. ユーザーが対応する選択肢を選択（完全一致は自動設定）
4. 「そのまま」を選択した場合、CSV値をそのまま名簿に書き込み

---

## 10. データ正規化

### 氏名の正規化 (`normalizeName`)

名前のマッチング精度を上げるため、以下の正規化を行います：

- 日本語名: 全角・半角スペースを除去（例: `山田 太郎` → `山田太郎`）
- 英語名: スペースを維持（例: `John Smith` → `John Smith`）
- 前後の空白をトリム

### ふりがなの正規化 (`normalizeFurigana`)

保存時に自動適用：

- カタカナ → ひらがな変換（例: `ヤマダタロウ` → `やまだたろう`）
- 日本語名のスペース除去
- 英語名はそのまま維持

これにより、フォーム回答で「ヤマダ タロウ」と入力しても、名簿の「やまだたろう」と正しくマッチします。

---

## 11. 認証フロー

```
ブラウザ → /auth/login → Google OAuth 認可画面
         ← リダイレクト ← Google
         → /auth/callback?code=xxx
         ← JWT Cookie セット ← サーバー（ユーザー検証後）
         → / (SPA読み込み)
         → /auth/me (JWT Cookieで認証)
```

### ユーザー登録フロー

1. **初回ユーザー（オーナー）**: OAuth コールバック時に自動でユーザーシートに登録
2. **追加ユーザー**: オーナーが設定画面でメールアドレスを事前登録 → 当該ユーザーがOAuthログイン時に認証成功

---

## 12. トラブルシューティング

### ログインできない

| 症状 | 原因 | 対処 |
|------|------|------|
| 「登録されていません」エラー | ユーザーシートに未登録 | オーナーに設定画面から追加してもらう |
| OAuthエラー | リダイレクトURI不一致 | Cloud Console と Secret Manager の URI を確認 |
| 「auth_failed」 | トークン取得失敗 | CLIENT_SECRET を確認、OAuth同意画面の状態を確認 |

### スプレッドシート関連

| 症状 | 原因 | 対処 |
|------|------|------|
| 500エラー | サービスアカウントに権限なし | スプレッドシートの共有設定を確認 |
| データが反映されない | ヘッダー行が変更された | 列名が元のヘッダー名と一致しているか確認 |
| カスタムフィールドが表示されない | 「有効」列が false | カスタムフィールドシートで有効列を true に変更 |

### Cloud Run 関連

```bash
# ログ確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=rinri-member-system" --limit=50

# サービス状態確認
gcloud run services describe rinri-member-system --region=asia-northeast1
```

---

## 13. 運用保守

### バックアップ

Google スプレッドシートは Google Drive のバージョン履歴で自動バックアップされます。
追加で定期バックアップが必要な場合は、Google Apps Script でスケジュール実行を設定してください。

### スケーリング

Cloud Run の設定値：
- `--min-instances 0`: コスト最適化（コールドスタートあり）
- `--max-instances 3`: 小〜中規模の単会向け
- `--memory 512Mi`: Sheets API 呼び出しに十分

利用者が多い場合は `max-instances` を増やしてください。

### コスト目安

| サービス | 無料枠 | 目安月額 |
|----------|--------|----------|
| Cloud Run | 200万リクエスト/月 | ¥0〜数百円 |
| Cloud Build | 120分/日 | ¥0 |
| Sheets API | 無料 | ¥0 |
| Secret Manager | 6シークレット無料 | ¥0 |
| **合計** | | **ほぼ¥0〜数百円/月** |

### 更新・再デプロイ

```bash
# コード変更後
git add -A && git commit -m "update"
git push origin main  # GitHub Actions で自動デプロイ

# 手動デプロイ
npm run deploy:cloudrun
```

### npmスクリプト一覧

| コマンド | 説明 |
|----------|------|
| `npm start` | サーバー起動（本番） |
| `npm run dev` | サーバー起動（開発） |
| `npm run build:client` | フロントエンドビルド |
| `npm run install:all` | サーバー＋クライアントの依存パッケージ一括インストール |
| `npm run deploy:init` | GCP初期セットアップ（対話形式） |
| `npm run deploy:cloudrun` | Cloud Runへの手動デプロイ |
| `npm run setup:cicd` | GitHub Actions CI/CDセットアップ（WIF自動構成） |

### ディレクトリ構成

```
rinri-member-system/
├── client/                  # フロントエンド (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/        # ログイン・初回セットアップ
│   │   │   ├── dashboard/   # ダッシュボード
│   │   │   ├── events/      # イベント管理・フォーム連携
│   │   │   ├── help/        # 利用マニュアル
│   │   │   ├── layout/      # 共通レイアウト
│   │   │   ├── members/     # 会員名簿・CSVインポート
│   │   │   └── settings/    # 設定画面
│   │   ├── hooks/           # カスタムフック (useToast)
│   │   ├── utils/           # API通信ユーティリティ
│   │   ├── App.jsx          # ルーティング定義
│   │   └── main.jsx         # エントリポイント
│   └── index.html
├── server/
│   ├── index.js             # Express サーバー本体
│   ├── middleware/
│   │   └── auth.js          # JWT認証ミドルウェア
│   ├── routes/
│   │   ├── auth.js          # Google OAuth ルート
│   │   ├── dashboard.js     # ダッシュボードAPI
│   │   ├── events.js        # イベント管理API
│   │   ├── csv-import.js    # CSVインポートAPI
│   │   ├── form-import.js   # フォーム連携API
│   │   ├── members.js       # 会員管理API
│   │   └── settings.js      # 設定API
│   ├── services/
│   │   └── sheets.js        # Google Sheets API ラッパー
│   └── utils/
│       └── normalize.js     # 氏名・ふりがな正規化
├── scripts/
│   ├── init-gcp.js          # GCP初期セットアップ
│   ├── deploy-cloudrun.js   # Cloud Runデプロイ
│   └── setup-github-actions.js  # WIF CI/CDセットアップ
├── docs/
│   └── TECHNICAL_MANUAL.md  # 本ドキュメント
├── .github/workflows/
│   └── deploy.yml           # CI/CDワークフロー
├── Dockerfile               # マルチステージビルド
├── .env.example             # 環境変数テンプレート
└── package.json
```
