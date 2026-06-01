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

module.exports = { buildExcelBuffer, buildStatusColorMap };
