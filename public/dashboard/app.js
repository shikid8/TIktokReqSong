// Dashboard — app.js
const socket = io();
let isConnected = false;

// ─── ELEMENTS ────────────────────────────────────
const statusBadge    = document.getElementById('status-badge');
const ytBadge        = document.getElementById('yt-badge');
const connectHint    = document.getElementById('connect-hint');
const usernameInput  = document.getElementById('username-input');
const connectBtn     = document.getElementById('connect-btn');
const nextBtn        = document.getElementById('next-btn');
const stopBtn        = document.getElementById('stop-btn');
const clearBtn       = document.getElementById('clear-btn');
const audioToggleBtn = document.getElementById('audio-toggle-btn');
const nowPlayingCard = document.getElementById('now-playing-content');
const queueList      = document.getElementById('queue-list');
const queueCount     = document.getElementById('queue-count');
const commentLog     = document.getElementById('comment-log');
const historyList    = document.getElementById('history-list');

// ─── YOUTUBE PLAYER ──────────────────────────────
let ytPlayer = null;
let ytReady = false;
let isAudioEnabled = true;

function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('ytplayer', {
    height: '200',
    width: '200',
    host: 'https://www.youtube.com',
    playerVars: { 
      autoplay: 1, 
      controls: 0, 
      disablekb: 1,
      enablejsapi: 1,
      origin: window.location.origin
    },
    events: {
      onReady: () => { 
        ytReady = true; 
        if (!isAudioEnabled) ytPlayer.mute(); 
      }
    }
  });
}

// ─── TOAST ───────────────────────────────────────
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
document.body.appendChild(toastContainer);

// ─── TOAST ───────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' error' : ''}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── RENDER NOW PLAYING ───────────────────────────
function renderNowPlaying(song) {
  if (!song) {
    nowPlayingCard.innerHTML = `<div class="now-playing-empty"><span class="empty-text">— Tidak ada lagu —</span></div>`;
    if (ytReady && ytPlayer.stopVideo) ytPlayer.stopVideo();
    return;
  }

  // Play audio
  if (ytReady && ytPlayer.loadVideoById && song.videoId) {
    const currentVid = ytPlayer.getVideoData ? ytPlayer.getVideoData().video_id : null;
    if (currentVid !== song.videoId) {
      ytPlayer.loadVideoById(song.videoId);
    }
  }

  const thumbHtml = song.thumbnail
    ? `<img class="now-playing-thumb" src="${song.thumbnail}" alt="${escHtml(song.title)}" />`
    : `<div class="thumb-placeholder">🎵</div>`;

  nowPlayingCard.innerHTML = `
    <div class="now-playing-content">
      <div class="now-playing-song">
        ${thumbHtml}
        <div class="now-playing-info">
          <div class="now-playing-title">${escHtml(song.title)}</div>
          <div class="now-playing-channel" style="display:flex; justify-content:space-between; width:100%;">
            <span>${escHtml(song.channelTitle || 'Unknown')}</span>
            <span style="color:var(--accent); font-family:var(--font-mono); font-size:10px;">⏱ ${escHtml(song.duration || '??:??')}</span>
          </div>
          <div class="now-playing-requester">req: @${escHtml(song.requestedBy)}</div>
          <a class="yt-link" href="${song.youtubeUrl}" target="_blank" rel="noopener">▶ BUKA DI YOUTUBE</a>
        </div>
      </div>
    </div>
  `;
}

// ─── RENDER QUEUE ─────────────────────────────────
function renderQueue(queue) {
  queueCount.textContent = queue.length;
  if (queue.length === 0) {
    queueList.innerHTML = `<div class="empty-text">Antrian kosong...</div>`;
    return;
  }

  queueList.innerHTML = queue.map((song, i) => {
    const thumbHtml = song.thumbnail
      ? `<img class="queue-thumb" src="${song.thumbnail}" alt="" />`
      : `<div class="queue-thumb-placeholder">🎵</div>`;

    return `
      <div class="queue-item" id="q-${song.id}">
        <span class="queue-num">${i + 1}</span>
        ${thumbHtml}
        <div class="queue-info">
          <div class="queue-title">${escHtml(song.title)}</div>
          <div class="queue-requester">
            @${escHtml(song.requestedBy)} 
            <span style="float:right; opacity:0.7;">⏱ ${escHtml(song.duration || '??:??')}</span>
          </div>
        </div>
        <button class="btn-icon" onclick="deleteSong(${song.id})" title="Hapus">✕</button>
      </div>
    `;
  }).join('');
}

