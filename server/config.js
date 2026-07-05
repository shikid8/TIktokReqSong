require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const PLACEHOLDERS = ['your_tiktok_username', 'your_youtube_api_key_here', 'YOUR_KEY', ''];

function clean(val, ...placeholders) {
  const v = (val || '').trim();
  return [...PLACEHOLDERS, ...placeholders].includes(v) ? '' : v;
}

module.exports = {
  PORT:             parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV,
  TIKTOK_USERNAME:  clean(process.env.TIKTOK_USERNAME),
  YOUTUBE_API_KEY:  clean(process.env.YOUTUBE_API_KEY),
  REQUEST_PREFIX:   process.env.REQUEST_PREFIX || '!req',
  MAX_QUEUE_SIZE:   parseInt(process.env.MAX_QUEUE_SIZE, 10) || 50,
  ENABLE_SIMULATOR: process.env.ENABLE_SIMULATOR || 'false',

  // CORS: '*' untuk development, atau domain spesifik untuk production
  // Contoh: 'https://my-app.railway.app,http://localhost:3000'
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()),
};
