// Simulator — kirim komentar palsu seolah dari TikTok Live
// Digunakan untuk testing tanpa harus live di TikTok

const { searchSong } = require('./youtube');
const queue = require('./queue');
const config = require('./config');

/**
 * Proses satu komentar palsu
 * @param {string} user - username pengirim
 * @param {string} comment - isi komentar
 * @param {Function} onEvent - callback event (sama dengan di tiktok.js)
 */
async function simulateComment(user, comment, onEvent) {
  comment = comment.trim();
  const prefix = config.REQUEST_PREFIX;

  // Emit komentar biasa
  onEvent({ type: 'comment', data: { user, comment } });

  // Cek apakah request lagu
  if (comment.toLowerCase().startsWith(prefix.toLowerCase())) {
    const songQuery = comment.slice(prefix.length).trim();
    if (!songQuery) return;

    console.log(`[Simulator] @${user}: ${songQuery}`);

    const songData = await searchSong(songQuery);
    if (!songData) {
      onEvent({ type: 'request_failed', data: { user, query: songQuery } });
      return;
    }

    const newSong = {
      ...songData,
      requestedBy: user,
      requestedAt: new Date().toISOString(),
      originalQuery: songQuery,
    };

    queue.addToQueue(newSong);
    onEvent({ type: 'song_request', data: newSong });
  }
}

/**
 * Demo otomatis — kirim beberapa request sekaligus
 * @param {Function} onEvent
 */
async function runDemo(onEvent) {
  const demoRequests = [
    { user: 'penonton_keren',   comment: '!req Shape of You Ed Sheeran' },
    { user: 'user_tiktok123',   comment: '!req Hati-Hati di Jalan Pamungkas' },
    { user: 'fans_music',       comment: 'mantap banget streamernya' },
    { user: 'penikmat_lagu',    comment: '!req Bohemian Rhapsody Queen' },
    { user: 'random_viewer',    comment: 'lagu apa nih yang dimain?' },
    { user: 'musik_lovers',     comment: '!req Riptide Vance Joy' },
  ];

  for (const req of demoRequests) {
    await simulateComment(req.user, req.comment, onEvent);
    // Jeda antar komentar agar terasa natural
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

module.exports = { simulateComment, runDemo };