// ─── RENDER HISTORY ───────────────────────────────
function renderHistory(history) {
  if (history.length === 0) {
    historyList.innerHTML = `<div class="empty-text">Belum ada lagu yang dimainkan.</div>`;
    return;
  }

  historyList.innerHTML = history.map(song => `
    <div class="history-item">
      <div class="history-title">✓ ${escHtml(song.title)}</div>
      <div class="history-requester">@${escHtml(song.requestedBy)}</div>
    </div>
  `).join('');
}

// ─── RENDER COMMENT ───────────────────────────────
function addComment(user, comment, isRequest = false) {
  const item = document.createElement('div');
  item.className = `comment-item${isRequest ? ' is-request' : ''}`;
  item.innerHTML = `<span class="comment-user">@${escHtml(user)}</span><span class="comment-text">${escHtml(comment)}</span>`;

  // Batasi max 100 komentar
  if (commentLog.children.length >= 100) commentLog.lastElementChild?.remove();
  commentLog.prepend(item);
}

// ─── HELPER ───────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── API CALLS ────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

async function deleteSong(id) {
  await apiFetch(`/api/queue/${id}`, { method: 'DELETE' });
}

// ─── EVENT LISTENERS ──────────────────────────────
connectBtn.addEventListener('click', async () => {
  const username = usernameInput.value.replace('@', '').trim();
  if (!username) { showToast('Masukkan username TikTok terlebih dahulu!', 'error'); return; }

  if (isConnected) {
    await apiFetch('/api/disconnect', { method: 'POST' });
    isConnected = false;
    connectBtn.textContent = 'CONNECT';
    showToast(`Terputus dari @${username}`);
  } else {
    const res = await apiFetch('/api/connect', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    showToast(res.message || 'Menghubungkan...');
    connectBtn.textContent = 'DISCONNECT';
  }
});

nextBtn.addEventListener('click', async () => {
  const res = await apiFetch('/api/next', { method: 'POST' });
  if (res.currentSong) showToast(`Memutar: ${res.currentSong.title}`);
  else showToast('Tidak ada antrian lagi.');
});

stopBtn.addEventListener('click', async () => {
  const res = await apiFetch('/api/stop', { method: 'POST' });
  showToast('Lagu dihentikan secara paksa.');
});

clearBtn.addEventListener('click', async () => {
  if (confirm('Hapus semua antrian?')) {
    await apiFetch('/api/queue', { method: 'DELETE' });
    showToast('Antrian dibersihkan.');
  }
});

audioToggleBtn.addEventListener('click', () => {
  isAudioEnabled = !isAudioEnabled;
  if (isAudioEnabled) {
    if (ytReady) ytPlayer.unMute();
    audioToggleBtn.textContent = '🔊 AUDIO ON';
    audioToggleBtn.classList.remove('btn-danger');
    audioToggleBtn.classList.add('btn-sim');
    showToast('Audio Dashboard dinyalakan.');
  } else {
    if (ytReady) ytPlayer.mute();
    audioToggleBtn.textContent = '🔇 AUDIO OFF';
    audioToggleBtn.classList.remove('btn-sim');
    audioToggleBtn.classList.add('btn-danger');
    showToast('Audio Dashboard dimatikan.');
  }
});

// ─── SOCKET EVENTS ────────────────────────────────
socket.on('queue_update', (state) => {
  renderNowPlaying(state.currentSong);
  renderQueue(state.queue);
  renderHistory(state.history);
});

socket.on('connected', (data) => {
  isConnected = true;
  statusBadge.textContent = `● LIVE @${data.username}`;
  statusBadge.classList.add('connected');
  connectBtn.textContent = 'DISCONNECT';
  showToast(`✓ Terhubung ke @${data.username}`);
});

socket.on('disconnected', () => {
  isConnected = false;
  statusBadge.textContent = '● OFFLINE';
  statusBadge.classList.remove('connected');
  connectBtn.textContent = 'CONNECT';
});

socket.on('error', (data) => {
  showToast(`Error: ${data.message}`, 'error');
});

socket.on('comment', (data) => {
  addComment(data.user, data.comment, false);
});

socket.on('song_request', (data) => {
  addComment(data.requestedBy, `!req ${data.originalQuery}`, true);
  showToast(`🎵 @${data.requestedBy} request: ${data.title}`);
});

// ─── SIMULATOR ───────────────────────────────────
const simUserInput    = document.getElementById('sim-user');
const simCommentInput = document.getElementById('sim-comment');
const simSendBtn      = document.getElementById('sim-send-btn');
const simDemoBtn      = document.getElementById('sim-demo-btn');

async function sendSimulate() {
  const user    = simUserInput.value.trim() || 'test_user';
  const comment = simCommentInput.value.trim();
  if (!comment) { showToast('Isi komentar terlebih dahulu!', 'error'); return; }

  await apiFetch('/api/simulate', {
    method: 'POST',
    body: JSON.stringify({ user, comment }),
  });

  simCommentInput.value = '';
  simCommentInput.focus();
}

simSendBtn.addEventListener('click', sendSimulate);

simCommentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendSimulate();
});

