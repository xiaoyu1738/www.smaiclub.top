export type TrackState = {
  title: string;
  artist: string;
  album: string;
  cover: string;
  path: string;
};

export const DEFAULT_DURATION_SECONDS = 12 * 60;
export const PLAYER_RETURN_PATH_KEY = 'hall.player.returnPath';
export const PLAYER_CURRENT_TIME_KEY = 'hall.player.currentTime';
export const PLAYER_DURATION_SECONDS_KEY = 'hall.player.durationSeconds';
const CURRENT_TRACK_STORAGE_KEY = 'hall.currentTrack';

export const DEFAULT_TRACK: TrackState = {
  title: '摇滚颂歌',
  artist: 'SMAI 乐队',
  album: '午夜现场 EP',
  cover:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBSI0lP4yK2iG13MSDNm_JhyqWpVuxHV2KFcUQxAPHXENUkUyHXB032mTwwfpePGBt63nzg1Yn54pqiZPQBtB2Q_cmrVQQKszzJxn9sl77If1dsYEjnhLIaABAmdC2A7x9kj7OxntkGfPhiSuJKpgDt8iFrxfR77AjBZUbs5o-Fij2k6rFxIgNufUsiZLW4WrwUVTvtJlnpb6TqTcPc0ymP-oB_3JijW_gpIbo8Zf9Y2vYqEd9IF_Jlvf681vsBciEZv27zWU8keYs',
  path: '/aliyun/music/smai-club/live/rock-anthem.mp3'
};

function readJson<T>(storageKey: string): T | null {
  const rawValue = localStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

export function readTrack(): TrackState {
  const savedTrack = readJson<TrackState>(CURRENT_TRACK_STORAGE_KEY);
  if (!savedTrack?.path) {
    return DEFAULT_TRACK;
  }

  return savedTrack;
}

export function saveTrack(track: TrackState): void {
  localStorage.setItem(CURRENT_TRACK_STORAGE_KEY, JSON.stringify(track));
}

export function readCurrentTime(): number {
  const saved = Number(localStorage.getItem(PLAYER_CURRENT_TIME_KEY));
  if (!Number.isFinite(saved) || saved < 0) {
    return 0;
  }
  return saved;
}

export function saveCurrentTime(time: number): void {
  localStorage.setItem(PLAYER_CURRENT_TIME_KEY, String(Math.max(0, time)));
}

export function readDurationSeconds(): number {
  const saved = Number(localStorage.getItem(PLAYER_DURATION_SECONDS_KEY));
  if (!Number.isFinite(saved) || saved <= 0) {
    return DEFAULT_DURATION_SECONDS;
  }
  return saved;
}

export function saveDurationSeconds(durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return;
  }

  localStorage.setItem(PLAYER_DURATION_SECONDS_KEY, String(durationSeconds));
}

export function resetPlaybackProgress(): void {
  localStorage.setItem(PLAYER_CURRENT_TIME_KEY, '0');
  localStorage.setItem(PLAYER_DURATION_SECONDS_KEY, String(DEFAULT_DURATION_SECONDS));
}
