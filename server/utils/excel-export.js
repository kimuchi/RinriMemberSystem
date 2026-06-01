/**
 * Excel エクスポート用の共通ヘルパー
 * Meiryo UI 11pt、ヘッダー強調、列幅自動調整、イベント○のハイライト、
 * ステータスごとの色分けを行う xlsx バッファを生成する。
 */
const ExcelJS = require('exceljs');

const FONT_NAME = 'Meiryo UI';
const FONT_SIZE = 11;

const COLOR = {
  headerBg:    'FF4A6FA5',
  headerFg:    'FFFFFFFF',
  altRowBg:    'FFF7F9FC',
  border:      'FFD0D0D0',
  eventMarkBg: 'FFE8F5E9',
  eventMarkFg: 'FF1B5E20',
};

// ダッシュボードカードの色キー → セル背景色（薄め）
const STATUS_FILL_BY_COLOR = {
  primary: 'FFE3F2FD',
  info:    'FFE0F7FA',
  success: 'FFE8F5E9',
  warning: 'FFFFF8E1',
  danger:  'FFFFEBEE',
  muted:   'FFF5F5F5',
};

function visualWidth(str) {
  if (!str) return 0;
  let w = 0;
  for (const ch of String(str)) {
    // Non-ASCII を全角扱い（CJK・全角記号など）
    w += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  }
  return w;
}

function thinBorder() {
  return {
    top:    { style: 'thin', color: { argb: COLOR.border } },
    left:   { style: 'thin', color: { argb: COLOR.border } },
    bottom: { style: 'thin', color: { argb: COLOR.border } },
    right:  { style: 'thin', color: { argb: COLOR.border } },
  };
}

/**
 * ダッシュボードカード設定からステータス→argb のマップを構築
 */
function buildStatusColorMap(dashboardCards) {
  const map = {};
  if (!Array.isArray(dashboardCards)) return map;
  for (const card of dashboardCards) {
    const argb = STATUS_FILL_BY_COLOR[card.color] || STATUS_FILL_BY_COLOR.muted;
    for (const s of (card.statuses || [])) {
      if (s === '*' || !s) continue;
      // 既に割り当て済みなら上書きしない（先勝ち）
      if (!map[s]) map[s] = argb;
    }
  }
  return map;
}

/**
 * xlsx バッファを生成
 * @param {Object} opts
 * @param {string} opts.sheetName
 * @param {Array<{label:string,isEventColumn?:boolean,isStatusColumn?:boolean}>} opts.columns
 * @param {Array<Array<any>>} opts.rows
 * @param {Object<string,string>} [opts.statusColorMap] - { statusName: argb }
 */