simDemoBtn.addEventListener('click', async () => {
  simDemoBtn.textContent = '⏳ DEMO...';
  simDemoBtn.disabled = true;
  await apiFetch('/api/demo', { method: 'POST' });
  showToast('▶ Demo otomatis dimulai — 6 komentar akan masuk!');
  setTimeout(() => {
    simDemoBtn.textContent = '▶ AUTO DEMO';
    simDemoBtn.disabled = false;
  }, 7000);
});

// ─── INIT ─────────────────────────────────────────
(async () => {
  // Load konfigurasi dari server
  const cfg = await apiFetch('/api/config').catch(() => ({}));

  // Auto-fill username jika ada default dari env
  if (cfg.defaultUsername && !usernameInput.value) {
    usernameInput.value = cfg.defaultUsername;
    connectHint.textContent = `Username dari konfigurasi server: @${cfg.defaultUsername} — bisa diubah`;
  }

  // Update placeholder prefix sesuai konfigurasi server
  const simComment = document.getElementById('sim-comment');
  if (simComment && cfg.requestPrefix) {
    simComment.placeholder = `${cfg.requestPrefix} Shape of You`;
  }

  // Status YouTube API Key
  if (ytBadge) {
    if (cfg.hasYoutubeKey) {
      ytBadge.textContent = 'YT: ✔ API';
      ytBadge.classList.add('active');
      ytBadge.title = 'YouTube API Key aktif — thumbnail & pencarian akurat';
    } else {
      ytBadge.textContent = 'YT: No Key';
      ytBadge.title = 'Tanpa YouTube API Key — overlay tampil tanpa thumbnail';
    }
  }

  // Update panduan penggunaan (URL Overlay & Prefix)
  const overlayUrlDisplay = document.getElementById('overlay-url-display');
  const guidePrefixDisplay = document.getElementById('guide-prefix-display');
  
  if (overlayUrlDisplay) {
    overlayUrlDisplay.textContent = window.location.origin + '/overlay';
  }
  if (guidePrefixDisplay && cfg.requestPrefix) {
    guidePrefixDisplay.textContent = cfg.requestPrefix;
  }

  // Load queue state
  const state = await apiFetch('/api/state');
  renderNowPlaying(state.currentSong);
  renderQueue(state.queue);
  renderHistory(state.history);
})();
