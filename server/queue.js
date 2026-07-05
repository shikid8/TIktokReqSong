// Queue Manager — mengelola antrian request lagu

// Queue Manager (Multi-Tenant) — mengelola antrian berdasarkan userId

const queues = new Map();

/**
 * Dapatkan state ruangan untuk userId tertentu. Jika belum ada, buat baru.
 */
function getRoomState(userId) {
  if (!queues.has(userId)) {
    queues.set(userId, {
      queue: [],
      history: [],
      currentSong: null,
    });
  }
  return queues.get(userId);
}

function addToQueue(userId, song) {
  const room = getRoomState(userId);
  const newSong = { ...song, id: Date.now() + Math.random() };

  if (!room.currentSong) {
    room.currentSong = newSong;
    return { isFirstSong: true, queue: room.queue };
  }

  room.queue.push(newSong);
  return { isFirstSong: false, queue: room.queue };
}

function nextSong(userId) {
  const room = getRoomState(userId);
  if (room.currentSong) {
    room.history.unshift(room.currentSong);
    if (room.history.length > 50) room.history.pop();
  }
  room.currentSong = room.queue.shift() || null;
  return room.currentSong;
}

function removeSong(userId, id) {
  const room = getRoomState(userId);
  room.queue = room.queue.filter((s) => s.id !== id);
  return room.queue;
}

function stopCurrent(userId) {
  const room = getRoomState(userId);
  if (room.currentSong) {
    room.history.unshift(room.currentSong);
    if (room.history.length > 50) room.history.pop();
  }
  room.currentSong = null;
  return room.currentSong;
}

function clearQueue(userId) {
  const room = getRoomState(userId);
  room.queue = [];
  return room.queue;
}

function getState(userId) {
  const room = getRoomState(userId);
  return {
    currentSong: room.currentSong,
    queue: [...room.queue],
    history: [...room.history],
  };
}

module.exports = { 
  addToQueue, 
  nextSong, 
  removeSong, 
  clearQueue, 
  stopCurrent, 
  getState 
};
