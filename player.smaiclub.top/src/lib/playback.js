export const MODES = {
  single: 'single',
  list: 'list',
  shuffle: 'shuffle',
};

export function pickRandomId(ids, currentId, randomValue = Math.random()) {
  if (ids.length <= 1) {
    return currentId || ids[0] || '';
  }
  const randomIndex = Math.floor(randomValue * ids.length);
  const candidate = ids[randomIndex];
  if (candidate !== currentId) {
    return candidate;
  }
  return ids[(randomIndex + 1) % ids.length];
}

export function getListNeighbor(ids, currentId, direction) {
  const index = ids.indexOf(currentId);
  if (index < 0) {
    return ids[0] || '';
  }
  const delta = direction === 'prev' ? -1 : 1;
  const length = ids.length;
  return ids[(index + delta + length) % length];
}

export function getNextTrackId(mode, ids, currentId, randomValue = Math.random()) {
  if (!ids.length) {
    return '';
  }
  if (mode === MODES.single) {
    return currentId || ids[0];
  }
  if (mode === MODES.shuffle) {
    return pickRandomId(ids, currentId, randomValue);
  }
  return getListNeighbor(ids, currentId, 'next');
}
