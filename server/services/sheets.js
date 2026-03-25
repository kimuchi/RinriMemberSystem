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

  async getSheetData(sheetName) {
    await this.init();
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:ZZ`,
    });
    const rows = res.data.values || [];
    if (rows.length === 0) return { headers: [], data: [], headerMap: {} };

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

    return { headers, data, headerMap };
  }

  async appendRow(sheetName, rowData) {
    await this.init();
    const { headers } = await this.getSheetData(sheetName);
    const row = headers.map(h => rowData[h] || '');
    console.log(`appendRow(${sheetName}): headers=${headers.length}, row=${JSON.stringify(row)}`);

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:A`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
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

  // ============ Spreadsheet Setup ============

  async setupSpreadsheet() {
    await this.init();

    const sheetConfigs = [
      {
        name: '会員名簿',
        headers: ['ID', '氏名', 'ふりがな', 'メールアドレス', '携帯電話番号',
          '会社名', '住所', '会社電話番号', '入会ステータス', '備考', '登録日', '更新日'],
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

    return true;
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
