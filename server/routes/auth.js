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
 * GET /auth/public-info - 認証不要の公開情報（単会名など）
 */
router.get('/public-info', async (req, res) => {
  try {
    const unitName = await sheets.getSetting('単会名');
    res.json({ unitName: unitName || null });
  } catch {
    res.json({ unitName: null });
  }
});

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

    // OAuth トークン取得時に専用クライアントを使う（共有インスタンスの競合を防ぐ）
    const callbackClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
    const { tokens } = await callbackClient.getToken(code);
    callbackClient.setCredentials(tokens);

    // ユーザー情報を取得
    const { google } = require('googleapis');
    const oauth2 = google.oauth2({ version: 'v2', auth: callbackClient });
    const { data: userInfo } = await oauth2.userinfo.get();

    const email = userInfo.email;
    const name = userInfo.name || email;
    const picture = userInfo.picture || '';
    console.log('Auth callback: user email =', email);

    // ユーザーシートを確認（シートが存在しない場合は初回セットアップへ）
    let users = [];
    try {
      const result = await sheets.getSheetData('ユーザー');
      users = result.data;
    } catch (sheetErr) {
      // シートが存在しない場合は空配列のまま（初回セットアップへ進む）
      console.log('ユーザーシート未作成、初回セットアップを実行します:', sheetErr.message);
    }

    let user = users.find(u => u['メールアドレス'] === email);
    console.log('Auth callback: existing user =', !!user, ', total users =', users.length);

    if (!user) {
      // 初めてのユーザーの場合
      if (users.length === 0) {
        // 最初のユーザー → オーナーとして登録 + スプレッドシートセットアップ
        console.log('Auth callback: first user setup starting');
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
        console.log('Auth callback: first user setup complete');
      } else {
        // 既存システムに登録されていないユーザー → アクセス拒否
        console.log('Auth callback: user not registered, access denied');
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
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    };
    console.log('Auth callback: setting cookie, secure =', cookieOptions.secure, ', protocol =', req.protocol, ', X-Forwarded-Proto =', req.get('X-Forwarded-Proto'));
    res.set('Cache-Control', 'no-store');
    res.cookie('auth_token', token, cookieOptions);

    res.redirect('/');
  } catch (err) {
    console.error('Auth callback error:', err.message);
    console.error('Auth callback stack:', err.stack);
    res.redirect('/?error=auth_failed');
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
    console.log('/auth/me: no token found. cookies =', Object.keys(req.cookies || {}));
    return res.json({ user: null });
  }

  const { verifyToken } = require('../middleware/auth');
  const decoded = verifyToken(token);
  if (!decoded) {
    console.log('/auth/me: token verification failed');
    return res.json({ user: null });
  }

  try {
    console.log('/auth/me: token valid, email =', decoded.email);
    const { data } = await sheets.getSheetData('ユーザー');
    console.log('/auth/me: ユーザーsheet rows =', data.length, ', emails =', data.map(u => u['メールアドレス']));
    const user = data.find(u => u['メールアドレス'] === decoded.email);
    if (!user) {
      console.log('/auth/me: user not found in sheet for email =', decoded.email);
      return res.json({ user: null });
    }

    // 単会名を取得
    const unitName = await sheets.getSetting('単会名');
    console.log('/auth/me: success, user =', decoded.email, ', unitName =', unitName);

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
 * GET /auth/debug - Cookie診断（本番デバッグ用、後で削除）
 */
router.get('/debug', (req, res) => {
  const hasCookie = !!(req.cookies && req.cookies.auth_token);
  const cookieHeader = req.headers.cookie || '(none)';
  const proto = req.protocol;
  const forwardedProto = req.get('X-Forwarded-Proto') || '(none)';
  res.json({
    hasCookie,
    cookieNames: Object.keys(req.cookies || {}),
    rawCookieHeader: cookieHeader.substring(0, 100),
    protocol: proto,
    forwardedProto,
    secure: req.secure,
    host: req.get('host'),
  });
});

/**
 * GET /auth/logout - ログアウト
 */
router.get('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.redirect('/');
});

module.exports = router;
