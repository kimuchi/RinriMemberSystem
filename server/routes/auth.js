const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const sheets = require('../services/sheets');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const REDIRECT_URI = (process.env.REDIRECT_URI || 'https://localhost:8080/auth/callback').trim();

const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

/**
 * GET /auth/login - Google OAuth開始
 */
router.get('/login', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    prompt: 'consent',
  });
  res.redirect(url);
});

/**
 * GET /auth/callback - Google OAuthコールバック
 */
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.redirect('/?error=no_code');
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // ユーザー情報を取得
    const { google } = require('googleapis');
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    const email = userInfo.email;
    const name = userInfo.name || email;
    const picture = userInfo.picture || '';

    // ユーザーシートを確認（シートが存在しない場合は初回セットアップへ）
    let users = [];
    try {
      const result = await sheets.getSheetData('ユーザー');
      users = result.data;
    } catch (sheetErr) {
      // シートが存在しない場合は空配列のまま（初回セットアップへ進む）
      console.log('ユーザーシート未作成、初回セットアップを実行します');
    }

    let user = users.find(u => u['メールアドレス'] === email);

    if (!user) {
      // 初めてのユーザーの場合
      if (users.length === 0) {
        // 最初のユーザー → オーナーとして登録 + スプレッドシートセットアップ
        await sheets.setupSpreadsheet();
        // ユーザーシートデータを再取得（セットアップ後）
        const newId = sheets.generateId();
        await sheets.appendRow('ユーザー', {
          'ID': newId,
          'メールアドレス': email,
          '表示名': name,
          'Googleアカウント画像': picture,
          'ロール': 'owner',
          '登録日': new Date().toISOString(),
        });
        // スプレッドシートの共有権限を付与
        await sheets.shareWithUser(email, 'writer');
        user = { 'ロール': 'owner' };
      } else {
        // 既存システムに登録されていないユーザー → アクセス拒否
        return res.redirect('/?error=not_registered');
      }
    } else {
      // 既存ユーザー → 情報を更新
      await sheets.updateCell('ユーザー', user._rowIndex, '表示名', name);
      await sheets.updateCell('ユーザー', user._rowIndex, 'Googleアカウント画像', picture);
    }

    // JWTトークン発行
    const token = generateToken({
      email,
      name,
      picture,
      role: user['ロール'] || 'member',
    });

    // Cookieにセット
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect('/');
  } catch (err) {
    console.error('Auth callback error:', err.message);
    console.error('Auth callback stack:', err.stack);
    res.redirect(`/?error=auth_failed&detail=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /auth/me - 現在のユーザー情報
 */
router.get('/me', async (req, res) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    return res.json({ user: null });
  }

  const { verifyToken } = require('../middleware/auth');
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.json({ user: null });
  }

  try {
    const { data } = await sheets.getSheetData('ユーザー');
    const user = data.find(u => u['メールアドレス'] === decoded.email);
    if (!user) {
      return res.json({ user: null });
    }

    // 単会名を取得
    const unitName = await sheets.getSetting('単会名');

    res.json({
      user: {
        email: decoded.email,
        name: user['表示名'] || decoded.name,
        picture: user['Googleアカウント画像'] || decoded.picture,
        role: user['ロール'],
      },
      unitName: unitName || null,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.json({ user: null });
  }
});

/**
 * POST /auth/setup - 初回セットアップ（単会名設定）
 */
router.post('/setup', async (req, res) => {
  let token = req.cookies?.auth_token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  if (!token) return res.status(401).json({ error: '認証が必要です' });

  const { verifyToken } = require('../middleware/auth');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'トークンが無効です' });

  try {
    const { unitName } = req.body;
    if (!unitName) return res.status(400).json({ error: '単会名を入力してください' });

    await sheets.setSetting('単会名', unitName);
    res.json({ success: true, unitName });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'セットアップに失敗しました' });
  }
});

/**
 * GET /auth/logout - ログアウト
 */
router.get('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.redirect('/');
});

module.exports = router;
