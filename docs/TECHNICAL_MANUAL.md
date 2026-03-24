# 倫理法人会 単会会員管理システム - 技術マニュアル

## 目次

1. [システム概要](#1-システム概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [前提条件](#3-前提条件)
4. [デプロイガイド](#4-デプロイガイド)
5. [スプレッドシート構成](#5-スプレッドシート構成)
6. [API仕様](#6-api仕様)
7. [カスタムフィールド設計](#7-カスタムフィールド設計)
8. [認証フロー](#8-認証フロー)
9. [トラブルシューティング](#9-トラブルシューティング)
10. [運用保守](#10-運用保守)

---

## 1. システム概要

倫理法人会の単会向け会員管理Webシステムです。
任意の単会が独立してデプロイし、独自ドメインで運用できます。

### 主要機能

| 機能 | 説明 |
|------|------|
| 会員名簿管理 | 会員情報のCRUD、検索、フィルタ、ソート |
| カスタムフィールド | 単会固有の選択肢フィールドを動的追加 |
| イベント管理 | イベントの登録、出席管理、種類別参加率集計 |
| ダッシュボード | 登録済/見込み/お声がけ中の人数表示 |
| ユーザー管理 | Googleアカウントベースの認証、権限管理 |
| スプレッドシート連携 | 全データがGoogle Sheetsに保存、直接編集可能 |

### 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 18 + Vite + React Router v6 |
| バックエンド | Express.js (Node.js 20) |
| データベース | Google Sheets API v4 |
| 認証 | Google OAuth 2.0 + JWT |
| インフラ | Google Cloud Run |
| CI/CD | GitHub Actions |

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

### Step 1: リポジトリのクローン

```bash
git clone https://github.com/YOUR_ORG/rinri-member-system.git
cd rinri-member-system
```

### Step 2: GCP初期セットアップ

```bash
npm run deploy:init
# 対話形式でプロジェクトID、リージョン、ドメインを入力
```

このスクリプトが行うこと：
- GCPプロジェクト設定
- 必要なAPIの有効化
- Artifact Registryリポジトリ作成
- サービスアカウント作成

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
   - 又は Cloud Run のデフォルトサービスアカウント：
   ```
   PROJECT_NUMBER-compute@developer.gserviceaccount.com
   ```

> **注意**: シートやヘッダーは初回ログイン時に自動作成されます。空のスプレッドシートで大丈夫です。

### Step 4: Google OAuth 2.0 クレデンシャルの作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. **APIs & Services** → **Credentials**
3. **認証情報を作成** → **OAuthクライアントID**
4. アプリケーションの種類: **ウェブアプリケーション**
5. 承認済みリダイレクトURI に追加:
   ```
   https://あなたのドメイン/auth/callback
   ```
6. 作成後、**クライアントID** と **クライアントシークレット** をメモ

> **OAuth同意画面** も設定が必要です。テスト中は「外部」→テストユーザーを追加。
> 本番公開時は「本番環境に公開」を実施してください。

### Step 5: Secret Manager にシークレットを登録

```bash
PROJECT_ID=$(gcloud config get-value project)

# 各シークレットを作成
echo -n 'YOUR_GOOGLE_CLIENT_ID' | \
  gcloud secrets create GOOGLE_CLIENT_ID --data-file=-

echo -n 'YOUR_GOOGLE_CLIENT_SECRET' | \
  gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-

echo -n 'YOUR_SPREADSHEET_ID' | \
  gcloud secrets create SPREADSHEET_ID --data-file=-

# JWT_SECRET はランダム文字列を生成
echo -n "$(openssl rand -base64 32)" | \
  gcloud secrets create JWT_SECRET --data-file=-

echo -n 'https://あなたのドメイン/auth/callback' | \
  gcloud secrets create REDIRECT_URI --data-file=-
```

サービスアカウントにシークレットへのアクセス権を付与：

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

for SECRET in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SPREADSHEET_ID JWT_SECRET REDIRECT_URI; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### Step 6: Cloud Run にデプロイ

```bash
npm run deploy:cloudrun
```

環境変数でカスタマイズ可能：
```bash
GCP_PROJECT_ID=my-project \
GCP_REGION=asia-northeast1 \
CLOUD_RUN_SERVICE=rinri-member-system \
npm run deploy:cloudrun
```

### Step 7: 独自ドメインの設定

1. Cloud Run コンソールでサービスを選択
2. **カスタムドメイン** → **マッピングを追加**
3. ドメインを入力して確認
4. DNSプロバイダーで以下のレコードを追加:

```
CNAME  staff.marunouchi-rinri.org  →  ghs.googlehosted.com
```

SSL証明書は Google が自動発行します（反映まで最大24時間）。

### Step 8: 初回ログイン

1. ブラウザで `https://あなたのドメイン` にアクセス
2. Googleアカウントでログイン
3. **最初にログインしたユーザーがオーナー**として登録される
4. 単会名を入力してセットアップ完了
5. スプレッドシートに全シートとヘッダーが自動作成される

### GitHub Actions によるCI/CDセットアップ

#### Workload Identity Federation（推奨）

```bash
# Workload Identity Pool 作成
gcloud iam workload-identity-pools create "github-pool" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Provider 作成
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# サービスアカウントへのバインド
SA_EMAIL="rinri-system-sa@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="YOUR_GITHUB_ORG/rinri-member-system"

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"
```

#### GitHub Secrets に設定

| Secret Name | 値 |
|-------------|------|
| `GCP_PROJECT_ID` | GCPプロジェクトID |
| `WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `WIF_SERVICE_ACCOUNT` | `rinri-system-sa@PROJECT_ID.iam.gserviceaccount.com` |

設定後、`main` ブランチへの push で自動デプロイされます。

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

### その他のシート

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

## 8. 認証フロー

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

## 9. トラブルシューティング

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

## 10. 運用保守

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
