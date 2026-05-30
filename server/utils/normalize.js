/**
 * カタカナをひらがなに変換
 */
function katakanaToHiragana(str) {
  return str.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/**
 * 日本語名のスペースを正規化
 * - 英語名（ASCII文字のみ）: スペース維持
 * - 日本語名: 全角・半角スペースを除去
 */
function normalizeName(name) {
  if (!name) return '';
  name = name.trim();
  if (/^[a-zA-Z\s\-'.]+$/.test(name)) return name;
  return name.replace(/[\s\u3000]+/g, '');
}

/**
 * ふりがなフィールド用の正規化（カタカナ→ひらがな変換 + スペース除去）
 * 英語名の場合はスペース維持
 */
function normalizeFurigana(name) {
  if (!name) return '';
  name = name.trim();
  // 英語名はそのまま返す
  if (/^[a-zA-Z\s\-'.]+$/.test(name)) return name;
  return katakanaToHiragana(name.replace(/[\s\u3000]+/g, ''));
}

module.exports = { katakanaToHiragana, normalizeName, normalizeFurigana };
