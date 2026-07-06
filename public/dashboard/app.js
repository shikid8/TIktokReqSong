// Dashboard — app.js
let socket = null;
let isConnected = false;
let sbClient = null;
let currentUser = null;

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

const confirmModal   = document.getElementById('confirm-modal');
const modalCancel    = document.getElementById('modal-cancel');
const modalConfirm   = document.getElementById('modal-confirm');

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
  const headers = { 'Content-Type': 'application/json' };
  
  if (sbClient) {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session && session.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  
  const res = await fetch(url, {
    headers,
    ...options,
  });
  
  if (res.status === 401) {
    let errMsg = 'Unauthorized';
    try {
      const errData = await res.json();
      errMsg = errData.details || errData.error || errMsg;
    } catch (e) {}
    alert(`Sesi API Ditolak! Alasan: ${errMsg}\nSilakan muat ulang halaman.`);
    return null;
  }
  
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

clearBtn.addEventListener('click', () => {
  confirmModal.classList.remove('hidden');
});

modalCancel.addEventListener('click', () => {
  confirmModal.classList.add('hidden');
});

modalConfirm.addEventListener('click', async () => {
  confirmModal.classList.add('hidden');
  await apiFetch('/api/queue', { method: 'DELETE' });
  showToast('Antrian berhasil dibersihkan.');
});

audioToggleBtn.addEventListener('click', () => {
  isAudioEnabled = !isAudioEnabled;
  if (isAudioEnabled) {
    if (ytReady) {
      ytPlayer.unMute();
      ytPlayer.setVolume(parseInt(volumeSlider.value));
    }
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

// ─── VOLUME SLIDER ────────────────────────────────
const volumeSlider = document.getElementById('volume-slider');
const volumeLabel  = document.getElementById('volume-label');

// Muat preferensi volume yang tersimpan
const savedVolume = localStorage.getItem('dashVolume');
if (savedVolume !== null) {
  volumeSlider.value = savedVolume;
  volumeLabel.textContent = savedVolume;
}

volumeSlider.addEventListener('input', () => {
  const vol = parseInt(volumeSlider.value);
  volumeLabel.textContent = vol;
  localStorage.setItem('dashVolume', vol);

  if (ytReady) {
    if (vol === 0) {
      ytPlayer.mute();
    } else {
      if (!isAudioEnabled) {
        // Jika audio di-off, jangan paksa unmute lewat slider
      } else {
        ytPlayer.unMute();
        ytPlayer.setVolume(vol);
      }
    }
  }

  // Update ikon sesuai level volume
  const icon = document.querySelector('.volume-icon');
  if (icon) {
    if (vol === 0) icon.textContent = '🔇';
    else if (vol < 50) icon.textContent = '🔉';
    else icon.textContent = '🔊';
  }
});

// ─── INIT & AUTHENTICATION ───────────────────────
(async () => {
  // Ambil config non-sensitif dari server
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));

  // Kunci Supabase diinjeksi langsung ke HTML oleh server (bukan dari API publik)
  const sbCfg = window.__SUPABASE__ || {};

  if (sbCfg.url && sbCfg.key) {
    sbClient = window.supabase.createClient(sbCfg.url, sbCfg.key);
    const { data: { session } } = await sbClient.auth.getSession();
    
    // Jika tidak ada session tapi ada token di URL (proses login sedang berlangsung)
    if (!session && window.location.hash.includes('access_token')) {
      sbClient.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_IN' || newSession) {
          window.location.hash = ''; // Bersihkan URL
          setTimeout(() => { window.location.reload(); }, 500); // Beri waktu Supabase menyimpan token
        }
      });
      return; // Tunggu proses auth selesai, jangan redirect ke login
    }

    // Jika benar-benar tidak ada session
    if (!session) {
      document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0d0d0d; color:#fff; font-family:monospace; text-align:center;">
          <h2 style="color:#e05252;">Akses Ditolak / Sesi Habis</h2>
          <p style="margin: 20px 0; color:#888;">Gagal mendeteksi sesi login di halaman ini.<br>Mungkin karena proses login belum selesai atau Anda belum masuk.</p>
          <a href="/login" style="padding: 10px 20px; background:#c8f25e; color:#000; text-decoration:none; border-radius:4px; font-weight:bold;">Kembali ke Halaman Login</a>
        </div>
      `;
      return;
    }
    
    currentUser = session.user;

    // Tampilkan profil
    document.getElementById('user-profile').style.display = 'flex';
    document.getElementById('user-avatar').src = currentUser.user_metadata.avatar_url || '';
    document.getElementById('user-name').textContent = currentUser.user_metadata.full_name || currentUser.email;

    // Atur iframe preview & URL OBS
    const obsUrl = `${window.location.origin}/overlay?token=${currentUser.id}`;
    document.getElementById('overlay-iframe').src = obsUrl;
    
    const obsInput = document.getElementById('obs-url-input');
    if (obsInput) obsInput.value = obsUrl;

    const copyBtn = document.getElementById('copy-obs-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(obsUrl);
        showToast('URL OBS disalin ke clipboard!');
      });
    }

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await sbClient.auth.signOut();
      window.location.href = '/login';
    });
  } else {
    document.body.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0d0d0d; color:#fff; font-family:monospace; text-align:center;">
        <h2 style="color:#e05252;">Sistem Gagal Memuat</h2>
        <p style="margin: 20px 0; color:#888;">Konfigurasi Supabase tidak ditemukan.<br>Pastikan <strong>SUPABASE_URL</strong> dan <strong>SUPABASE_PUBLISHABLE_KEY</strong> sudah diatur di Environment Variables Render.</p>
      </div>
    `;
    return;
  }

  // Koneksi Socket.io menggunakan Token JWT
  const { data: { session: liveSession } } = await sbClient.auth.getSession();
  socket = io({ auth: { token: liveSession?.access_token || '' } });
  setupSocketEvents(cfg);
})();

async function setupSocketEvents(cfg) {
  // ─── INISIALISASI UI BERDASARKAN CONFIG ───────────────────────────
  if (cfg.defaultUsername && !usernameInput.value) {
    usernameInput.value = cfg.defaultUsername;
    connectHint.textContent = `Username dari konfigurasi server: @${cfg.defaultUsername} — bisa diubah`;
  }

  const simComment = document.getElementById('sim-comment');
  if (simComment && cfg.requestPrefix) {
    simComment.placeholder = `${cfg.requestPrefix} Shape of You`;
  }

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

  // Load state awal antrian dari server
  const state = await apiFetch('/api/state');
  if (state) {
    renderNowPlaying(state.currentSong);
    renderQueue(state.queue);
    renderHistory(state.history);
  }

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
}

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
