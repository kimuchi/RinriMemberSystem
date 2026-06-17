/**
 * Google Sheets Service
 * 列名ベースでアクセスし、列の並び順が変わっても動作するよう設計
 * カスタムフィールド対応：管理画面で追加した選択肢フィールドを名簿に動的追加
 */
const { google } = require('googleapis');

class SheetsService {
  constructor() {
    this.sheets = null;
    this.drive = null;
    this.spreadsheetId = process.env.SPREADSHEET_ID;
    // In-memory cache: { sheetName: { data, timestamp } }
    this._cache = {};
    this._cacheTTL = 30 * 1000; // 30 seconds
  }

  async init() {
    if (this.sheets) return;
    const auth = new google.auth.GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
    const client = await auth.getClient();
    this.sheets = google.sheets({ version: 'v4', auth: client });
    this.drive = google.drive({ version: 'v3', auth: client });
  }

  // ============ Core Sheet Operations ============

  _getCached(sheetName) {
    const entry = this._cache[sheetName];
    if (entry && (Date.now() - entry.timestamp) < this._cacheTTL) {
      return entry.data;
    }
    return null;
  }

  _setCache(sheetName, data) {
    this._cache[sheetName] = { data, timestamp: Date.now() };
  }

  invalidateCache(sheetName) {
    if (sheetName) {
      delete this._cache[sheetName];
    } else {
      this._cache = {};
    }
  }

