// YouTube Data API v3 — cari lagu berdasarkan query
const axios = require('axios');
const config = require('./config');

const PLACEHOLDER_KEYS = ['your_youtube_api_key_here', '', 'YOUR_KEY'];

/** Fallback data saat API tidak tersedia atau error */
function buildFallback(query) {
  return {
    title: query,
    youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    thumbnail: null,
    channelTitle: '—',
  };
}

/**
 * Cari lagu di YouTube berdasarkan nama
 * @param {string} query - nama lagu dari request penonton
 * @returns {Object|null} - { title, youtubeUrl, thumbnail, channelTitle }
 */
async function searchSong(query) {
  const apiKey = config.YOUTUBE_API_KEY || '';
  const hasValidKey = apiKey && !PLACEHOLDER_KEYS.includes(apiKey.trim());

  if (!hasValidKey) {
    // Mode tanpa API key — kembalikan data manual (overlay tetap tampil)
    return buildFallback(query);
  }

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: query,
        type: 'video',
        videoCategoryId: '10', // Kategori Music
        maxResults: 1,
        key: config.YOUTUBE_API_KEY,
      },
    });

    const items = response.data.items;
    if (!items || items.length === 0) return null;

    const video = items[0];
    const videoId = video.id.videoId;
    const snippet = video.snippet;

    return {
      title: snippet.title,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || null,
      channelTitle: snippet.channelTitle,
    };
  } catch (err) {
    console.error('[YouTube] Error saat mencari lagu:', err.message);
    // Fallback jika API error (mis. key salah, quota habis)
    return buildFallback(query);
  }
}

module.exports = { searchSong };
