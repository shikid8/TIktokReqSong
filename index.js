require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const cors     = require('cors');
const helmet   = require('helmet');

const config    = require('./server/config');
const queue     = require('./server/queue');
const tiktok    = require('./server/tiktok');
const simulator = require('./server/simulator');

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
app.get('/',          (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html')));
app.get('/overlay',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay',   'index.html')));

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

// GET konfigurasi publik (non-sensitif) — untuk auto-fill dashboard
app.get('/api/config', (req, res) => {
  res.json({
    defaultUsername: config.TIKTOK_USERNAME || null, // null = user harus isi sendiri
    requestPrefix:   config.REQUEST_PREFIX,
    maxQueueSize:    config.MAX_QUEUE_SIZE,
    hasYoutubeKey:   !!(config.YOUTUBE_API_KEY && !['your_youtube_api_key_here', ''].includes(config.YOUTUBE_API_KEY)),
  });
});

// GET state lengkap
app.get('/api/state', (req, res) => {
  res.json(queue.getState());
});

// POST connect ke TikTok Live
app.post('/api/connect', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username diperlukan' });

  tiktok.connect(username, (event) => {
    io.emit(event.type, event.data);
    if (event.type === 'song_request') {
      io.emit('queue_update', queue.getState());
    }
  });

  res.json({ success: true, message: `Menghubungkan ke @${username}...` });
});

// POST disconnect
app.post('/api/disconnect', (req, res) => {
  tiktok.disconnect();
  res.json({ success: true });
});

// POST next song
app.post('/api/next', (req, res) => {
  const song = queue.nextSong();
  io.emit('queue_update', queue.getState());
  res.json({ currentSong: song, ...queue.getState() });
});

// POST stop song (paksa berhenti)
app.post('/api/stop', (req, res) => {
  queue.stopCurrent();
  io.emit('queue_update', queue.getState());
  res.json({ success: true, ...queue.getState() });
});

// DELETE hapus lagu dari antrian
app.delete('/api/queue/:id', (req, res) => {
  queue.removeSong(parseFloat(req.params.id));
  io.emit('queue_update', queue.getState());
  res.json(queue.getState());
});

// DELETE clear semua antrian
app.delete('/api/queue', (req, res) => {
  queue.clearQueue();
  io.emit('queue_update', queue.getState());
  res.json({ success: true });
});

// ─── SIMULATOR ───────────────────────────────────────────────
const simEventHandler = (event) => {
  io.emit(event.type, event.data);
  if (event.type === 'song_request') {
    io.emit('queue_update', queue.getState());
  }
};

// Simulator hanya aktif jika bukan production, atau flag ENABLE_SIMULATOR=true
const simEnabled = config.NODE_ENV !== 'production' || config.ENABLE_SIMULATOR === 'true';

if (simEnabled) {
  app.post('/api/simulate', async (req, res) => {
    const { user = 'test_user', comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'Comment diperlukan' });
    await simulator.simulateComment(user, comment, simEventHandler);
    res.json({ success: true, state: queue.getState() });
  });

  app.post('/api/demo', async (req, res) => {
    res.json({ success: true, message: 'Demo dimulai...' });
    simulator.runDemo(simEventHandler);
  });
}

// ─── SOCKET.IO ───────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('queue_update', queue.getState());
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
