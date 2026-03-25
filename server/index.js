const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Load env in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const eventRoutes = require('./routes/events');
const settingsRoutes = require('./routes/settings');
const dashboardRoutes = require('./routes/dashboard');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8080;

// Cloud Run のロードバランサー経由のリクエストを信頼
// （secure Cookie の設定に必要）
app.set('trust proxy', true);

// Middleware
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Auth routes (no auth middleware needed)
app.use('/auth', authRoutes);

// Protected API routes
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/members', authMiddleware, memberRoutes);
app.use('/api/events', authMiddleware, eventRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);

// Serve static files in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'サーバーエラーが発生しました' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
