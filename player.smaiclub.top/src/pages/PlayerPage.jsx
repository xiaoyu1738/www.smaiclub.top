import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { loadLibrary } from '../lib/videos';
import { UI_NAME } from '../config/uiEntry';
import { getListNeighbor, getNextTrackId, MODES, pickRandomId } from '../lib/playback';

const STORAGE = {
  queue: 'smai-player-queue',
  current: 'smai-player-current',
  mode: 'smai-player-mode',
};

const CODEC_FILTERS = {
  all: 'all',
  h264: 'h264',
  h265: 'h265',
};

function detectArtType(url) {
  const cleanUrl = String(url || '').split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.m3u8')) {
    return 'm3u8';
  }
  return 'auto';
}

function getCodecKey(codec) {
  const text = String(codec || '').toLowerCase();
  if (text.includes('265') || text.includes('hevc')) {
    return CODEC_FILTERS.h265;
  }
  if (text.includes('264') || text.includes('avc')) {
    return CODEC_FILTERS.h264;
  }
  return '';
}

function sanitizeFileName(input) {
  return String(input || 'video')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function getModeHint(mode) {
  if (mode === MODES.single) {
    return '单曲循环：仅重复播放当前文件。';
  }
  if (mode === MODES.shuffle) {
    return '随机播放：每次结束后随机切换到队列中的文件。';
  }
  return '列表循环：按顺序播放并循环整个队列。';
}

function safeStorageGet(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures to keep playback available.
  }
}

