# 倫理法人会 単会会員管理システム

倫理法人会の単会向け会員管理Webシステムです。  
Googleスプレッドシートをデータベースとして使用し、Cloud Runで動作します。

## 主な機能

- **会員名簿管理**: 登録・編集・検索・フィルタ・インラインステータス編集
- **カスタムフィールド**: 単会固有の選択肢フィールドを設定画面から追加可能
- **イベント管理**: イベント登録、出席管理、種類別参加率集計
- **ダッシュボード**: 登録済/見込み/お声がけ中の人数をリアルタイム表示
- **ユーザー管理**: Google OAuth認証、スプレッドシート共有権限の自動管理
- **レスポンシブ**: スマートフォンからも操作可能

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| Frontend | React 18 + Vite + React Router v6 |
| Backend | Express.js (Node.js 20) |
| Database | Google Sheets API v4 |
| Auth | Google OAuth 2.0 + JWT |
| Infra | Google Cloud Run |
| CI/CD | GitHub Actions |

## クイックスタート

```bash
# 1. GCP初期セットアップ
npm run deploy:init

# 2. シークレット設定（ガイドに従う）

# 3. デプロイ
npm run deploy:cloudrun
```

## ドキュメント

- **利用マニュアル**: システム内の「利用マニュアル」ページ
- **技術マニュアル**: [docs/TECHNICAL_MANUAL.md](docs/TECHNICAL_MANUAL.md)

## ライセンス

Private - 倫理法人会向け
