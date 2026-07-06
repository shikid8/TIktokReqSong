require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const cors     = require('cors');
const helmet   = require('helmet');

const config    = require('./server/config');
const queue     = require('./server/queue');
const tiktok    = require('./server/tiktok');
const simulator = require('./server/simulator');
const supabase  = require('./server/db');

// Tangkap semua error tidak terduga agar server tidak crash
process.on('uncaughtException', (err) => {
  console.error('[Global Error] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Global Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app    = express();
const server = http.createServer(app);

// ─── CORS & SECURITY ────────────────────────────────────────
const allowedOrigins = config.ALLOWED_ORIGINS;

app.use(helmet({
  contentSecurityPolicy: false, // disabled — Socket.IO CDN perlu akses eksternal
}));

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE'],
}));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

// ─── MIDDLEWARE ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── PAGE ROUTES ────────────────────────────────────────────
app.get('/',      (req, res) => res.redirect('/login'));

// Helper: injeksi konfigurasi Supabase ke dalam HTML
function injectSupabaseConfig(htmlPath, res, extraHeaders = {}) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const supabaseCfg = JSON.stringify({
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_KEY || '',
  });
  const injected = html.replace(
    '</head>',
    `<script>window.__SUPABASE__=${supabaseCfg};</script></head>`
  );
  res.setHeader('Content-Type', 'text/html');
  Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.send(injected);
}

app.get('/login', (req, res) => {
  injectSupabaseConfig(path.join(__dirname, 'public', 'login', 'index.html'), res);
});

// Dashboard — injeksi konfigurasi Supabase langsung ke HTML agar tidak terekspos di API publik
app.get('/dashboard', (req, res) => {
  injectSupabaseConfig(
    path.join(__dirname, 'public', 'dashboard', 'index.html'),
    res,
    { 'X-Robots-Tag': 'noindex, nofollow' }
  );
});

// Overlay — hanya untuk OBS, tidak perlu diindeks mesin pencari
app.get('/overlay', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'overlay', 'index.html'));
});

// ─── HEALTH CHECK (untuk Railway / Render) ──────────────────
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    uptime:  Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    queue:   queue.getState().queue.length,
  });
});

// ─── REST API ────────────────────────────────────────────────

// GET konfigurasi publik (non-sensitif) — kunci Supabase TIDAK disertakan di sini
app.get('/api/config', (req, res) => {
  res.json({
    defaultUsername: config.TIKTOK_USERNAME || null,
    requestPrefix:   config.REQUEST_PREFIX,
    maxQueueSize:    config.MAX_QUEUE_SIZE,
    hasYoutubeKey:   !!(config.YOUTUBE_API_KEY && !['your_youtube_api_key_here', ''].includes(config.YOUTUBE_API_KEY)),
  });
});

// Middleware Autentikasi (JWT / Query Token)
const authenticate = async (req, res, next) => {
  // 1. Cek JWT dari Authorization header (Untuk Dashboard)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      req.userId = user.id;
      return next();
    }
    console.error('Supabase Auth Error for token:', token.substring(0, 10) + '...', error);
    return res.status(401).json({ error: 'Unauthorized', details: error ? error.message : 'No user found' });
  }

  // 2. Cek Token dari Query parameter (Untuk OBS Overlay yang statis)
  const queryToken = req.query.token;
  if (queryToken) {
    // Sebagai penyederhanaan, token OBS adalah User UUID dari Supabase
    req.userId = queryToken;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized', details: 'No token provided' });
};

// GET state lengkap
app.get('/api/state', authenticate, (req, res) => {
  res.json(queue.getState(req.userId));
});

// POST connect ke TikTok Live
app.post('/api/connect', authenticate, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username diperlukan' });

  tiktok.connect(req.userId, username, (event) => {
    io.to(req.userId).emit(event.type, event.data);
    if (event.type === 'song_request') {
      io.to(req.userId).emit('queue_update', queue.getState(req.userId));
    }
  });

  res.json({ success: true, message: `Menghubungkan ke @${username}...` });
});

