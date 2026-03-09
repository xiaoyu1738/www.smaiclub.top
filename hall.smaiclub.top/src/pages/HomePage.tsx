import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Pause, Play } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMusicLink } from '../hooks/useMusicLink';
import {
  DEFAULT_DURATION_SECONDS,
  PLAYER_RETURN_PATH_KEY,
  formatTime,
  readCurrentTime,
  readDurationSeconds,
  readTrack,
  saveCurrentTime,
  saveDurationSeconds
} from '../playerState';

const BACKDROP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAWb2BxLjMsm3zIhJc2l4khH4TZfsDXC65fkjafn8dNXPBqViHJqvS8X0Dbc2qQrrmQPSyqEWg583mk8ai-4s7qAPd65PPnmY9RW0EuM7TT-tSGtBpavUchjyGymnOE0CA1m_d9W8bSLJwbibkhbgyaRugc0c5qxzSRLH_B9H6Pw98D7z1sfhBIkzp0-X-sXzrlcF-23vhPG8xGNGLr2SOGSv0H3OBCAP6wgnd_JP1G6gPRGZOUbKFG_NWtYeddhXqNjOag_bUzNMo';

type PlayerLocationState = {
  fromPath?: string;
};

export function HomePage() {
  const [track, setTrack] = useState(() => readTrack());
  const [currentTime, setCurrentTime] = useState(readCurrentTime);
  const [duration, setDuration] = useState(readDurationSeconds);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const minimizeTimerRef = useRef<number | null>(null);
  const {
    url: audioUrl,
    error: linkError,
    isLoading: isLinkLoading,
    source: linkSource,
    refresh: refreshAudioUrl
  } = useMusicLink(track.path, { enabled: Boolean(track.path) });

  const fromPath = (location.state as PlayerLocationState | null)?.fromPath;

  useEffect(() => {
    if (fromPath && fromPath !== '/player') {
      sessionStorage.setItem(PLAYER_RETURN_PATH_KEY, fromPath);
    }
  }, [fromPath]);

  useEffect(() => {
    saveCurrentTime(currentTime);
  }, [currentTime]);

  useEffect(() => {
    saveDurationSeconds(duration);
  }, [duration]);

  useEffect(() => {
    setTrack(readTrack());
  }, [location.key]);

  useEffect(() => {
    setCurrentTime(readCurrentTime());
    setDuration(readDurationSeconds());
    setPlaybackError(null);
    setIsPlaying(false);
  }, [track.path]);

  useEffect(
    () => () => {
      if (minimizeTimerRef.current !== null) {
        window.clearTimeout(minimizeTimerRef.current);
      }
    },
    []
  );

  const returnPath = useMemo(() => {
    if (fromPath && fromPath !== '/player') {
      return fromPath;
    }
    const cached = sessionStorage.getItem(PLAYER_RETURN_PATH_KEY);
    if (cached && cached !== '/player') {
      return cached;
    }
    return '/discover';
  }, [fromPath]);

  const totalDuration = duration > 0 ? duration : DEFAULT_DURATION_SECONDS;
  const safeCurrentTime = Math.min(currentTime, totalDuration);
  const ratio = `${(safeCurrentTime / totalDuration) * 100}%`;
  const statusText = linkError
    ? linkError
    : playbackError
      ? playbackError
      : isLinkLoading
        ? '正在解析音频直链...'
        : linkSource === 'local'
          ? '已命中浏览器缓存'
          : '直链已就绪';

  async function togglePlayback(): Promise<void> {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      return;
    }

    setPlaybackError(null);

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        setPlaybackError(error instanceof Error ? error.message : '浏览器阻止了音频播放，请再次点击播放。');
      }
      return;
    }

    audio.pause();
  }

  function handleSeek(nextTime: number): void {
    const audio = audioRef.current;
    const clampedTime = Math.max(0, Math.min(nextTime, totalDuration));
    setCurrentTime(clampedTime);

    if (audio) {
      audio.currentTime = clampedTime;
    }
  }

  return (
    <section
      className={`smai-player-page relative min-h-[calc(100vh-88px)] bg-background-dark text-text-dark animate-fade-in md:h-[calc(100vh-88px)] md:overflow-hidden ${isMinimizing ? 'is-minimizing' : ''
        }`}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 scale-110 bg-cover bg-center opacity-25 blur-3xl"
        style={{ backgroundImage: `url('${BACKDROP}')` }}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-transparent to-background-dark" />

      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col gap-4 px-4 pb-4 md:grid md:grid-rows-[1fr_auto] md:px-8">
        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          preload="metadata"
          onLoadedMetadata={() => {
            const audio = audioRef.current;
            if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
              return;
            }

            const nextDuration = audio.duration;
            const resumeTime = Math.min(readCurrentTime(), nextDuration);
            setDuration(nextDuration);
            setCurrentTime(resumeTime);
            audio.currentTime = resumeTime;
          }}
          onTimeUpdate={() => {
            const audio = audioRef.current;
            if (!audio) {
              return;
            }

            setCurrentTime(audio.currentTime);
          }}
          onDurationChange={() => {
            const audio = audioRef.current;
            if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
              return;
            }

            setDuration(audio.duration);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
            saveCurrentTime(0);
          }}
          onError={() => {
            setIsPlaying(false);
            setPlaybackError('音频资源加载失败，请刷新直链后重试。');
          }}
        />
        <main className="flex min-h-0 flex-1 flex-col gap-6 pt-4 md:grid md:grid-cols-2 md:gap-10 md:pt-6">
          <div className="flex min-h-0 flex-col items-center justify-center">
            <button
              type="button"
              className="mb-2 self-start rounded-full bg-white/10 p-1 text-white hover:bg-white/20"
              onClick={() => {
                if (isMinimizing) {
                  return;
                }
                setIsMinimizing(true);
                minimizeTimerRef.current = window.setTimeout(() => {
                  navigate(returnPath, {
                    state: {
                      showMiniPlayer: true
                    }
                  });
                }, 230);
              }}
              aria-label="缩小到底部播放器"
            >
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            <div className="relative aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl shadow-2xl shadow-black/60 animate-fade-up md:max-w-md">
              <img alt="Rock Anthem Album Cover" className="h-full w-full object-cover" src={track.cover} />
            </div>
            <div className="mt-5 w-full max-w-md text-center">
              <h1 className="mb-2 truncate text-3xl font-bold tracking-tight md:text-4xl">{track.title}</h1>
              <p className="mb-1 text-lg font-medium text-subtext-dark md:text-xl">{track.artist}</p>
              <p className="text-sm uppercase tracking-widest text-subtext-dark/80">{track.album}</p>
            </div>
          </div>

          <div className="relative hidden min-h-0 overflow-hidden rounded-2xl bg-black/20 md:block">
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-16 bg-gradient-to-b from-background-dark to-transparent" />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-20 bg-gradient-to-t from-background-dark to-transparent" />
            <div className="hide-scrollbar h-full overflow-y-auto px-6 py-20">
              <div className="mx-auto max-w-2xl space-y-8 text-center md:text-left">
                <p className="text-2xl font-medium text-subtext-dark/60">走在这条空荡的街</p>
                <p className="text-2xl font-medium text-subtext-dark/60">影子在寒冷中消散</p>
                <p className="text-4xl font-bold text-text-dark drop-shadow-lg md:text-5xl">我要整夜摇滚</p>
                <p className="text-4xl font-bold text-primary drop-shadow-lg md:text-5xl animate-pulse">每天都要狂欢！</p>
                <p className="text-3xl font-semibold text-subtext-dark">(吉他独奏)</p>
                <p className="text-2xl font-medium text-subtext-dark/60">感受贝斯的震动穿透</p>
                <p className="text-2xl font-medium text-subtext-dark/60">我不愿做任何其他事</p>
              </div>
            </div>
          </div>
        </main>

        <footer className="mt-auto shrink-0 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 blur-backdrop">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-subtext-dark">
            <span className="truncate">{statusText}</span>
            {(linkError || playbackError) && track.path ? (
              <button
                type="button"
                className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-white transition hover:border-primary hover:text-primary"
                onClick={() => {
                  setPlaybackError(null);
                  refreshAudioUrl();
                }}
              >
                重试
              </button>
            ) : null}
          </div>

          {/* 移动端：曲目信息 + 播放按钮一行，进度条单独一行 */}
          <div className="flex flex-col gap-3 md:hidden">
            <div className="flex items-center gap-3">
              <img className="h-10 w-10 shrink-0 rounded-md object-cover" src={track.cover} alt="小封面" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{track.title}</p>
                <p className="truncate text-xs text-subtext-dark">{track.artist}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => { void togglePlayback(); }}
                disabled={!audioUrl || isLinkLoading}
                aria-label={isPlaying ? '暂停播放' : '开始播放'}
              >
                {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="min-w-[36px] text-xs text-subtext-dark">{formatTime(safeCurrentTime)}</span>
              <input
                type="range"
                min={0}
                max={totalDuration}
                value={safeCurrentTime}
                onChange={(event) => handleSeek(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-primary"
                aria-label="播放进度"
                style={{ background: `linear-gradient(to right, #ec1337 ${ratio}, #452229 ${ratio})` }}
                disabled={!audioUrl || isLinkLoading}
              />
              <span className="min-w-[36px] text-right text-xs text-subtext-dark">{formatTime(totalDuration)}</span>
            </div>
          </div>

          {/* 桌面端：原有水平布局 */}
          <div className="hidden items-center gap-4 md:grid md:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-3">
              <img className="h-12 w-12 rounded-md object-cover" src={track.cover} alt="小封面" />
              <div className="truncate">
                <p className="truncate text-sm font-bold">{track.title}</p>
                <p className="truncate text-xs text-subtext-dark">{track.artist}</p>
                <p className="text-xs text-subtext-dark">{formatTime(safeCurrentTime)}/{formatTime(totalDuration)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => { void togglePlayback(); }}
                disabled={!audioUrl || isLinkLoading}
                aria-label={isPlaying ? '暂停播放' : '开始播放'}
              >
                {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              </button>
              <input
                type="range"
                min={0}
                max={totalDuration}
                value={safeCurrentTime}
                onChange={(event) => handleSeek(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-primary"
                aria-label="播放进度"
                style={{ background: `linear-gradient(to right, #ec1337 ${ratio}, #452229 ${ratio})` }}
                disabled={!audioUrl || isLinkLoading}
              />
              <span className="min-w-[52px] text-xs text-subtext-dark">{formatTime(totalDuration)}</span>
            </div>
          </div>
        </footer>
      </div>
    </section>
  );
}
