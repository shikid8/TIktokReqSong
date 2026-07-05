// Queue Manager — mengelola antrian request lagu

let queue = [];
let history = [];
let currentSong = null;

/**
 * Tambah lagu ke antrian.
 * Jika tidak ada lagu yang sedang dimainkan, langsung jadikan currentSong
 * agar overlay otomatis tampil tanpa harus tekan NEXT.
 * @param {Object} song
 * @returns {{ isFirstSong: boolean, queue: Array }}
 */
function addToQueue(song) {
  const newSong = { ...song, id: Date.now() + Math.random() };

  if (!currentSong) {
    // Tidak ada yang dimainkan → langsung jadikan current
    currentSong = newSong;
    return { isFirstSong: true, queue };
  }

  queue.push(newSong);
  return { isFirstSong: false, queue };
}

/**
 * Ambil lagu berikutnya dari antrian (dan set sebagai current)
 */
function nextSong() {
  if (currentSong) {
    history.unshift(currentSong);
    if (history.length > 50) history.pop();
  }
  currentSong = queue.shift() || null;
  return currentSong;
}

/**
 * Hapus lagu dari antrian berdasarkan id
 */
function removeSong(id) {
  queue = queue.filter((s) => s.id !== id);
  return queue;
}

/**
 * Hentikan lagu yang sedang berjalan secara paksa (tanpa auto next)
 */
function stopCurrent() {
  if (currentSong) {
    history.unshift(currentSong);
    if (history.length > 50) history.pop();
  }
  currentSong = null;
  return currentSong;
}

/**
 * Kosongkan seluruh antrian
 */
function clearQueue() {
  queue = [];
  return queue;
}

/**
 * Get state lengkap
 */
function getState() {
  return {
    currentSong,
    queue: [...queue],
    history: [...history],
  };
}

module.exports = { addToQueue, nextSong, removeSong, clearQueue, stopCurrent, getState };
