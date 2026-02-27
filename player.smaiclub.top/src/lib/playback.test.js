import test from 'node:test';
import assert from 'node:assert/strict';
import { getListNeighbor, getNextTrackId, MODES, pickRandomId } from './playback.js';

const ids = ['a', 'b', 'c'];

test('playback helpers: walks list forward and backward with loop', () => {
  assert.equal(getListNeighbor(ids, 'a', 'next'), 'b');
  assert.equal(getListNeighbor(ids, 'c', 'next'), 'a');
  assert.equal(getListNeighbor(ids, 'a', 'prev'), 'c');
});

test('playback helpers: returns current track in single mode', () => {
  assert.equal(getNextTrackId(MODES.single, ids, 'b'), 'b');
});

test('playback helpers: uses ordered next track in list mode', () => {
  assert.equal(getNextTrackId(MODES.list, ids, 'b'), 'c');
});

test('playback helpers: uses random strategy in shuffle mode and avoids same track when possible', () => {
  assert.equal(getNextTrackId(MODES.shuffle, ids, 'a', 0), 'b');
  assert.equal(getNextTrackId(MODES.shuffle, ids, 'a', 0.8), 'c');
  assert.equal(pickRandomId(['a'], 'a', 0.1), 'a');
});
