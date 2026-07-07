// TikTok Live Connector (Multi-Tenant)
const config = require('./config');
const { searchSong } = require('./youtube');
const queue  = require('./queue');

const connections = new Map();
let WebcastPushConnection = null;

async function loadConnector() {
  if (WebcastPushConnection) return;
  const mod = require('tiktok-live-connector');
  WebcastPushConnection = mod.TikTokLiveConnection || mod.WebcastPushConnection || mod;
}

async function connect(userId, username, onEvent) {
  try {
    await loadConnector();
  } catch (err) {
    console.error(`[TikTok ${userId}] Gagal load connector:`, err.message);
    onEvent({ type: 'error', data: { message: 'Gagal load TikTok connector' } });
    return;
  }

  // Jika user sudah terkoneksi sebelumnya, diskonek dulu
  if (connections.has(userId)) {
    try { connections.get(userId).disconnect(); } catch (_) {}
    connections.delete(userId);
  }

  const tiktokClient = new WebcastPushConnection(username, {
    processInitialData:    false,
    enableExtendedGiftInfo: false,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
  });

  connections.set(userId, tiktokClient);

  tiktokClient.on('connected', (state) => {
    console.log(`[TikTok ${userId}] Terhubung ke @${username}`);
    onEvent({ type: 'connected', data: { username, viewerCount: state.viewerCount } });
  });

  tiktokClient.on('disconnected', () => {
    console.log(`[TikTok ${userId}] Terputus dari @${username}`);
    onEvent({ type: 'disconnected', data: {} });
    connections.delete(userId);
  });

  tiktokClient.on('error', (err) => {
    console.error(`[TikTok ${userId}] Error:`, err.message);
    onEvent({ type: 'error', data: { message: err.message } });
  });

  tiktokClient.on('chat', async (data) => {
    // v3 tiktok-live-connector menyimpan pesan di data.comment/data.content dan user di data.user
    const comment = (data.comment || data.content || '').trim();
    const userObj = data.user || data.author || data;
    const user    = userObj.uniqueId || userObj.displayId || userObj.nickname || data.uniqueId || data.nickname || 'unknown';
    const prefix  = config.REQUEST_PREFIX;

    onEvent({ type: 'comment', data: { user, comment } });

    if (comment.toLowerCase().startsWith(prefix.toLowerCase())) {
      const songQuery = comment.slice(prefix.length).trim();
      if (!songQuery) return;

      console.log(`[Request ${userId}] @${user}: ${songQuery}`);

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

      queue.addToQueue(userId, newSong);
      onEvent({ type: 'song_request', data: newSong });
    }
  });

  try {
    await tiktokClient.connect();
  } catch (err) {
    console.error(`[TikTok ${userId}] Gagal connect:`, err.message);
    onEvent({ type: 'error', data: { message: `Gagal connect: ${err.message}` } });
    connections.delete(userId);
  }
}

function disconnect(userId) {
  if (connections.has(userId)) {
    try { connections.get(userId).disconnect(); } catch (_) {}
    connections.delete(userId);
  }
}

module.exports = { connect, disconnect };