export default function PlayerPage({ variant = 'dev' }) {
  const isProd = variant === 'prod';
  const { id: routeId } = useParams();
  const [library, setLibrary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [queueIds, setQueueIds] = useState([]);
  const [currentId, setCurrentId] = useState('');
  const [mode, setMode] = useState(() => {
    const saved = safeStorageGet(STORAGE.mode, '');
    return saved && Object.values(MODES).includes(saved) ? saved : MODES.list;
  });
  const [activeVariantUrl, setActiveVariantUrl] = useState(null);
  const [codecFilter, setCodecFilter] = useState(CODEC_FILTERS.all);
  const [isLibraryOpen, setLibraryOpen] = useState(false);
  const [toastText, setToastText] = useState('');
  const artContainerRef = useRef(null);
  const artInstanceRef = useRef(null);
  const modeRef = useRef(mode);
  const queueRef = useRef(queueIds);
  const currentRef = useRef(currentId);

  useEffect(() => {
    loadLibrary()
      .then(setLibrary)
      .catch((err) => {
        setLoadError(err.message || '加载 videos.json 失败');
      });
  }, []);

  const videoMap = useMemo(() => {
    const map = new Map();
    if (!library) {
      return map;
    }
    library.videos.forEach((video) => {
      map.set(video.id, video);
    });
    return map;
  }, [library]);

  const allIds = useMemo(() => {
    if (!library) {
      return [];
    }
    return library.videos.map((video) => video.id);
  }, [library]);

  useEffect(() => {
    if (!library) {
      return;
    }
    const validIds = new Set(allIds);
    let savedQueue = [];
    try {
      const parsed = JSON.parse(safeStorageGet(STORAGE.queue, '[]'));
      savedQueue = Array.isArray(parsed) ? parsed : [];
    } catch {
      savedQueue = [];
    }
    const savedCurrentId = safeStorageGet(STORAGE.current, '');

    let nextQueue = savedQueue.filter((queueId) => validIds.has(queueId));
    nextQueue = [...new Set(nextQueue)];
    if (!nextQueue.length) {
      nextQueue = [...allIds];
    }

    if (routeId && validIds.has(routeId) && !nextQueue.includes(routeId)) {
      nextQueue = [routeId, ...nextQueue];
    }

    const fallbackCurrent = savedCurrentId && nextQueue.includes(savedCurrentId) ? savedCurrentId : nextQueue[0] || '';
    const nextCurrent = routeId && validIds.has(routeId) ? routeId : fallbackCurrent;

    setQueueIds(nextQueue);
    setCurrentId(nextCurrent);
    setActiveVariantUrl(null);
    setCodecFilter(CODEC_FILTERS.all);
  }, [allIds, library, routeId]);

  useEffect(() => {
    modeRef.current = mode;
    safeStorageSet(STORAGE.mode, mode);
    if (artInstanceRef.current) {
      artInstanceRef.current.video.loop = mode === MODES.single;
    }
  }, [mode]);

  useEffect(() => {
    queueRef.current = queueIds;
    safeStorageSet(STORAGE.queue, JSON.stringify(queueIds));
  }, [queueIds]);

  useEffect(() => {
    currentRef.current = currentId;
    if (currentId) {
      safeStorageSet(STORAGE.current, currentId);
    }
  }, [currentId]);

  useEffect(() => {
    if (!toastText) {
      return undefined;
    }
    const timer = window.setTimeout(() => setToastText(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toastText]);

  const currentVideo = currentId ? videoMap.get(currentId) : null;
  const playUrl = activeVariantUrl ?? currentVideo?.url ?? '';
  const activeVariant = useMemo(() => {
    if (!currentVideo || !Array.isArray(currentVideo.variants)) {
      return null;
    }
    return currentVideo.variants.find((variant) => variant.url === playUrl) || null;
  }, [currentVideo, playUrl]);
  const codecOptions = useMemo(() => {
    if (!currentVideo?.variants?.length) {
      return [];
    }
    const bucket = new Set();
    currentVideo.variants.forEach((variant) => {
      const key = getCodecKey(variant.codec);
      if (key === CODEC_FILTERS.h264 || key === CODEC_FILTERS.h265) {
        bucket.add(key);
      }
    });
    return Array.from(bucket);
  }, [currentVideo]);
  const visibleVariants = useMemo(() => {
    if (!currentVideo?.variants?.length) {
      return [];
    }
    if (codecFilter === CODEC_FILTERS.all) {
      return currentVideo.variants;
    }
    return currentVideo.variants.filter((variant) => getCodecKey(variant.codec) === codecFilter);
  }, [currentVideo, codecFilter]);

  const queueVideos = useMemo(() => {
    return queueIds.map((queueId) => videoMap.get(queueId)).filter(Boolean);
  }, [queueIds, videoMap]);

  const moveTo = useCallback((nextId) => {
    if (!nextId) {
      return;
    }
    setCurrentId(nextId);
    setActiveVariantUrl(null);
    setCodecFilter(CODEC_FILTERS.all);
  }, []);

  const switchVariant = useCallback((variantUrl) => {
    if (!variantUrl) {
      return;
    }
    setActiveVariantUrl(variantUrl);
    if (artInstanceRef.current) {
      const currentTime = artInstanceRef.current.currentTime;
      artInstanceRef.current.url = variantUrl;
      artInstanceRef.current.currentTime = currentTime;
      artInstanceRef.current.play();
    }
  }, []);

  const downloadCurrent = useCallback(() => {
    if (!playUrl) {
      setToastText('当前没有可下载的视频地址。');
      return;
    }
    const formatHint = detectArtType(playUrl) === 'm3u8' ? 'm3u8' : 'mp4';
    const codecText = activeVariant?.codec || currentVideo?.codec || '';
    const resolutionText = activeVariant?.resolution || currentVideo?.resolution || '';
    const filename = sanitizeFileName(
      `${currentVideo?.title || 'video'}-${resolutionText}-${codecText}.${formatHint}`,
    );
    const link = document.createElement('a');
    link.href = playUrl;
    link.download = filename;
    link.rel = 'noreferrer';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [activeVariant, currentVideo, playUrl]);

  const copyDownloadLink = useCallback(async () => {
    if (!playUrl) {
      setToastText('当前没有可复制的下载地址。');
      return;
    }
    try {
      await navigator.clipboard.writeText(playUrl);
      setToastText('下载链接已复制。');
    } catch {
      setToastText('复制失败，请检查剪贴板权限。');
    }
  }, [playUrl]);

  const handleCodecSelect = useCallback(
    (nextCodec) => {
      setCodecFilter(nextCodec);
      if (nextCodec === CODEC_FILTERS.all) {
        return;
      }
      if (!currentVideo?.variants?.length) {
        return;
      }
      const target = currentVideo.variants.find(
        (variant) => getCodecKey(variant.codec) === nextCodec,
      );
      if (!target) {
        setToastText('当前视频没有该编码版本。');
        return;
      }
      switchVariant(target.url);
    },
    [currentVideo, switchVariant],
  );

  const playNext = useCallback(() => {
    const ids = queueRef.current;
    if (!ids.length) {
      return;
    }
    const nextId = getNextTrackId(modeRef.current, ids, currentRef.current);
    moveTo(nextId);
  }, [moveTo]);

  const playPrev = useCallback(() => {
    const ids = queueRef.current;
    if (!ids.length) {
      return;
    }
    const current = currentRef.current;
    const nextId =
      modeRef.current === MODES.shuffle
        ? pickRandomId(ids, current)
        : getListNeighbor(ids, current, 'prev');
    moveTo(nextId);
  }, [moveTo]);

  useEffect(() => {
    if (!currentVideo || !artContainerRef.current) {
      return;
    }

    if (artInstanceRef.current) {
      artInstanceRef.current.destroy(false);
    }

    const art = new Artplayer({
      container: artContainerRef.current,
      url: playUrl,
      poster: currentVideo.cover || '',
      type: detectArtType(playUrl),
      autoplay: true,
      autoMini: true,
      fullscreen: true,
      fullscreenWeb: true,
      playbackRate: true,
      setting: true,
      pip: true,
      mutex: true,
      lock: true,
      fastForward: true,
      theme: '#25c3ff',
      loop: modeRef.current === MODES.single,
      customType: {
        m3u8: (video, url, instance) => {
          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);
            instance.on('destroy', () => hls.destroy());
            return;
          }
          video.src = url;
        },
      },
    });

    art.on('ended', () => {
      moveTo(getNextTrackId(modeRef.current, queueRef.current, currentRef.current));
    });

    art.on('error', () => {
      setToastText('播放失败，请检查视频地址以及浏览器编码支持情况。');
    });

    artInstanceRef.current = art;

    return () => {
      art.destroy(false);
      artInstanceRef.current = null;
    };
  }, [currentVideo, library?.defaultPoster, moveTo]);

  const addToQueue = (videoId) => {
    setQueueIds((previous) => {
      if (previous.includes(videoId)) {
        setToastText('该文件已在播放队列中。');
        return previous;
      }
      setToastText('已添加到播放队列。');
      return [...previous, videoId];
    });
  };

  const removeFromQueue = (videoId) => {
    setQueueIds((previous) => {
      if (previous.length <= 1) {
        setToastText('队列至少需要保留一个可播放文件。');
        return previous;
      }
      const targetIndex = previous.indexOf(videoId);
      if (targetIndex < 0) {
        return previous;
      }
      const next = previous.filter((itemId) => itemId !== videoId);
      if (videoId === currentRef.current) {
        const replacement = next[targetIndex] || next[targetIndex - 1] || next[0] || '';
        setCurrentId(replacement);
        setActiveVariantUrl(null);
        setCodecFilter(CODEC_FILTERS.all);
      }
      setToastText('已从播放队列移除。');
      return next;
    });
  };

  const removeCurrent = () => {
    if (!currentRef.current) {
      return;
    }
    removeFromQueue(currentRef.current);
  };

  if (loadError) {
    return (
      <div className={`page player-page ${isProd ? 'prod-ui' : 'dev-ui'}`}>
        <div className="noise-layer" />
        <main className="single-card">
          <section className="card content-card">
            <h1>无法加载 videos.json</h1>
            <p className="muted">{loadError}</p>
            <Link to="/" className="ghost-btn inline-btn">
              返回文件管理
            </Link>
          </section>
        </main>
      </div>
    );
  }

  if (library && library.videos.length === 0) {
    return (
      <div className={`page player-page ${isProd ? 'prod-ui' : 'dev-ui'}`}>
        <div className="noise-layer" />
        <main className="single-card">
          <section className="card content-card">
            <h1>暂无可播放视频</h1>
            <p className="muted">请先在 public/videos.json 中添加视频条目。</p>
            <Link to="/" className="ghost-btn inline-btn">
              返回文件管理
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={`page player-page ${isProd ? 'prod-ui' : 'dev-ui'}`}>
      <div className="noise-layer" />
      <header className="top-header card compact">
        <div>
          <p className="eyebrow">{isProd ? '正式播放台' : '播放控制台'}</p>
          <h1>{library?.siteTitle || 'SMAI 俱乐部播放器'}</h1>
          <p className="muted small">H.265 与 4K 播放能力取决于浏览器和硬件解码支持。</p>
          {!isProd ? <p className="muted small">当前入口：{UI_NAME}</p> : null}
        </div>
        <div className="header-actions">
          <Link className="ghost-btn" to="/">
            返回文件管理
          </Link>
        </div>
      </header>

      <main className="player-layout">
        <section className="card player-screen">
          <div ref={artContainerRef} className="art-container" />
          <div className="playing-meta">
            <h2>{currentVideo?.title || '未选择文件'}</h2>
            <p className="muted">
              {[
                activeVariant?.codec || currentVideo?.codec,
                activeVariant?.resolution || currentVideo?.resolution,
                currentVideo?.duration,
              ]
                .filter(Boolean)
                .join(' | ')}
            </p>
            {codecOptions.length > 1 ? (
              <div className="variant-row" role="group" aria-label="编码切换">
                <button
                  type="button"
                  className={`mode-btn ${codecFilter === CODEC_FILTERS.all ? 'active' : ''}`}
                  onClick={() => handleCodecSelect(CODEC_FILTERS.all)}
                >
                  全部编码
                </button>
                {codecOptions.includes(CODEC_FILTERS.h265) ? (
                  <button
                    type="button"
                    className={`mode-btn ${codecFilter === CODEC_FILTERS.h265 ? 'active' : ''}`}
                    onClick={() => handleCodecSelect(CODEC_FILTERS.h265)}
                  >
                    H.265
                  </button>
                ) : null}
                {codecOptions.includes(CODEC_FILTERS.h264) ? (
                  <button
                    type="button"
                    className={`mode-btn ${codecFilter === CODEC_FILTERS.h264 ? 'active' : ''}`}
                    onClick={() => handleCodecSelect(CODEC_FILTERS.h264)}
                  >
                    H.264
                  </button>
                ) : null}
              </div>
            ) : null}
            {visibleVariants.length > 0 ? (
              <div className="variant-row" role="group" aria-label="质量切换">
                {visibleVariants.map((variantOption) => (
                  <button
                    key={variantOption.url}
                    type="button"
                    className={`mode-btn ${(activeVariantUrl ?? currentVideo.url) === variantOption.url ? 'active' : ''}`}
                    onClick={() => switchVariant(variantOption.url)}
                  >
                    {variantOption.label || `${variantOption.resolution} ${variantOption.codec}`.trim()}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="download-row" role="group" aria-label="下载">
              <button type="button" className="ghost-btn" onClick={downloadCurrent}>
                下载当前版本
              </button>
              <button type="button" className="ghost-btn" onClick={copyDownloadLink}>
                复制下载链接
              </button>
            </div>
            {isProd ? <p className="muted small">生产版 UI：聚焦播放体验与队列控制。</p> : null}
          </div>
        </section>

        <aside className="card playlist-panel">
          <div className="section-head stack-wrap">
            <h2>{isProd ? '播放队列' : '当前队列'}</h2>
            <button type="button" className="ghost-btn" onClick={() => setLibraryOpen(true)}>
              从 JSON 添加
            </button>
          </div>

          <div className="mode-row" role="group" aria-label="播放模式">
            <button
              type="button"
              className={`mode-btn ${mode === MODES.single ? 'active' : ''}`}
              onClick={() => setMode(MODES.single)}
            >
              {isProd ? '单片循环' : '单曲循环'}
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === MODES.list ? 'active' : ''}`}
              onClick={() => setMode(MODES.list)}
            >
              列表循环
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === MODES.shuffle ? 'active' : ''}`}
              onClick={() => setMode(MODES.shuffle)}
            >
              随机播放
            </button>
          </div>
          <p className="muted small">{getModeHint(mode)}</p>

          <ul className="queue-list">
            {queueVideos.map((video) => (
              <li key={video.id} className={`queue-item ${video.id === currentId ? 'active' : ''}`}>
                <div className="queue-item-head">
                  <button type="button" className="ghost-btn tiny-btn" onClick={() => moveTo(video.id)}>
                    播放
                  </button>
                  <button type="button" className="ghost-btn tiny-btn danger" onClick={() => removeFromQueue(video.id)}>
                    移除
                  </button>
                </div>
                <p className="queue-item-title">{video.title}</p>
                <p className="muted small">
                  {[video.codec, video.resolution, video.duration].filter(Boolean).join(' | ')}
                </p>
              </li>
            ))}
          </ul>

          <div className="queue-actions">
            <button type="button" className="ghost-btn" onClick={playPrev}>
              上一首
            </button>
            <button type="button" className="ghost-btn" onClick={playNext}>
              下一首
            </button>
            <button type="button" className="ghost-btn danger" onClick={removeCurrent}>
              移除当前
            </button>
          </div>
        </aside>
      </main>

      <section className={`modal ${isLibraryOpen ? '' : 'hidden'}`}>
        <div className="modal-card card">
          <div className="section-head stack-wrap">
            <h2>从 JSON 添加文件</h2>
            <button type="button" className="ghost-btn" onClick={() => setLibraryOpen(false)}>
              关闭
            </button>
          </div>
          <div className="library-list">
            {(library?.videos || []).map((video) => {
              const inQueue = queueIds.includes(video.id);
              return (
                <div className="library-row" key={video.id}>
                  <div>
                    <p className="queue-item-title">{video.title}</p>
                    <p className="muted small">
                      {[video.codec, video.resolution, video.duration].filter(Boolean).join(' | ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => addToQueue(video.id)}
                    disabled={inQueue}
                  >
                    {inQueue ? '已在队列' : '添加'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className={`toast ${toastText ? '' : 'hidden'}`}>{toastText}</div>
    </div>
  );
}