// POST disconnect
app.post('/api/disconnect', authenticate, (req, res) => {
  tiktok.disconnect(req.userId);
  res.json({ success: true });
});

// POST next song
app.post('/api/next', authenticate, (req, res) => {
  const song = queue.nextSong(req.userId);
  io.to(req.userId).emit('queue_update', queue.getState(req.userId));
  res.json({ currentSong: song, ...queue.getState(req.userId) });
});

// POST stop song (paksa berhenti)
app.post('/api/stop', authenticate, (req, res) => {
  queue.stopCurrent(req.userId);
  io.to(req.userId).emit('queue_update', queue.getState(req.userId));
  res.json({ success: true, ...queue.getState(req.userId) });
});

// DELETE hapus lagu dari antrian
app.delete('/api/queue/:id', authenticate, (req, res) => {
  queue.removeSong(req.userId, parseFloat(req.params.id));
  io.to(req.userId).emit('queue_update', queue.getState(req.userId));
  res.json(queue.getState(req.userId));
});

// DELETE clear semua antrian
app.delete('/api/queue', authenticate, (req, res) => {
  queue.clearQueue(req.userId);
  io.to(req.userId).emit('queue_update', queue.getState(req.userId));
  res.json({ success: true });
});

// ─── SIMULATOR ───────────────────────────────────────────────
const getSimEventHandler = (userId) => (event) => {
  io.to(userId).emit(event.type, event.data);
  if (event.type === 'song_request') {
    io.to(userId).emit('queue_update', queue.getState(userId));
  }
};

// Simulator hanya aktif jika bukan production, atau flag ENABLE_SIMULATOR=true
const simEnabled = config.NODE_ENV !== 'production' || config.ENABLE_SIMULATOR === 'true';

if (simEnabled) {
  app.post('/api/simulate', authenticate, async (req, res) => {
    const { user = 'test_user', comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'Comment diperlukan' });
    await simulator.simulateComment(req.userId, user, comment, getSimEventHandler(req.userId));
    res.json({ success: true, state: queue.getState(req.userId) });
  });

  app.post('/api/demo', authenticate, async (req, res) => {
    res.json({ success: true, message: 'Demo dimulai...' });
    simulator.runDemo(req.userId, getSimEventHandler(req.userId));
  });
}

// ─── SOCKET.IO ───────────────────────────────────────────────
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error('Authentication error'));
  
  // Cek apakah itu JWT dari dashboard atau sekadar token query dari Overlay
  if (token.split('.').length === 3) { // Deteksi JWT
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      socket.userId = user.id;
      return next();
    }
  } else {
    // Token OBS (UUID murni)
    socket.userId = token;
    return next();
  }
  
  next(new Error('Authentication error'));
});

io.on('connection', (socket) => {
  // Masukkan koneksi socket ke dalam Room khusus userId mereka
  socket.join(socket.userId);
  socket.emit('queue_update', queue.getState(socket.userId));

  socket.on('disconnect', () => {
    // Cleanup bila perlu
  });
});

// ─── 404 HANDLER ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── SERVER START ─────────────────────────────────────────────
server.listen(config.PORT, () => {
  const base = config.NODE_ENV === 'production'
    ? `https://<your-app>.railway.app`
    : `http://localhost:${config.PORT}`;

  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   🎵 TikTok Song Request System        ║');
  console.log(`║   ENV  : ${config.NODE_ENV.padEnd(28)}  ║`);
  console.log(`║   URL  : ${base.padEnd(28)}  ║`);
  console.log('║                                        ║');
  console.log('║   /dashboard  — Admin Panel            ║');
  console.log('║   /overlay    — OBS Browser Source     ║');
  console.log('║   /health     — Health Check           ║');
  if (simEnabled) {
    console.log('║   /api/simulate — [TEST] Simulator     ║');
  }
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});
