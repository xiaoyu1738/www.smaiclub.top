import { PROXY_PLAYER_ORIGIN } from './config/mediaProxy';
import {
  DEFAULT_DURATION_SECONDS,
  readCurrentTime,
  readDurationSeconds,
  readIsPlaying,
  readPlaylist,
  readPlaylistIndex,
  readRepeatMode,
  resetPlaybackProgress,
  saveCurrentTime,
  saveDurationSeconds,
  saveIsPlaying,
  savePlaylistIndex,
  saveTrack,
  type TrackState
} from './playerState';

export type PlayerSnapshot = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  error: string | null;
  trackKey: string | null;
};

type Listener = (snapshot: PlayerSnapshot) => void;

const listeners = new Set<Listener>();

let sharedAudio: HTMLAudioElement | null = null;
let sharedTrackKey: string | null = null;
let currentSnapshot: PlayerSnapshot = {
  currentTime: readCurrentTime(),
  duration: readDurationSeconds() || DEFAULT_DURATION_SECONDS,
  isPlaying: readIsPlaying(),
  error: null,
  trackKey: null
};

function emitSnapshot(): void {
  for (const listener of listeners) {
    listener(currentSnapshot);
  }
}

function setSnapshot(nextSnapshot: Partial<PlayerSnapshot>): void {
  currentSnapshot = { ...currentSnapshot, ...nextSnapshot };
  emitSnapshot();
}

function buildTrackUrl(track: TrackState): string | null {
  const normalizedPath = track.path?.trim();
  if (!normalizedPath) {
    return null;
  }

  const endpoint = new URL(`${PROXY_PLAYER_ORIGIN}/api/music/stream`);
  endpoint.searchParams.set('path', normalizedPath);
  if (track.version) {
    endpoint.searchParams.set('v', track.version);
  }
  return endpoint.toString();
}

function buildTrackKey(track: TrackState): string | null {
  const url = buildTrackUrl(track);
  return url ?? null;
}

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (sharedAudio) {
    return sharedAudio;
  }

  sharedAudio = new Audio();
  sharedAudio.preload = 'metadata';

  sharedAudio.addEventListener('loadedmetadata', () => {
    if (!sharedAudio || !Number.isFinite(sharedAudio.duration) || sharedAudio.duration <= 0) {
      return;
    }

    const nextDuration = sharedAudio.duration;
    const resumeTime = Math.min(readCurrentTime(), nextDuration);
    sharedAudio.currentTime = resumeTime;
    saveDurationSeconds(nextDuration);
    saveCurrentTime(resumeTime);
    setSnapshot({
      currentTime: resumeTime,
      duration: nextDuration,
      error: null,
      trackKey: sharedTrackKey
    });

    if (readIsPlaying()) {
      void sharedAudio.play().catch((error) => {
        saveIsPlaying(false);
        setSnapshot({
          isPlaying: false,
          error: error instanceof Error ? error.message : '浏览器阻止了音频播放，请再次点击播放。'
        });
      });
    }
  });

  sharedAudio.addEventListener('timeupdate', () => {
    if (!sharedAudio) {
      return;
    }

    saveCurrentTime(sharedAudio.currentTime);
    setSnapshot({ currentTime: sharedAudio.currentTime });
  });

  sharedAudio.addEventListener('durationchange', () => {
    if (!sharedAudio || !Number.isFinite(sharedAudio.duration) || sharedAudio.duration <= 0) {
      return;
    }

    saveDurationSeconds(sharedAudio.duration);
    setSnapshot({ duration: sharedAudio.duration });
  });

  sharedAudio.addEventListener('play', () => {
    saveIsPlaying(true);
    setSnapshot({ isPlaying: true, error: null });
  });

  sharedAudio.addEventListener('pause', () => {
    saveIsPlaying(false);
    setSnapshot({ isPlaying: false });
  });

  sharedAudio.addEventListener('ended', () => {
    const repeatMode = readRepeatMode();
    if (repeatMode === 'single') {
      // Single repeat: restart same track
      if (sharedAudio) {
        sharedAudio.currentTime = 0;
        saveCurrentTime(0);
        setSnapshot({ currentTime: 0 });
        void sharedAudio.play();
      }
      return;
    }

    // List repeat: advance to next
    const playlist = readPlaylist();
    if (playlist.length > 0) {
      const currentIndex = readPlaylistIndex();
      const nextIndex = (currentIndex + 1) % playlist.length;
      const nextTrack = playlist[nextIndex];
      if (nextTrack) {
        savePlaylistIndex(nextIndex);
        saveTrack(nextTrack);
        resetPlaybackProgress();
        saveIsPlaying(true);
        loadAndPlayTrack(nextTrack);
        return;
      }
    }

    saveCurrentTime(0);
    saveIsPlaying(false);
    setSnapshot({ currentTime: 0, isPlaying: false });
  });

  sharedAudio.addEventListener('error', () => {
    saveIsPlaying(false);
    setSnapshot({
      isPlaying: false,
      error: '音频资源加载失败，请重试。'
    });
  });

  return sharedAudio;
}

