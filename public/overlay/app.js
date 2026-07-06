// OBS Overlay — app.js
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token') || '';

const socket = io({ query: { token } });

const overlay       = document.getElementById('overlay');
const ovTitle       = document.getElementById('ov-title');
const ovArtist      = document.getElementById('ov-artist');
const ovDuration    = document.getElementById('ov-duration');
const ovRequester   = document.getElementById('ov-requester');
const ovNext        = document.getElementById('ov-next');
const nextRow       = document.getElementById('next-row');
const progressWrap  = document.getElementById('progress-wrap');
const progressBar   = document.getElementById('progress-bar');
const ovElapsed     = document.getElementById('ov-elapsed');
const ovTotal       = document.getElementById('ov-total');

let ytPlayer   = null;
let ytReady    = false;
let timerInterval = null;  // interval untuk update progress setiap detik
let nextCooldown  = false; // debounce agar auto-next tidak terpicu dua kali

// ─── FORMAT DETIK → MM:SS ──────────────────────
function fmtSec(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── TIMER BERJALAN ─────────────────────────────
function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (!ytReady || !ytPlayer.getCurrentTime) return;
    const elapsed  = ytPlayer.getCurrentTime();
    const duration = ytPlayer.getDuration();
    if (!duration || duration <= 0) return;

    ovElapsed.textContent = fmtSec(elapsed);
    ovTotal.textContent   = fmtSec(duration);
    const pct = Math.min((elapsed / duration) * 100, 100);
    progressBar.style.width = pct + '%';
  }, 500);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  ovElapsed.textContent    = '0:00';
  ovTotal.textContent      = '0:00';
  progressBar.style.width  = '0%';
}

// ─── TRIGGER AUTO-NEXT (dengan debounce) ────────
function triggerNext() {
  if (nextCooldown) return;
  nextCooldown = true;
  console.log('[Overlay] Auto-next dipanggil');
  fetch(`/api/next?token=${token}`, { method: 'POST' }).catch(console.error);
  // Cooldown 5 detik agar tidak double-trigger
  setTimeout(() => { nextCooldown = false; }, 5000);
}

// ─── YOUTUBE IFRAME API ─────────────────────────
function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('ytplayer', {
    height: '200',
    width:  '200',
    host:   'https://www.youtube.com',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      enablejsapi: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: () => { ytReady = true; },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          startTimer();
        } else if (e.data === YT.PlayerState.ENDED) {
          stopTimer();
          triggerNext();
        } else if (e.data === YT.PlayerState.PAUSED) {
          // Tidak stop timer, biarkan posisi tetap tampil
        }
      },
      onError: (e) => {
        console.error('[Overlay] YT Error:', e.data);
        stopTimer();
        triggerNext(); // lewati lagu yang error
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
let lastVideoId = null;

function renderOverlay(state) {
  const { currentSong, queue } = state;

  if (!currentSong) {
    if (ytReady && ytPlayer.stopVideo) ytPlayer.stopVideo();
    stopTimer();
    lastVideoId = null;

    overlay.classList.remove('hidden');
    ovTitle.textContent = 'Menunggu Lagu...';
    ovTitle.style.animation = 'none';
    ovTitle.classList.remove('long');
    ovArtist.textContent    = 'Ketik !req [judul] di live chat';
    ovDuration.textContent  = '??:??';
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
      stopTimer(); // reset timer, onStateChange PLAYING yang akan start
    }
  }

  // Judul lagu
  const newTitle = currentSong.title || '—';
  if (ovTitle.textContent !== newTitle) {
    ovTitle.textContent = newTitle;
    ovTitle.style.animation = 'none';
    ovArtist.textContent    = currentSong.channelTitle || 'Unknown Artist';
    ovDuration.textContent  = currentSong.duration || '??:??';
    requestAnimationFrame(() => {
      ovTitle.style.animation = '';
      applyMarquee(ovTitle);
    });
  }

  // Update total duration dari metadata lagu (fallback sebelum YT player siap)
  if (currentSong.duration && ovTotal.textContent === '0:00') {
    ovTotal.textContent = currentSong.duration;
  }

  ovRequester.textContent = `req by @${currentSong.requestedBy || '—'}`;

  // Next up
  const nextSong = queue && queue[0];
  if (nextSong) {
    nextRow.style.display = 'flex';
    ovNext.textContent    = `${nextSong.title}  ·  @${nextSong.requestedBy}`;
  } else {
    nextRow.style.display = 'none';
  }
}

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