async function buildExcelBuffer({ sheetName, columns, rows, statusColorMap = {} }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rinri Member System';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);

  // ヘッダー + データ行を投入
  ws.addRow(columns.map(c => c.label || ''));
  for (const r of rows) ws.addRow(r);

  const totalRows = ws.rowCount;
  const totalCols = columns.length;

  // 全セルの基本スタイル
  for (let r = 1; r <= totalRows; r++) {
    const row = ws.getRow(r);
    row.height = r === 1 ? 26 : 18;
    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT_NAME, size: FONT_SIZE };
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: false };
    }
  }

  // ヘッダー行
  const headerRow = ws.getRow(1);
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true, color: { argb: COLOR.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }

  // ゼブラ（偶数データ行に薄色）
  for (let r = 2; r <= totalRows; r++) {
    if (r % 2 === 1) continue; // r=2,4,6,... = even-numbered data row (display上の偶数行)
    const row = ws.getRow(r);
    for (let c = 1; c <= totalCols; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.altRowBg } };
    }
  }

  // 列ごとの個別スタイル
  columns.forEach((col, idx) => {
    const colNum = idx + 1;

    // イベント列: 中央寄せ・○セルをハイライト（ゼブラを上書き）
    if (col.isEventColumn) {
      ws.getColumn(colNum).alignment = { horizontal: 'center', vertical: 'middle' };
      for (let r = 2; r <= totalRows; r++) {
        const cell = ws.getCell(r, colNum);
        if (cell.value === '○') {
          cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true, color: { argb: COLOR.eventMarkFg } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.eventMarkBg } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }
    }

    // 入会ステータス列: ステータスごとに背景色
    if (col.isStatusColumn && statusColorMap && Object.keys(statusColorMap).length > 0) {
      for (let r = 2; r <= totalRows; r++) {
        const cell = ws.getCell(r, colNum);
        const v = cell.value;
        if (v && statusColorMap[v]) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColorMap[v] } };
        }
      }
    }
  });

  // 列幅: ヘッダー＋データの最大幅から決定
  columns.forEach((col, idx) => {
    const wsCol = ws.getColumn(idx + 1);
    if (col.isEventColumn) {
      wsCol.width = 6;
      return;
    }
    let maxW = visualWidth(col.label || '');
    const sample = rows.length > 300 ? rows.slice(0, 300) : rows;
    for (const r of sample) {
      const v = r[idx];
      if (v != null && v !== '') {
        const w = visualWidth(String(v));
        if (w > maxW) maxW = w;
      }
    }
    // 全角=2, 半角=1 の合計が Excel の char width 単位とほぼ等価。少しだけ余白。
    wsCol.width = Math.min(Math.max(maxW + 2, 8), 50);
  });

  // ヘッダー固定
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * イベント受付用 出席登録リスト (A4縦) を生成
 * - タイトル / 開催情報
 * - 事前登録者一覧（番号・氏名・ふりがな・会社名・事前登録状態・チェック項目×N）
 * - ドタ参加用の空欄
 * @param {Object} opts
 * @param {{name:string,date?:string,location?:string,type?:string}} opts.event
 * @param {Array<{name:string,furigana:string,company:string,status:string}>} opts.attendees
 * @param {string[]} opts.checkItems  - 当日チェック列名（例: ['朝礼','MS','朝食会']）
 * @param {number} [opts.walkInRows]  - ドタ参加用の空行数（既定: 10）
 * @param {boolean} [opts.includeCompany] - 会社名列を含めるか（既定: true）
 */