export function getPlayerSnapshot(): PlayerSnapshot {
  const audio = ensureAudio();
  if (!audio) {
    return currentSnapshot;
  }

  return {
    currentTime: audio.currentTime || currentSnapshot.currentTime,
    duration:
      (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : currentSnapshot.duration) ||
      DEFAULT_DURATION_SECONDS,
    isPlaying: !audio.paused,
    error: currentSnapshot.error,
    trackKey: sharedTrackKey
  };
}

export function subscribeToPlayer(listener: Listener): () => void {
  listeners.add(listener);
  listener(getPlayerSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function ensurePlayerTrack(track: TrackState): void {
  const audio = ensureAudio();
  const nextTrackKey = buildTrackKey(track);
  if (!audio || !nextTrackKey) {
    return;
  }

  if (sharedTrackKey === nextTrackKey && audio.src === nextTrackKey) {
    setSnapshot({ trackKey: sharedTrackKey });
    return;
  }

  const nextIsPlaying = readIsPlaying();
  const resumeTime = readCurrentTime();
  sharedTrackKey = nextTrackKey;
  setSnapshot({
    currentTime: resumeTime,
    duration: readDurationSeconds() || DEFAULT_DURATION_SECONDS,
    isPlaying: nextIsPlaying,
    error: null,
    trackKey: sharedTrackKey
  });

  audio.src = nextTrackKey;
  audio.load();
}

export async function togglePlayerPlayback(): Promise<void> {
  const audio = ensureAudio();
  if (!audio || !sharedTrackKey) {
    return;
  }

  if (audio.paused) {
    try {
      await audio.play();
    } catch (error) {
      saveIsPlaying(false);
      setSnapshot({
        isPlaying: false,
        error: error instanceof Error ? error.message : '浏览器阻止了音频播放，请再次点击播放。'
      });
    }
    return;
  }

  audio.pause();
}

export function seekPlayer(nextTime: number): void {
  const audio = ensureAudio();
  if (!audio) {
    return;
  }

  const maxDuration =
    Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : currentSnapshot.duration;
  const clampedTime = Math.max(0, Math.min(nextTime, maxDuration || DEFAULT_DURATION_SECONDS));
  audio.currentTime = clampedTime;
  saveCurrentTime(clampedTime);
  setSnapshot({ currentTime: clampedTime });
}

function loadAndPlayTrack(track: TrackState): void {
  const audio = ensureAudio();
  const nextTrackKey = buildTrackKey(track);
  if (!audio || !nextTrackKey) return;

  sharedTrackKey = nextTrackKey;
  setSnapshot({
    currentTime: 0,
    duration: DEFAULT_DURATION_SECONDS,
    isPlaying: true,
    error: null,
    trackKey: sharedTrackKey
  });

  audio.src = nextTrackKey;
  audio.load();
}

export function playTrackByIndex(index: number): void {
  const playlist = readPlaylist();
  if (index < 0 || index >= playlist.length) return;
  const track = playlist[index];
  savePlaylistIndex(index);
  saveTrack(track);
  resetPlaybackProgress();
  saveIsPlaying(true);
  loadAndPlayTrack(track);
}

export function playNextTrack(): void {
  const playlist = readPlaylist();
  if (playlist.length === 0) return;
  const currentIndex = readPlaylistIndex();
  const nextIndex = (currentIndex + 1) % playlist.length;
  playTrackByIndex(nextIndex);
}

export function playPrevTrack(): void {
  const playlist = readPlaylist();
  if (playlist.length === 0) return;
  const currentIndex = readPlaylistIndex();
  const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
  playTrackByIndex(prevIndex);
}
