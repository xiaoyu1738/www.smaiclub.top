import { ChevronUp, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_TRACK,
  formatTime,
  readPlaylist,
  readRepeatMode,
  readTrack,
  saveRepeatMode,
  type RepeatMode,
  type TrackState
} from '../playerState';
import {
  ensurePlayerTrack,
  getPlayerSnapshot,
  playNextTrack,
  playPrevTrack,
  seekPlayer,
  subscribeToPlayer,
  togglePlayerPlayback
} from '../playerController';

type MiniPlayerDockProps = {
  visible: boolean;
  isExpanding: boolean;
  onExpand: () => void;
};

export function MiniPlayerDock({ visible, isExpanding, onExpand }: MiniPlayerDockProps) {
  const [track, setTrack] = useState<TrackState>(DEFAULT_TRACK);
  const initialSnapshot = getPlayerSnapshot();
  const [currentTime, setCurrentTime] = useState(initialSnapshot.currentTime);
  const [duration, setDuration] = useState(initialSnapshot.duration || DEFAULT_DURATION_SECONDS);
  const [isPlaying, setIsPlaying] = useState(initialSnapshot.isPlaying);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(readRepeatMode);
  const [hasPlaylist, setHasPlaylist] = useState(readPlaylist().length > 1);
  const trackKeyRef = useRef<string | null>(initialSnapshot.trackKey);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextTrack = readTrack();
    setTrack(nextTrack);
    setHasPlaylist(readPlaylist().length > 1);
    ensurePlayerTrack(nextTrack);
  }, [visible]);

  useEffect(() => {
    return subscribeToPlayer((snapshot) => {
      setCurrentTime(snapshot.currentTime);
      setDuration(snapshot.duration);
      setIsPlaying(snapshot.isPlaying);
      setHasPlaylist(readPlaylist().length > 1);

      if (snapshot.trackKey && snapshot.trackKey !== trackKeyRef.current) {
        trackKeyRef.current = snapshot.trackKey;
        setTrack(readTrack());
      }
    });
  }, []);

  if (!visible) {
    return null;
  }

  const totalDuration = duration > 0 ? duration : DEFAULT_DURATION_SECONDS;
  const safeTime = Math.min(currentTime, totalDuration);
  const progressPercent = (safeTime / totalDuration) * 100;
  const RepeatIcon = repeatMode === 'single' ? Repeat1 : Repeat;

  function toggleRepeat(): void {
    const next: RepeatMode = repeatMode === 'list' ? 'single' : 'list';
    saveRepeatMode(next);
    setRepeatMode(next);
  }

  return (
    <div className={`smai-mini-player ${isExpanding ? 'is-expanding' : ''}`}>
      <div className="smai-mini-player-progress">
        <div
          className="smai-mini-player-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
        <input
          type="range"
          min={0}
          max={totalDuration}
          value={safeTime}
          onChange={(e) => {
            const nextTime = Number(e.target.value);
            setCurrentTime(nextTime);
            seekPlayer(nextTime);
          }}
          className="smai-mini-player-progress-input"
          aria-label="播放进度"
        />
      </div>
      <button
        type="button"
        className="smai-mini-player-expand"
        onClick={onExpand}
        aria-label="展开播放器"
      >
        <span className="smai-mini-player-trigger" aria-hidden="true">
          <ChevronUp size={16} />
        </span>
        <img
          className="smai-mini-player-cover"
          src={track.cover}
          alt="专辑封面"
        />
        <span className="smai-mini-player-meta">
          <span className="smai-mini-player-title">
            {track.title}
          </span>
          <span className="smai-mini-player-artist">
            {track.artist}
          </span>
        </span>
        <span className="smai-mini-player-time">
          {formatTime(currentTime)}/{formatTime(duration || DEFAULT_DURATION_SECONDS)}
        </span>
      </button>
      <div className="smai-mini-player-controls">
        <button
          type="button"
          className={`smai-mini-player-ctrl-btn ${repeatMode === 'single' ? 'is-active' : ''}`}
          onClick={toggleRepeat}
          aria-label={repeatMode === 'single' ? '当前：单曲循环' : '当前：列表循环'}
        >
          <RepeatIcon size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="smai-mini-player-ctrl-btn"
          onClick={playPrevTrack}
          disabled={!hasPlaylist}
          aria-label="上一曲"
        >
          <SkipBack size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="smai-mini-player-action"
          onClick={() => {
            void togglePlayerPlayback();
          }}
          aria-label={isPlaying ? '暂停播放' : '开始播放'}
        >
          {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="smai-mini-player-ctrl-btn"
          onClick={playNextTrack}
          disabled={!hasPlaylist}
          aria-label="下一曲"
        >
          <SkipForward size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
