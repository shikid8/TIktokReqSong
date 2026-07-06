// OBS Overlay — app.js
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token') || '';

const socket = io({ query: { token } });

const overlay       = document.getElementById('overlay');
const ovTitle       = document.getElementById('ov-title');
const ovRequester   = document.getElementById('ov-requester');
const ovNext        = document.getElementById('ov-next');
const nextRow       = document.getElementById('next-row');
const progressWrap  = document.getElementById('progress-wrap');
const progressBar   = document.getElementById('progress-bar');
const ovElapsed     = document.getElementById('ov-elapsed');
const ovTotal       = document.getElementById('ov-total');

let ytPlayer   = null;
let ytReady    = false;
let timerInterval = null;
let nextCooldown  = false;
let lastVideoId   = null;

// ─── FORMAT DETIK → M:SS ────────────────────────
function fmtSec(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── PROGRESS POLLING ─────────────────────────────
// Menggunakan polling setiap 500ms lebih robust daripada event onStateChange
setInterval(() => {
  if (!ytReady || !ytPlayer || typeof ytPlayer.getPlayerState !== 'function') return;
  
  if (ytPlayer.getPlayerState() === 1) { // 1 = PLAYING
    const elapsed  = ytPlayer.getCurrentTime() || 0;
    const duration = ytPlayer.getDuration() || 0;
    
    if (duration > 0) {
      ovElapsed.textContent = fmtSec(elapsed);
      ovTotal.textContent   = fmtSec(duration);
      progressBar.style.width = Math.min((elapsed / duration) * 100, 100) + '%';
    }
  }
}, 500);

function resetProgressUI() {
  ovElapsed.textContent   = '0:00';
  ovTotal.textContent     = '0:00';
  progressBar.style.width = '0%';
}

// ─── AUTO-NEXT (debounce 5 detik) ───────────────
function triggerNext() {
  if (nextCooldown) return;
  nextCooldown = true;
  console.log('[Overlay] Auto-next');
  fetch(`/api/next?token=${token}`, { method: 'POST' }).catch(console.error);
  setTimeout(() => { nextCooldown = false; }, 5000);
}

// ─── YOUTUBE IFRAME API ─────────────────────────
function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('ytplayer', {
    height: '200', width: '200',
    host: 'https://www.youtube.com',
    playerVars: {
      autoplay: 1, controls: 0, disablekb: 1,
      fs: 0, rel: 0, enablejsapi: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: () => {
        ytReady = true;
        // Terapkan volume tersimpan saat player siap
        const saved = localStorage.getItem('overlayVolume');
        if (saved !== null) ytPlayer.setVolume(parseInt(saved));
      },
      onStateChange: (e) => {
        if (e.data === 0) { // 0 = ENDED
          resetProgressUI();
          triggerNext();
        }
      },
      onError: (e) => { 
        console.error('[YT Error]', e.data); 
        resetProgressUI(); 
        triggerNext(); 
      },
    },
  });
}

// ─── ESCAPE HTML ─────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── MARQUEE JUDUL PANJANG ───────────────────────
function applyMarquee(el) {
  el.classList.remove('long');
  requestAnimationFrame(() => {
    if (el.scrollWidth > el.clientWidth + 4) {
      const ratio = el.scrollWidth / el.clientWidth;
      el.style.setProperty('--scroll-dist', `-${(ratio - 1) * 100 + 10}%`);
      el.classList.add('long');
    }
  });
}

// ─── RENDER STATE ────────────────────────────────
function renderOverlay(state) {
  const { currentSong, queue } = state;

  if (!currentSong) {
    if (ytReady && ytPlayer.stopVideo) ytPlayer.stopVideo();
    resetProgressUI();
    lastVideoId = null;
    overlay.classList.remove('hidden');
    ovTitle.textContent        = 'Menunggu Lagu...';
    ovTitle.style.animation    = 'none';
    ovTitle.classList.remove('long');
    ovRequester.style.display  = 'none';
    progressWrap.style.display = 'none';
    nextRow.style.display      = 'none';
    return;
  }

  overlay.classList.remove('hidden');
  ovRequester.style.display  = 'block';
  progressWrap.style.display = 'flex';

  // Putar lagu hanya jika videoId berganti
  if (ytReady && ytPlayer.loadVideoById && currentSong.videoId) {
    if (lastVideoId !== currentSong.videoId) {
      lastVideoId = currentSong.videoId;
      ytPlayer.loadVideoById(currentSong.videoId);
      resetProgressUI();
    }
  }

  const newTitle = currentSong.title || '—';
  if (ovTitle.textContent !== newTitle) {
    ovTitle.textContent = newTitle;
    ovTitle.style.animation = 'none';
    requestAnimationFrame(() => {
      ovTitle.style.animation = '';
      applyMarquee(ovTitle);
    });
  }

  ovRequester.textContent = `req by @${currentSong.requestedBy || '—'}`;

  const nextSong = queue && queue[0];
  if (nextSong) {
    nextRow.style.display = 'flex';
    ovNext.textContent    = `${nextSong.title}  ·  @${nextSong.requestedBy}`;
  } else {
    nextRow.style.display = 'none';
  }
}

// ─── TERIMA VOLUME VIA SOCKET (dari dashboard) ──
socket.on('volume_change', ({ value, muted }) => {
  if (!ytReady) return;
  localStorage.setItem('overlayVolume', value);
  if (muted || value === 0) {
    ytPlayer.mute();
  } else {
    ytPlayer.unMute();
    ytPlayer.setVolume(value);
  }
});

// ─── SOCKET EVENTS ───────────────────────────────
socket.on('queue_update', renderOverlay);

// ─── INIT ────────────────────────────────────────
if (token) {
  fetch(`/api/state?token=${token}`)
    .then(r => r.json())
    .then(renderOverlay)
    .catch(console.error);
} else {
  overlay.classList.remove('hidden');
  ovTitle.textContent = 'Menunggu Token...';
}
