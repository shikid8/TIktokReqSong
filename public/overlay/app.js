// OBS Overlay — app.js (text-only)
const socket = io();

const overlay      = document.getElementById('overlay');
const ovTitle      = document.getElementById('ov-title');
const ovArtist     = document.getElementById('ov-artist');
const ovDuration   = document.getElementById('ov-duration');
const ovRequester  = document.getElementById('ov-requester');
const ovNext       = document.getElementById('ov-next');
const nextRow      = document.getElementById('next-row');

let ytPlayer = null;
let ytReady = false;

// Callback dari YouTube API
function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('ytplayer', {
    height: '1',
    width: '1',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      origin: window.location.origin
    },
    events: {
      onReady: () => { ytReady = true; },
      onError: (e) => { console.error('YT Player Error:', e.data); }
    }
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Aktifkan efek marquee jika judul lebih panjang dari container
 */
function applyMarquee(el) {
  el.classList.remove('long');
  // Cek apakah teks melebihi lebar container
  requestAnimationFrame(() => {
    if (el.scrollWidth > el.clientWidth + 4) {
      const overflowRatio = el.scrollWidth / el.clientWidth;
      el.style.setProperty('--scroll-dist', `-${(overflowRatio - 1) * 100 + 10}%`);
      el.classList.add('long');
    }
  });
}

function renderOverlay(state) {
  const { currentSong, queue } = state;

  if (!currentSong) {
    overlay.classList.add('hidden');
    if (ytReady && ytPlayer.stopVideo) ytPlayer.stopVideo();
    return;
  }

  // Auto-play lagu jika videoId tersedia
  if (ytReady && ytPlayer.loadVideoById && currentSong.videoId) {
    // Hindari memutar ulang lagu yang sama jika status baru masuk
    const currentVid = ytPlayer.getVideoData ? ytPlayer.getVideoData().video_id : null;
    if (currentVid !== currentSong.videoId) {
      ytPlayer.loadVideoById(currentSong.videoId);
    }
  }

  // Tampilkan overlay
  overlay.classList.remove('hidden');

  // Judul lagu & Meta
  const newTitle = currentSong.title || '—';
  if (ovTitle.textContent !== newTitle) {
    ovTitle.textContent = newTitle;
    ovTitle.style.animation = 'none';
    ovArtist.textContent = currentSong.channelTitle || 'Unknown Artist';
    ovDuration.textContent = currentSong.duration || '??:??';
    
    requestAnimationFrame(() => {
      ovTitle.style.animation = '';
      applyMarquee(ovTitle);
    });
  }

  // Requester
  ovRequester.textContent = `req by @${currentSong.requestedBy || '—'}`;

  // Next up
  const nextSong = queue && queue[0];
  if (nextSong) {
    nextRow.style.display = 'flex';
    ovNext.textContent = `${nextSong.title}  ·  @${nextSong.requestedBy}`;
  } else {
    nextRow.style.display = 'none';
  }
}

socket.on('queue_update', renderOverlay);

// Init
fetch('/api/state')
  .then(r => r.json())
  .then(renderOverlay)
  .catch(console.error);
