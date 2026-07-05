// YouTube Data API v3 — cari lagu berdasarkan query
const axios = require('axios');
const config = require('./config');

const PLACEHOLDER_KEYS = ['your_youtube_api_key_here', '', 'YOUR_KEY'];

/** Fallback data saat API tidak tersedia atau error */
function buildFallback(query) {
  return {
    title: query,
    youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    videoId: null,
    thumbnail: null,
    channelTitle: '—',
    duration: '??:??'
  };
}

/**
 * Mengubah durasi ISO 8601 (PT3M20S) menjadi format MM:SS
 */
function parseDuration(isoStr) {
  const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '00:00';
  
  const h = parseInt(match[1]) || 0;
  const m = parseInt(match[2]) || 0;
  const s = parseInt(match[3]) || 0;
  
  let formatted = '';
  if (h > 0) formatted += h + ':';
  
  const mStr = (h > 0 && m < 10) ? `0${m}` : m;
  const sStr = s < 10 ? `0${s}` : s;
  
  formatted += `${mStr}:${sStr}`;
  return formatted;
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
    
    let duration = '??:??';
    
    // Ambil detail durasi (request kedua)
    try {
      const vidRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'contentDetails',
          id: videoId,
          key: config.YOUTUBE_API_KEY,
        }
      });
      if (vidRes.data.items && vidRes.data.items.length > 0) {
        duration = parseDuration(vidRes.data.items[0].contentDetails.duration);
      }
    } catch (e) {
      console.error('[YouTube] Gagal fetch duration:', e.message);
    }

    return {
      title: snippet.title,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId: videoId,
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || null,
      channelTitle: snippet.channelTitle,
      duration: duration
    };
  } catch (err) {
    console.error('[YouTube] Error saat mencari lagu:', err.message);
    // Fallback jika API error (mis. key salah, quota habis)
    return buildFallback(query);
  }
}

module.exports = { searchSong };
