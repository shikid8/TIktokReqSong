// OBS Overlay — app.js (text-only)
const socket = io();

const overlay      = document.getElementById('overlay');
const ovTitle      = document.getElementById('ov-title');
const ovRequester  = document.getElementById('ov-requester');
const ovNext       = document.getElementById('ov-next');
const nextRow      = document.getElementById('next-row');

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
    return;
  }

  // Tampilkan overlay
  overlay.classList.remove('hidden');

  // Judul lagu — animasi ulang dengan clone trick
  const newTitle = currentSong.title || '—';
  if (ovTitle.textContent !== newTitle) {
    ovTitle.textContent = newTitle;
    ovTitle.style.animation = 'none';
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
