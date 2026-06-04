/**
 * CSVインポートルーター
 * CSVファイルから会員名簿への一括インポート
 */
const express = require('express');
const sheets = require('../services/sheets');
const { normalizeName, normalizeFurigana } = require('../utils/normalize');
const router = express.Router();

// 基本フィールド（シート列名 → 表示名）
const BASE_MEMBER_FIELDS = [
  '法人会員番号', '氏名', 'ふりがな', 'メールアドレス', '携帯電話番号',
  '会社名', '住所', '会社電話番号', '入会ステータス', '備考',
];

/**
 * GET /api/members/import/fields
 * マッピング先候補のフィールド一覧を返す（選択肢つき）
 */
router.get('/fields', async (req, res) => {
  try {
    await sheets.ensureColumn('会員名簿', '法人会員番号', { textFormat: true });
    const { headers } = await sheets.getSheetData('会員名簿');
    const customFields = await sheets.getCustomFields();
    const cfNames = customFields.map(cf => cf.name);

    // 入会ステータスの選択肢
    const { data: statusData } = await sheets.getSheetData('入会ステータス選択肢');
    const statusOptions = statusData.map(s => s['選択肢名'] || '').filter(Boolean);

    // カスタムフィールドの選択肢
    const cfWithOptions = [];
    for (const cf of customFields) {
      const options = await sheets.getCustomFieldOptions(cf.id);
      cfWithOptions.push({
        id: cf.id,
        name: cf.name,
        options: options.map(o => o.name),
      });
    }

    // 追加列（基本列・システム列・カスタムフィールド列を除外）
    const systemCols = new Set([
      'ID', '登録日', '更新日', ...BASE_MEMBER_FIELDS, ...cfNames,
    ]);
    const extraFields = headers.filter(h => !systemCols.has(h));

    // マッピング可能なフィールド一覧
    const fields = BASE_MEMBER_FIELDS.map(name => {
      if (name === '入会ステータス') {
        return { name, type: 'select', options: statusOptions };
      }
      const cf = cfWithOptions.find(c => c.name === name);
      if (cf) return { name, type: 'select', options: cf.options };
      return { name, type: 'text' };
    });

    // カスタムフィールドを追加
    for (const cf of cfWithOptions) {
      if (!BASE_MEMBER_FIELDS.includes(cf.name)) {
        fields.push({ name: cf.name, type: 'select', options: cf.options });
      }
    }

    // 追加列
    for (const col of extraFields) {
      fields.push({ name: col, type: 'text' });
    }

    res.json({ fields });
  } catch (err) {
    console.error('Get import fields error:', err);
    res.status(500).json({ error: 'フィールド情報の取得に失敗しました' });
  }
});

/**
 * POST /api/members/import/preview
 * CSVデータとマッピング設定を受け取り、プレビューを返す
 *
 * body: {
 *   rows: [{ col1: val1, col2: val2, ... }, ...],  // CSV解析済みデータ
 *   fieldMap: { csvCol: memberField, ... },          // 列マッピング
 *   nameField: 'csvCol',                             // 氏名照合キー
 *   valueMap: { memberField: { csvValue: memberValue, ... }, ... }  // 値マッピング
 * }
 */