  async getSheetData(sheetName) {
    await this.init();

    // Check cache first
    const cached = this._getCached(sheetName);
    if (cached) return cached;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:ZZ`,
    });
    const rows = res.data.values || [];
    if (rows.length === 0) {
      const result = { headers: [], data: [], headerMap: {} };
      this._setCache(sheetName, result);
      return result;
    }

    const headers = rows[0];
    const headerMap = {};
    headers.forEach((h, i) => { headerMap[h] = i; });

    const data = rows.slice(1).map((row, rowIndex) => {
      const obj = { _rowIndex: rowIndex + 2 };
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });

    const result = { headers, data, headerMap };
    this._setCache(sheetName, result);
    return result;
  }

  /**
   * Get only headers (uses cache, avoids full data parse if only headers needed)
   */
  async getHeaders(sheetName) {
    const { headers, headerMap } = await this.getSheetData(sheetName);
    return { headers, headerMap };
  }

  /**
   * シートの実際の行数をAPIから直接取得（キャッシュ不使用）
   */
  async _getActualRowCount(sheetName) {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:A`,
    });
    return (res.data.values || []).length;
  }

  async appendRow(sheetName, rowData) {
    await this.appendRows(sheetName, [rowData]);
  }

  async appendRows(sheetName, rowDataArray) {
    if (!rowDataArray || rowDataArray.length === 0) return;
    await this.init();
    const { headers } = await this.getSheetData(sheetName);
    const rows = rowDataArray.map(rowData => headers.map(h => rowData[h] || ''));

    // キャッシュではなくAPIから直接最終行を取得
    const actualRows = await this._getActualRowCount(sheetName);
    const startRow = actualRows + 1;
    console.log(`appendRows(${sheetName}): ${rows.length} rows at row ${startRow}`);

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A${startRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });
    this.invalidateCache(sheetName);
  }

  async updateRow(sheetName, rowNumber, rowData) {
    await this.init();
    const { headers } = await this.getSheetData(sheetName);
    const row = headers.map(h =>
      rowData[h] !== undefined ? rowData[h] : ''
    );

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A${rowNumber}:ZZ${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    this.invalidateCache(sheetName);
  }

  /**
   * 複数行を1回のAPIコールでまとめて更新（書き込みレート制限対策）
   * @param {string} sheetName
   * @param {Array<{rowIndex:number, rowData:Object}>} updates
   */
  async batchUpdateRows(sheetName, updates) {
    if (!updates || updates.length === 0) return;
    await this.init();
    const { headers } = await this.getSheetData(sheetName);
    const lastCol = this.colToLetter(headers.length - 1);
    const data = updates.map(({ rowIndex, rowData }) => ({
      range: `${sheetName}!A${rowIndex}:${lastCol}${rowIndex}`,
      values: [headers.map(h => (rowData[h] !== undefined ? rowData[h] : ''))],
    }));

    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
    this.invalidateCache(sheetName);
  }

  /**
   * 複数セルを1回のAPIコールでまとめて更新（書き込みレート制限対策）
   * @param {string} sheetName
   * @param {Array<{rowIndex:number, columnName:string, value:any}>} cellUpdates
   */
  async batchUpdateCells(sheetName, cellUpdates) {
    if (!cellUpdates || cellUpdates.length === 0) return;
    await this.init();
    const { headerMap } = await this.getSheetData(sheetName);
    const data = [];
    for (const { rowIndex, columnName, value } of cellUpdates) {
      const colIndex = headerMap[columnName];
      if (colIndex === undefined) continue;
      const colLetter = this.colToLetter(colIndex);
      data.push({ range: `${sheetName}!${colLetter}${rowIndex}`, values: [[value]] });
    }
    if (data.length === 0) return;

    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
    this.invalidateCache(sheetName);
  }

  async deleteRow(sheetName, rowNumber) {
    await this.init();
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const sheet = spreadsheet.data.sheets.find(
      s => s.properties.title === sheetName
    );
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        }],
      },
    });
    this.invalidateCache(sheetName);
  }

  async updateCell(sheetName, rowNumber, columnName, value) {
    await this.init();
    const { headerMap } = await this.getSheetData(sheetName);
    const colIndex = headerMap[columnName];
    if (colIndex === undefined) throw new Error(`Column "${columnName}" not found`);

    const colLetter = this.colToLetter(colIndex);
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!${colLetter}${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[value]] },
    });
    this.invalidateCache(sheetName);
  }

  // ============ Column Management ============

  async addColumnToSheet(sheetName, columnName) {
    await this.init();
    const { headers } = await this.getSheetData(sheetName);
    if (headers.includes(columnName)) return;

    const nextCol = this.colToLetter(headers.length);
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!${nextCol}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[columnName]] },
    });
    this.invalidateCache(sheetName);
  }

  async renameColumn(sheetName, oldName, newName) {
    await this.init();
    const { headerMap } = await this.getSheetData(sheetName);
    const colIndex = headerMap[oldName];
    if (colIndex === undefined) return false;

    const colLetter = this.colToLetter(colIndex);
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!${colLetter}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newName]] },
    });
    this.invalidateCache(sheetName);
    return true;
  }

  /**
   * 列が存在しなければ追加する。textFormat=true の場合、
   * 新規追加した列を「テキスト書式」にして先頭ゼロ等が消えないようにする。
   * 既存列の場合は何もしない（書式の再設定もしない）。
   * @returns {boolean} 新規追加したら true
   */
  async ensureColumn(sheetName, columnName, { textFormat = false } = {}) {
    await this.init();
    const { headers } = await this.getSheetData(sheetName);
    if (headers.includes(columnName)) return false;
    await this.addColumnToSheet(sheetName, columnName);
    if (textFormat) {
      await this.setColumnFormatToText(sheetName, columnName);
    }
    return true;
  }

  /**
   * 指定列をテキスト書式に設定する（列全体＝将来の行も含む）。
   * これにより "007" のような先頭ゼロ付き文字列が数値化されず保持される。
   */
  async setColumnFormatToText(sheetName, columnName) {
    await this.init();
    const { headerMap } = await this.getSheetData(sheetName);
    const colIndex = headerMap[columnName];
    if (colIndex === undefined) return false;

    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) return false;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            // 行インデックスを省略 → 列全体（既存・将来の行を含む）
            range: {
              sheetId: sheet.properties.sheetId,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1,
            },
            cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        }],
      },
    });
    this.invalidateCache(sheetName);
    return true;
  }

  // ============ Custom Fields ============

  async getCustomFields() {
    const { data } = await this.getSheetData('カスタムフィールド');
    return data
      .filter(d => d['有効'] !== 'false')
      .sort((a, b) => (parseInt(a['表示順']) || 99) - (parseInt(b['表示順']) || 99))
      .map(d => ({
        id: d['ID'],
        name: d['フィールド名'],
        type: d['フィールド種類'] || 'select',
        order: d['表示順'],
        _rowIndex: d._rowIndex,
      }));
  }

  async getCustomFieldOptions(fieldId) {
    const { data } = await this.getSheetData('カスタムフィールド選択肢');
    return data
      .filter(d => d['フィールドID'] === fieldId)
      .sort((a, b) => (parseInt(a['表示順']) || 99) - (parseInt(b['表示順']) || 99))
      .map(d => ({
        name: d['選択肢名'],
        order: d['表示順'],
        _rowIndex: d._rowIndex,
      }));
  }

  // ============ Attendance Extra Columns ============

  /**
   * イベント出席シートの基本列（システム列）
   * これ以外の列は「自由列」としてフォーム取込・受付名簿出力で利用できる
   */
  static get ATTENDANCE_BASE_COLUMNS() {
    return ['ID', 'イベントID', '会員ID', '氏名', '出席状態', '備考'];
  }

  /**
   * イベント出席シートの自由列（基本列以外）を返す
   */
  async getAttendanceExtraColumns() {
    const { headers } = await this.getSheetData('イベント出席');
    const base = new Set(SheetsService.ATTENDANCE_BASE_COLUMNS);
    return headers.filter(h => !base.has(h));
  }

  // ============ Spreadsheet Setup ============

  async setupSpreadsheet() {
    await this.init();

    const sheetConfigs = [
      {
        name: '会員名簿',
        headers: ['ID', '登録日', '更新日', '法人会員番号', '氏名', 'ふりがな', '別名', '別名ふりがな', 'メールアドレス', '携帯電話番号',
          '会社名', '住所', '会社電話番号', '入会ステータス', '入会月', '振替開始月', '備考'],
      },
      {
        name: 'イベント',
        headers: ['ID', 'イベント名', '種類', '日時', '場所', '説明', '登録日'],
      },
      {
        name: 'イベント出席',
        headers: ['ID', 'イベントID', '会員ID', '氏名', '出席状態', '備考'],
      },
      {
        name: 'ユーザー',
        headers: ['ID', 'メールアドレス', '表示名', 'Googleアカウント画像', 'ロール', '登録日'],
      },
      {
        name: '設定',
        headers: ['キー', '値'],
      },
      {
        name: '入会ステータス選択肢',
        headers: ['選択肢名', '表示順'],
      },
      {
        name: 'カスタムフィールド',
        headers: ['ID', 'フィールド名', 'フィールド種類', '表示順', '有効'],
      },
      {
        name: 'カスタムフィールド選択肢',
        headers: ['フィールドID', '選択肢名', '表示順'],
      },
      {
        name: 'イベント種類',
        headers: ['種類名', '表示順'],
      },
      {
        name: 'ダッシュボードカード',
        headers: ['ID', '表示名', 'アイコン', '色', '集計ステータス', '表示順', '有効'],
      },
    ];

    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);

    for (const config of sheetConfigs) {
      if (!existingSheets.includes(config.name)) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: config.name } } }],
          },
        });
      }
      // ヘッダーが存在しない場合は書き込む（シートが既存でも空の場合に対応）
      const { headers: existingHeaders } = await this.getSheetData(config.name);
      if (existingHeaders.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${config.name}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [config.headers] },
        });
      }
    }

    // デフォルトの入会ステータス選択肢
    const { data: statusData } = await this.getSheetData('入会ステータス選択肢');
    if (statusData.length === 0) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: '入会ステータス選択肢!A:B',
        valueInputOption: 'RAW',
        requestBody: { values: [
          ['新規登録済', '1'], ['移籍登録済', '2'], ['複数口目として登録済', '3'],
          ['申込書受領中', '4'], ['検討中', '5'],
        ]},
      });
    }

    // デフォルトのイベント種類
    const { data: eventTypeData } = await this.getSheetData('イベント種類');
    if (eventTypeData.length === 0) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'イベント種類!A:B',
        valueInputOption: 'RAW',
        requestBody: { values: [
          ['モーニングセミナー', '1'], ['経営者の集い', '2'],
          ['倫理経営講演会', '3'], ['その他', '4'],
        ]},
      });
    }

    // デフォルトのダッシュボードカード
    const { data: dashCardData } = await this.getSheetData('ダッシュボードカード');
    if (dashCardData.length === 0) {
      const PROSPECTS = '新規登録済,複数口目として登録済,移籍予定,申込書受領済,申込予定,クロージング中,入会保留中';
      const REGISTERED = '新規登録済,複数口目として登録済,移籍登録済';
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'ダッシュボードカード!A:G',
        valueInputOption: 'RAW',
        requestBody: { values: [
          [this.generateId(), '登録済み会員', 'how_to_reg', 'primary', REGISTERED, '1', 'true'],
          [this.generateId(), '見込み含む', 'group_add', 'info', PROSPECTS, '2', 'true'],
          [this.generateId(), 'お声がけ中', 'connect_without_contact', 'warning', '検討中', '3', 'true'],
          [this.generateId(), '名簿総数', 'groups', 'muted', '*', '4', 'true'],
        ]},
      });
    }

    // 法人会員番号列は先頭ゼロを保持するためテキスト書式にする
    try {
      await this.setColumnFormatToText('会員名簿', '法人会員番号');
    } catch (e) {
      console.error('Set 法人会員番号 text format error:', e);
    }

    return true;
  }

  // ============ Dashboard Cards ============

  async _ensureDashboardCards() {
    if (this._dashCardsEnsured) return;
    const headers = ['ID', '表示名', 'アイコン', '色', '集計ステータス', '表示順', '有効'];
    await this.ensureSheet('ダッシュボードカード', headers);
    const { data: existing } = await this.getSheetData('ダッシュボードカード');
    if (existing.length === 0) {
      const PROSPECTS = '新規登録済,複数口目として登録済,移籍予定,申込書受領済,申込予定,クロージング中,入会保留中';
      const REGISTERED = '新規登録済,複数口目として登録済,移籍登録済';
      await this.appendRows('ダッシュボードカード', [
        { 'ID': this.generateId(), '表示名': '登録済み会員', 'アイコン': 'how_to_reg', '色': 'primary', '集計ステータス': REGISTERED, '表示順': '1', '有効': 'true' },
        { 'ID': this.generateId(), '表示名': '見込み含む', 'アイコン': 'group_add', '色': 'info', '集計ステータス': PROSPECTS, '表示順': '2', '有効': 'true' },
        { 'ID': this.generateId(), '表示名': 'お声がけ中', 'アイコン': 'connect_without_contact', '色': 'warning', '集計ステータス': '検討中', '表示順': '3', '有効': 'true' },
        { 'ID': this.generateId(), '表示名': '名簿総数', 'アイコン': 'groups', '色': 'muted', '集計ステータス': '*', '表示順': '4', '有効': 'true' },
      ]);
    }
    this._dashCardsEnsured = true;
  }

  async getDashboardCards() {
    await this._ensureDashboardCards();
    const { data } = await this.getSheetData('ダッシュボードカード');
    return data
      .filter(d => d['有効'] !== 'false')
      .sort((a, b) => (parseInt(a['表示順']) || 99) - (parseInt(b['表示順']) || 99))
      .map(d => ({
        id: d['ID'],
        label: d['表示名'] || '',
        icon: d['アイコン'] || 'group',
        color: d['色'] || 'muted',
        statuses: (d['集計ステータス'] || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        order: d['表示順'],
        enabled: d['有効'] !== 'false',
        _rowIndex: d._rowIndex,
      }));
  }

  // ============ External Spreadsheet Access ============

  /**
   * 外部スプレッドシートのシート名一覧を取得
   */
  async getExternalSheetNames(spreadsheetId) {
    await this.init();
    try {
      const res = await this.sheets.spreadsheets.get({ spreadsheetId });
      return res.data.sheets.map(s => s.properties.title);
    } catch (err) {
      if (err.code === 403 || err.code === 404) {
        const email = await this.getServiceAccountEmail();
        throw new Error(
          `スプレッドシートにアクセスできません。以下のサービスアカウントにスプレッドシートの共有（閲覧者以上）を設定してください: ${email}`
        );
      }
      throw err;
    }
  }

  /**
   * 外部スプレッドシートのデータを取得
   */
  async getExternalSheetData(spreadsheetId, sheetName) {
    await this.init();
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:ZZ`,
      });
      const rows = res.data.values || [];
      if (rows.length === 0) return { headers: [], data: [] };

      const headers = rows[0];
      const data = rows.slice(1).map((row, i) => {
        const obj = { _rowIndex: i + 2 };
        headers.forEach((h, j) => { obj[h] = row[j] || ''; });
        return obj;
      });
      return { headers, data };
    } catch (err) {
      if (err.code === 403 || err.code === 404) {
        const email = await this.getServiceAccountEmail();
        throw new Error(
          `スプレッドシートにアクセスできません。以下のサービスアカウントにスプレッドシートの共有（閲覧者以上）を設定してください: ${email}`
        );
      }
      throw err;
    }
  }

  /**
   * サービスアカウントのメールアドレスを取得
   */
  async getServiceAccountEmail() {
    await this.init();
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    return client.email || '(不明 - 環境変数を確認してください)';
  }

  /**
   * シートが存在しなければ作成する
   */
  async ensureSheet(sheetName, headers) {
    await this.init();
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const exists = spreadsheet.data.sheets.some(s => s.properties.title === sheetName);
    if (!exists) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
    }
    const { headers: existing } = await this.getSheetData(sheetName);
    if (existing.length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      this.invalidateCache(sheetName);
    }
  }

  // ============ Drive Permissions ============

  async shareWithUser(email, role = 'writer') {
    await this.init();
    try {
      await this.drive.permissions.create({
        fileId: this.spreadsheetId,
        requestBody: { type: 'user', role, emailAddress: email },
        sendNotificationEmail: false,
      });
      return true;
    } catch (err) {
      console.error('Share error:', err.message);
      return false;
    }
  }

  async revokeUserAccess(email) {
    await this.init();
    try {
      const permissions = await this.drive.permissions.list({
        fileId: this.spreadsheetId,
        fields: 'permissions(id,emailAddress)',
      });
      const perm = permissions.data.permissions.find(p => p.emailAddress === email);
      if (perm) {
        await this.drive.permissions.delete({
          fileId: this.spreadsheetId,
          permissionId: perm.id,
        });
      }
      return true;
    } catch (err) {
      console.error('Revoke error:', err.message);
      return false;
    }
  }

  // ============ Settings Helpers ============

  async getSetting(key) {
    const { data } = await this.getSheetData('設定');
    const row = data.find(d => d['キー'] === key);
    return row ? row['値'] : null;
  }

  async setSetting(key, value) {
    const { data } = await this.getSheetData('設定');
    const existing = data.find(d => d['キー'] === key);
    if (existing) {
      await this.updateCell('設定', existing._rowIndex, '値', value);
    } else {
      await this.appendRow('設定', { 'キー': key, '値': value });
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  colToLetter(colIndex) {
    let result = '';
    let n = colIndex;
    while (n >= 0) {
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26) - 1;
    }
    return result;
  }
}

module.exports = new SheetsService();
