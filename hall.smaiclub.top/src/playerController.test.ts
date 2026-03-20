import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackState } from './playerState';

const TRACKS: TrackState[] = [
  {
    title: 'First Light',
    artist: 'SMAI Club',
    album: 'Skyline',
    cover: 'https://proxyplayer.smaiclub.top/assets/music/first.jpg',
    path: '/assets/music/first.mp3',
    version: '1',
  },
  {
    title: 'Second Wind',
    artist: 'SMAI Club',
    album: 'Skyline',
    cover: 'https://proxyplayer.smaiclub.top/assets/music/second.jpg',
    path: '/assets/music/second.mp3',
    version: '2',
  },
];

type Listener = () => void;

class MockAudio {
  static instances: MockAudio[] = [];

  src = '';
  preload = '';
  currentTime = 0;
  duration = 180;
  paused = true;
  private listeners = new Map<string, Listener[]>();

  constructor() {
    MockAudio.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  load() {}

  play() {
    this.paused = false;
    this.dispatch('play');
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatch('pause');
  }
}

describe('playerController playlist controls', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    MockAudio.instances = [];
    vi.stubGlobal('Audio', MockAudio as unknown as typeof Audio);
  });

  it('plays the next and previous track from the saved playlist', async () => {
    const state = await import('./playerState');
    const controller = await import('./playerController');

    state.savePlaylist(TRACKS);
    state.savePlaylistIndex(0);
    state.saveTrack(TRACKS[0]);

    controller.playNextTrack();
    expect(state.readPlaylistIndex()).toBe(1);
    expect(state.readTrack().title).toBe('Second Wind');

    controller.playPrevTrack();
    expect(state.readPlaylistIndex()).toBe(0);
    expect(state.readTrack().title).toBe('First Light');
  });

  it('restarts the current track when single repeat is enabled', async () => {
    const state = await import('./playerState');
    const controller = await import('./playerController');

    state.savePlaylist(TRACKS);
    state.savePlaylistIndex(0);
    state.saveTrack(TRACKS[0]);
    state.saveRepeatMode('single');

    controller.playTrackByIndex(0);

    const audio = MockAudio.instances[0];
    audio.currentTime = 97;
    state.saveCurrentTime(97);

    audio.dispatch('ended');

    expect(audio.currentTime).toBe(0);
    expect(state.readPlaylistIndex()).toBe(0);
    expect(state.readTrack().title).toBe('First Light');
  });

  it('advances to the next track when list repeat handles ended playback', async () => {
    const state = await import('./playerState');
    const controller = await import('./playerController');

    state.savePlaylist(TRACKS);
    state.savePlaylistIndex(0);
    state.saveTrack(TRACKS[0]);
    state.saveRepeatMode('list');

    controller.playTrackByIndex(0);

    const audio = MockAudio.instances[0];
    audio.dispatch('ended');

    expect(state.readPlaylistIndex()).toBe(1);
    expect(state.readTrack().title).toBe('Second Wind');
    expect(audio.src).toContain(encodeURIComponent(TRACKS[1].path).replace(/%2F/g, '%2F'));
  });
});
