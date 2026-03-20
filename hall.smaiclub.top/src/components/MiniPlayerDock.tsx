import { ChevronUp, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_TRACK,
  formatTime,
  readTrack,
  type TrackState
} from '../playerState';
import {
  ensurePlayerTrack,
  getPlayerSnapshot,
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

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextTrack = readTrack();
    setTrack(nextTrack);
    ensurePlayerTrack(nextTrack);
  }, [visible]);

  useEffect(() => {
    return subscribeToPlayer((snapshot) => {
      setCurrentTime(snapshot.currentTime);
      setDuration(snapshot.duration);
      setIsPlaying(snapshot.isPlaying);
    });
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className={`smai-mini-player ${isExpanding ? 'is-expanding' : ''}`}>
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
    </div>
  );
}
