// TikTok Live Connector — listen komentar dari TikTok Live
// Menggunakan dynamic import() karena tiktok-live-connector adalah ES Module
const config = require('./config');
const { searchSong } = require('./youtube');
const queue  = require('./queue');

let tiktokClient = null;
let WebcastPushConnection = null;

/** Lazy-load ES Module tiktok-live-connector */
async function loadConnector() {
  if (WebcastPushConnection) return;
  const mod = await import('tiktok-live-connector');
  WebcastPushConnection = mod.WebcastPushConnection;
}

/**
 * Mulai koneksi ke TikTok Live
 * @param {string} username - TikTok username (tanpa @)
 * @param {Function} onEvent - callback event
 */
async function connect(username, onEvent) {
  try {
    await loadConnector();
  } catch (err) {
    console.error('[TikTok] Gagal load connector:', err.message);
    onEvent({ type: 'error', data: { message: 'Gagal load TikTok connector' } });
    return;
  }

  if (tiktokClient) {
    try { tiktokClient.disconnect(); } catch (_) {}
  }

  tiktokClient = new WebcastPushConnection(username, {
    processInitialData:    false,
    enableExtendedGiftInfo: false,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
  });

  tiktokClient.on('connected', (state) => {
    console.log(`[TikTok] Terhubung ke live @${username} | viewers: ${state.viewerCount}`);
    onEvent({ type: 'connected', data: { username, viewerCount: state.viewerCount } });
  });

  tiktokClient.on('disconnected', () => {
    console.log('[TikTok] Terputus dari live.');
    onEvent({ type: 'disconnected', data: {} });
  });

  tiktokClient.on('error', (err) => {
    console.error('[TikTok] Error:', err.message);
    onEvent({ type: 'error', data: { message: err.message } });
  });

  tiktokClient.on('chat', async (data) => {
    const comment = data.comment?.trim() || '';
    const user    = data.uniqueId || data.nickname || 'unknown';
    const prefix  = config.REQUEST_PREFIX;

    // Emit komentar mentah ke dashboard
    onEvent({ type: 'comment', data: { user, comment } });

    // Cek apakah komentar adalah request lagu
    if (comment.toLowerCase().startsWith(prefix.toLowerCase())) {
      const songQuery = comment.slice(prefix.length).trim();
      if (!songQuery) return;

      console.log(`[Request] @${user}: ${songQuery}`);

      const songData = await searchSong(songQuery);
      if (!songData) {
        onEvent({ type: 'request_failed', data: { user, query: songQuery } });
        return;
      }

      const newSong = {
        ...songData,
        requestedBy:  user,
        requestedAt:  new Date().toISOString(),
        originalQuery: songQuery,
      };

      queue.addToQueue(newSong);
      onEvent({ type: 'song_request', data: newSong });
    }
  });

  try {
    await tiktokClient.connect();
  } catch (err) {
    console.error('[TikTok] Gagal connect:', err.message);
    onEvent({ type: 'error', data: { message: `Gagal connect: ${err.message}` } });
  }
}

function disconnect() {
  if (tiktokClient) {
    try { tiktokClient.disconnect(); } catch (_) {}
    tiktokClient = null;
  }
}

module.exports = { connect, disconnect };