async function buildAttendanceListExcel({
  event,
  attendees,
  checkItems = [],
  walkInRows = 10,
  includeCompany = true,
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rinri Member System';
  wb.created = new Date();
  const ws = wb.addWorksheet('出席登録リスト', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 },
    },
  });

  // ===== 列定義 =====
  // No | 氏名 | ふりがな | (会社名) | 事前登録 | チェック項目... | (備考は無し)
  const cols = [];
  cols.push({ key: 'no', label: 'No', width: 4 });
  cols.push({ key: 'name', label: '氏名', width: 18 });
  cols.push({ key: 'furigana', label: 'ふりがな', width: 16 });
  if (includeCompany) cols.push({ key: 'company', label: '会社名', width: 22 });
  cols.push({ key: 'status', label: '事前登録', width: 9 });
  for (const item of checkItems) {
    cols.push({ key: `check:${item}`, label: item, width: 6, isCheck: true });
  }
  const totalCols = cols.length;
  const lastColLetter = colToLetter(totalCols - 1);

  // ===== タイトル行 =====
  // 1行目: イベント名
  ws.getCell('A1').value = event.name || '(イベント名未設定)';
  ws.mergeCells(`A1:${lastColLetter}1`);
  ws.getCell('A1').font = { name: FONT_NAME, size: 16, bold: true };
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;

  // 2行目: 日時 / 場所 / 種類
  const info = [];
  if (event.date) info.push(`日時: ${formatDateTime(event.date)}`);
  if (event.location) info.push(`場所: ${event.location}`);
  if (event.type) info.push(`種類: ${event.type}`);
  ws.getCell('A2').value = info.join('　　') || '';
  ws.mergeCells(`A2:${lastColLetter}2`);
  ws.getCell('A2').font = { name: FONT_NAME, size: 11 };
  ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 20;

  // 3行目: サマリ（事前登録N名 / 印刷日）
  const summary = `事前登録: ${attendees.length}名　／　印刷日: ${formatDate(new Date())}`;
  ws.getCell('A3').value = summary;
  ws.mergeCells(`A3:${lastColLetter}3`);
  ws.getCell('A3').font = { name: FONT_NAME, size: 9, color: { argb: 'FF666666' } };
  ws.getCell('A3').alignment = { vertical: 'middle', horizontal: 'right' };
  ws.getRow(3).height = 16;

  // ===== ヘッダー行 (4行目) =====
  const HEADER_ROW = 4;
  const headerRow = ws.getRow(HEADER_ROW);
  cols.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.label;
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: COLOR.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  });
  headerRow.height = 26;

  // ===== 事前登録者データ行 =====
  let currentRow = HEADER_ROW + 1;
  attendees.forEach((att, i) => {
    const row = ws.getRow(currentRow);
    row.height = 24;
    cols.forEach((col, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.font = { name: FONT_NAME, size: 11 };
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: col.key === 'no' || col.key === 'status' || col.isCheck ? 'center' : 'left', wrapText: false };

      if (col.key === 'no') cell.value = i + 1;
      else if (col.key === 'name') cell.value = att.name || '';
      else if (col.key === 'furigana') cell.value = att.furigana || '';
      else if (col.key === 'company') cell.value = att.company || '';
      else if (col.key === 'status') {
        cell.value = att.status || '';
        // 事前登録は薄青、出席は薄緑などで分かりやすく
        const bg = statusFill(att.status);
        if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      } else if (col.isCheck) {
        // チェック欄は空（手書き用）。やや太い罫線で目立たせる
        cell.value = '';
        cell.border = checkBorder();
      }
    });
    currentRow++;
  });

  // ===== ドタ参加セクション =====
  if (walkInRows > 0) {
    // 区切り行
    const sepRow = ws.getRow(currentRow);
    sepRow.getCell(1).value = 'ドタ参加（飛び込み参加）';
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    sepRow.getCell(1).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FF1565C0' } };
    sepRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    sepRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    sepRow.getCell(1).border = thinBorder();
    sepRow.height = 22;
    currentRow++;

    // 空欄行
    const walkInStartNo = attendees.length + 1;
    for (let i = 0; i < walkInRows; i++) {
      const row = ws.getRow(currentRow);
      row.height = 26; // 手書きしやすい高さ
      cols.forEach((col, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        cell.font = { name: FONT_NAME, size: 11 };
        cell.border = thinBorder();
        cell.alignment = { vertical: 'middle', horizontal: col.key === 'no' || col.key === 'status' || col.isCheck ? 'center' : 'left' };
        if (col.key === 'no') {
          cell.value = walkInStartNo + i;
          cell.font = { name: FONT_NAME, size: 11, color: { argb: 'FF999999' } };
        } else if (col.isCheck) {
          cell.border = checkBorder();
        }
        // それ以外は空欄
      });
      currentRow++;
    }
  }

  // ===== 列幅を適用 =====
  cols.forEach((col, idx) => {
    ws.getColumn(idx + 1).width = col.width;
  });

  // タイトル+ヘッダー行を印刷時に各ページで繰り返し
  ws.pageSetup.printTitlesRow = `1:${HEADER_ROW}`;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function colToLetter(idx) {
  let result = '';
  let n = idx;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const day = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${y}年${mo}月${da}日（${day}）${h}:${mi}`;
}

function formatDate(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}/${mo}/${da}`;
}

function statusFill(status) {
  if (!status) return null;
  if (status === '出席') return 'FFE8F5E9';
  if (status === '事前登録') return 'FFE3F2FD';
  if (status === '遅刻') return 'FFFFF8E1';
  if (status === '欠席') return 'FFFFEBEE';
  return null;
}

// チェック欄用の罫線（やや濃いめ）
function checkBorder() {
  return {
    top:    { style: 'medium', color: { argb: 'FF888888' } },
    left:   { style: 'medium', color: { argb: 'FF888888' } },
    bottom: { style: 'medium', color: { argb: 'FF888888' } },
    right:  { style: 'medium', color: { argb: 'FF888888' } },
  };
}

module.exports = { buildExcelBuffer, buildStatusColorMap, buildAttendanceListExcel };
