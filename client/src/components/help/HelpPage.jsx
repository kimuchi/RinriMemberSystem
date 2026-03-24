import React, { useState } from 'react';
import Icon from '../Icon';
import './Help.css';

const sections = [
  {
    id: 'overview',
    title: 'システム概要',
    icon: 'info',
    content: `
このシステムは、倫理法人会の単会向け会員管理システムです。

**主な機能：**
- 会員名簿の管理（登録・編集・検索・フィルタ）
- イベントの登録と出席管理
- ダッシュボードでの統計確認
- ユーザー管理とアクセス権制御
- Googleスプレッドシートとのリアルタイム連携

**データの保存先：**
すべてのデータはGoogleスプレッドシートに保存されます。システムを通さず、直接スプレッドシートを編集することも可能です。
    `,
  },
  {
    id: 'first-login',
    title: '初回ログイン・セットアップ',
    icon: 'rocket_launch',
    content: `
**最初のログイン（オーナー）：**
1. Googleアカウントでログインします
2. 最初にログインした方が自動的に「オーナー」として登録されます
3. 単会名を入力してセットアップを完了してください

**2人目以降のユーザー：**
オーナーが「設定」→「ユーザー管理」でGoogleアカウントのメールアドレスを登録する必要があります。
登録されていないアカウントではログインできません。
    `,
  },
  {
    id: 'members',
    title: '会員名簿の使い方',
    icon: 'people',
    content: `
**会員の追加：**
「会員名簿」画面の「新規追加」ボタンをクリックして、情報を入力してください。

**会員情報の編集：**
名簿の行をクリックすると、詳細編集画面が開きます。

**ステータスのクイック編集：**
名簿の一覧画面で、ステータスのドロップダウンを直接変更できます。
入会ステータスやカスタムフィールドのステータスをワンクリックで変更可能です。

**検索・フィルタ：**
- 検索ボックス：氏名、会社名、メールアドレスで絞り込み
- ステータスフィルタ：入会ステータスで絞り込み
- 見出しクリック：氏名や会社名で並べ替え

**スプレッドシートとの連携：**
会員名簿のデータはGoogleスプレッドシートの「会員名簿」シートに保存されます。
直接スプレッドシートを編集しても、システムに反映されます。
1行目がヘッダーになっているので、列の順序を変更しても動作します。
    `,
  },
  {
    id: 'events',
    title: 'イベント管理',
    icon: 'event',
    content: `
**イベントの作成：**
「イベント」画面の「新規イベント」ボタンからイベントを作成します。
イベント名、種類、日時、場所を入力してください。

**出席管理：**
1. イベントをクリックして詳細画面を開きます
2. 「会員を追加」ドロップダウンから出席者を追加します
3. 出席状態（出席/欠席/遅刻/未定）をドロップダウンで変更できます

**参加率の確認：**
ダッシュボードの「種類別参加率」でイベント種類ごとの参加率を確認できます。
    `,
  },
  {
    id: 'custom-fields',
    title: 'カスタムフィールド',
    icon: 'add_circle_outline',
    content: `
**カスタムフィールドとは：**
会員名簿に独自の選択肢フィールドを追加できる機能です。
単会独自の管理項目を自由に追加できます。

**使い方の例：**
- 「BNI明朗チャプターステータス」（登録済/審査中/検討中 等）
- 「紹介者ステータス」（既存会員/新規紹介/自主参加 等）
- 「役職」（会長/副会長/幹事/一般会員 等）

**追加手順：**
1. 「設定」→「カスタムフィールド」タブを開きます
2. フィールド名を入力して「フィールド追加」をクリック
3. 追加されたフィールドをクリックして展開
4. 選択肢を追加していきます

**注意事項：**
- カスタムフィールドを追加すると、Googleスプレッドシートの「会員名簿」シートに新しい列が自動追加されます
- 削除（無効化）しても、スプレッドシートの列は残ります（データ保護のため）
    `,
  },
  {
    id: 'settings',
    title: '設定（オーナーのみ）',
    icon: 'settings',
    content: `
設定画面はオーナー権限を持つユーザーのみアクセスできます。

**基本設定：**
- 単会名の変更
- Googleスプレッドシートへのリンク

**ユーザー管理：**
- ユーザーの追加・削除
- 追加するとスプレッドシートの編集権限も自動付与
- 削除するとスプレッドシートの編集権限も自動削除
- オーナーは削除できません

**入会ステータス選択肢：**
会員名簿の「入会ステータス」の選択肢を自由に編集できます。

**カスタムフィールド：**
独自の選択肢フィールドを追加・管理できます（上記参照）。

**イベント種類：**
イベント作成時に選択できる種類を管理します。
    `,
  },
  {
    id: 'spreadsheet',
    title: 'スプレッドシートの構成',
    icon: 'table_chart',
    content: `
データは以下のシートで管理されています。直接編集も可能です。

**会員名簿：**
ID, 氏名, ふりがな, メールアドレス, 携帯電話番号, 会社名, 住所, 会社電話番号, 入会ステータス, 備考, 登録日, 更新日
（＋カスタムフィールドで追加した列）

**イベント：**
ID, イベント名, 種類, 日時, 場所, 説明, 登録日

**イベント出席：**
ID, イベントID, 会員ID, 氏名, 出席状態, 備考

**ユーザー：**
ID, メールアドレス, 表示名, Googleアカウント画像, ロール, 登録日

**設定 / 入会ステータス選択肢 / カスタムフィールド / カスタムフィールド選択肢 / イベント種類：**
システム設定用のシート

**重要なポイント：**
- 1行目はヘッダー行です。削除しないでください
- 列の順序を変更しても問題ありません（列名ベースでアクセスしています）
- ID列の値は変更しないでください
    `,
  },
];

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <div className="help-page">
      <div className="page-header">
        <h1 className="page-title">利用マニュアル</h1>
        <p className="page-subtitle">システムの使い方をご案内します</p>
      </div>

      <div className="help-layout">
        <nav className="help-nav">
          {sections.map(s => (
            <button
              key={s.id}
              className={`help-nav-item ${activeSection === s.id ? 'active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              <Icon name={s.icon} size={18} />
              <span>{s.title}</span>
            </button>
          ))}
        </nav>

        <div className="help-content card">
          <div className="card-body">
            {sections.filter(s => s.id === activeSection).map(s => (
              <div key={s.id}>
                <h2 className="help-section-title">
                  <Icon name={s.icon} size={24} />
                  {s.title}
                </h2>
                <div className="help-text" dangerouslySetInnerHTML={{ __html: markdownToHtml(s.content) }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple markdown-like parser
function markdownToHtml(text) {
  return text
    .trim()
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    // Fix nested ul
    .replace(/<\/li><br \/><li>/g, '</li><li>')
    .replace(/<p><ul>/g, '<ul>')
    .replace(/<\/ul><\/p>/g, '</ul>');
}