router.post('/preview', async (req, res) => {
  try {
    const { rows, fieldMap, nameField, valueMap } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'CSVデータがありません' });
    }
    if (!nameField) {
      return res.status(400).json({ error: '氏名フィールドが指定されていません' });
    }

    // 会員名簿を読み込み
    const { data: members } = await sheets.getSheetData('会員名簿');

    // 名前→会員のマップ（正規化済み）
    const memberByName = {};
    for (const m of members) {
      const normalized = normalizeName(m['氏名']);
      if (normalized) memberByName[normalized] = m;
    }

    const entries = [];
    const seenNames = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const csvName = row[nameField] || '';
      const normalizedCsvName = normalizeName(csvName);

      if (!normalizedCsvName) continue; // 名前なしの行はスキップ

      // CSVデータを会員フィールドにマッピング（値マッピングも適用）
      const mappedData = {};
      for (const [csvCol, memberCol] of Object.entries(fieldMap || {})) {
        if (!memberCol || csvCol === nameField) continue;
        let value = row[csvCol] || '';
        // 値マッピングがあれば適用
        if (valueMap && valueMap[memberCol] && value in valueMap[memberCol]) {
          value = valueMap[memberCol][value];
        }
        // 正規化
        if (memberCol === 'ふりがな') {
          value = normalizeFurigana(value);
        }
        mappedData[memberCol] = value;
      }

      // 氏名フィールドのマッピング先を確認
      const nameMappedCol = fieldMap[nameField];
      if (nameMappedCol === '氏名' || !nameMappedCol) {
        mappedData['氏名'] = csvName;
      }

      // 名前で会員を検索
      const member = memberByName[normalizedCsvName];

      // 差分検出
      const diffs = [];
      if (member) {
        for (const [field, csvValue] of Object.entries(mappedData)) {
          if (field === '氏名') continue; // 氏名は照合キーなのでスキップ
          const memberValue = member[field] || '';
          let compareCsv = csvValue;
          let compareMember = memberValue;
          if (field === 'ふりがな') {
            compareCsv = normalizeFurigana(csvValue);
            compareMember = normalizeFurigana(memberValue);
          }
          if (compareCsv && compareCsv !== compareMember) {
            diffs.push({ field, csvValue, memberValue });
          }
        }
      }

      // 重複検出
      let duplicateGroup = null;
      if (seenNames[normalizedCsvName] !== undefined) {
        duplicateGroup = normalizedCsvName;
      } else {
        seenNames[normalizedCsvName] = i;
      }

      entries.push({
        rowIndex: i,
        csvName,
        normalizedName: normalizedCsvName,
        matched: !!member,
        memberId: member ? member['ID'] : null,
        memberName: member ? member['氏名'] : null,
        diffs,
        duplicateGroup,
        mappedData,
      });
    }

    // 先の行にもduplicateGroupを付与
    const dupNames = new Set(entries.filter(e => e.duplicateGroup).map(e => e.duplicateGroup));
    for (const entry of entries) {
      if (!entry.duplicateGroup && dupNames.has(entry.normalizedName)) {
        entry.duplicateGroup = entry.normalizedName;
      }
    }

    res.json({
      entries,
      totalRows: rows.length,
    });
  } catch (err) {
    console.error('CSV preview error:', err);
    res.status(500).json({ error: `プレビューの生成に失敗しました: ${err.message}` });
  }
});

/**
 * POST /api/members/import/execute
 * body: {
 *   updates: [{ memberId, updates: { field: value } }],  // 既存会員の更新
 *   newMembers: [{ name, fields: { memberCol: value } }]  // 新規会員の追加
 * }
 */
router.post('/execute', async (req, res) => {
  try {
    await sheets.ensureColumn('会員名簿', '法人会員番号', { textFormat: true });
    const { updates, newMembers } = req.body;
    if ((!updates || updates.length === 0) && (!newMembers || newMembers.length === 0)) {
      return res.status(400).json({ error: '取り込む対象がありません' });
    }

    let updatedCount = 0;
    let newMemberCount = 0;

    // 1) 既存会員の情報更新
    if (updates && updates.length > 0) {
      const { data: members } = await sheets.getSheetData('会員名簿');
      const now = new Date().toISOString();
      for (const entry of updates) {
        if (!entry.updates || Object.keys(entry.updates).length === 0) continue;
        const member = members.find(m => m['ID'] === entry.memberId);
        if (!member) continue;
        const updatedData = { ...member, '更新日': now };
        for (const [field, value] of Object.entries(entry.updates)) {
          updatedData[field] = field === 'ふりがな' ? normalizeFurigana(value) : value;
        }
        await sheets.updateRow('会員名簿', member._rowIndex, updatedData);
        updatedCount++;
      }
    }

    // 2) 新規会員の一括追加
    const newMemberRows = [];
    for (const nm of (newMembers || [])) {
      const now = new Date().toISOString();
      const fields = { ...nm.fields };
      if (fields['ふりがな']) {
        fields['ふりがな'] = normalizeFurigana(fields['ふりがな']);
      }
      newMemberRows.push({
        'ID': sheets.generateId(),
        '登録日': now,
        '更新日': now,
        '氏名': nm.name || '',
        ...fields,
      });
      newMemberCount++;
    }

    if (newMemberRows.length > 0) {
      await sheets.appendRows('会員名簿', newMemberRows);
    }

    res.json({ success: true, updatedCount, newMemberCount });
  } catch (err) {
    console.error('CSV execute error:', err);
    res.status(500).json({ error: `インポートに失敗しました: ${err.message}` });
  }
});

module.exports = router;
