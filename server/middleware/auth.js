const jwt = require('jsonwebtoken');
const sheets = require('../services/sheets');

const JWT_SECRET = process.env.JWT_SECRET || 'rinri-member-system-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d';

function generateToken(user) {
  return jwt.sign(
    { email: user.email, name: user.name, picture: user.picture, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  // Check Authorization header first, then cookie
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'トークンが無効です' });
  }

  // Verify user exists in system
  try {
    const { data } = await sheets.getSheetData('ユーザー');
    const user = data.find(u => u['メールアドレス'] === decoded.email);
    if (!user) {
      return res.status(403).json({ error: 'このシステムへのアクセス権がありません' });
    }
    req.user = {
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
      role: user['ロール'] || 'member',
      _rowIndex: user._rowIndex,
    };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: '認証処理中にエラーが発生しました' });
  }
}

function ownerOnly(req, res, next) {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'オーナー権限が必要です' });
  }
  next();
}

module.exports = { authMiddleware, ownerOnly, generateToken, verifyToken, JWT_SECRET };
