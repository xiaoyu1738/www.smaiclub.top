import { ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_TRACK,
  formatTime,
  readCurrentTime,
  readDurationSeconds,
  readTrack,
  type TrackState
} from '../playerState';

type MiniPlayerDockProps = {
  visible: boolean;
  onExpand: () => void;
};

export function MiniPlayerDock({ visible, onExpand }: MiniPlayerDockProps) {
  const [track, setTrack] = useState<TrackState>(DEFAULT_TRACK);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(DEFAULT_DURATION_SECONDS);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setTrack(readTrack());
    setCurrentTime(readCurrentTime());
    setDuration(readDurationSeconds());

    const timer = window.setInterval(() => {
      const nextTime = readCurrentTime();
      setCurrentTime(Math.min(nextTime, readDurationSeconds()));
      setDuration(readDurationSeconds());
    }, 400);

    return () => window.clearInterval(timer);
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      className="smai-mini-player"
      onClick={onExpand}
      aria-label="展开播放器"
    >
      <span className="smai-mini-player-trigger" aria-hidden="true">
        <ChevronUp size={16} />
      </span>
      <img className="smai-mini-player-cover" src={track.cover} alt="专辑封面" />
      <span className="smai-mini-player-meta">
        <span className="smai-mini-player-title">{track.title}</span>
        <span className="smai-mini-player-artist">{track.artist}</span>
      </span>
      <span className="smai-mini-player-time">
        {formatTime(currentTime)}/{formatTime(duration || DEFAULT_DURATION_SECONDS)}
      </span>
    </button>
  );
}
