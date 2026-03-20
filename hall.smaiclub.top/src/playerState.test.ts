import { beforeEach, describe, expect, it } from 'vitest';
import {
  readPlaylist,
  readPlaylistIndex,
  readRepeatMode,
  readTrack,
  savePlaylist,
  savePlaylistIndex,
  saveRepeatMode,
  saveTrack,
  type TrackState,
} from './playerState';

const SAMPLE_TRACK: TrackState = {
  title: 'Signal Fire',
  artist: 'SMAI Club',
  album: 'Night Transit',
  cover: 'https://hall-worker.xiaoyu1738jw.workers.dev/assets/music/cover.jpg',
  path: '/aliyun/music/demo/song.mp3',
  version: '12',
  lyricPath: 'https://hall-worker.xiaoyu1738jw.workers.dev/assets/music/demo/song.lrc',
  lyricVersion: '3',
};

describe('playerState playlist persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('saves and reads playlist entries from session storage', () => {
    savePlaylist([SAMPLE_TRACK]);
    savePlaylistIndex(0);

    expect(readPlaylist()).toEqual([SAMPLE_TRACK]);
    expect(readPlaylistIndex()).toBe(0);
  });

  it('normalizes legacy track and lyric urls when saving and reading back', () => {
    saveTrack(SAMPLE_TRACK);

    expect(readTrack()).toEqual({
      ...SAMPLE_TRACK,
      cover: 'https://proxyplayer.smaiclub.top/assets/music/cover.jpg',
      path: '/assets/music/demo/song.mp3',
      lyricPath: 'https://proxyplayer.smaiclub.top/assets/music/demo/song.lrc',
    });
  });

  it('persists repeat mode and defaults to list mode', () => {
    expect(readRepeatMode()).toBe('list');

    saveRepeatMode('single');

    expect(readRepeatMode()).toBe('single');
  });
});
