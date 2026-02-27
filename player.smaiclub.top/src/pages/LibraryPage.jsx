import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { JSON_TEMPLATE, loadLibrary } from '../lib/videos';
import { UI_NAME } from '../config/uiEntry';

export default function LibraryPage({ variant = 'dev' }) {
  const isProd = variant === 'prod';
  const [library, setLibrary] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    loadLibrary()
      .then((data) => {
        if (!mounted) {
          return;
        }
        setLibrary(data);
      })
      .catch((err) => {
        if (!mounted) {
          return;
        }
        setError(err.message || '加载 videos.json 失败');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredVideos = useMemo(() => {
    if (!library) {
      return [];
    }
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return library.videos;
    }
    return library.videos.filter((video) => {
      const plain = [
        video.title,
        video.codec,
        video.resolution,
        video.duration,
        video.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return plain.includes(keyword);
    });
  }, [library, search]);

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(JSON_TEMPLATE, null, 2));
      window.alert('模板已复制');
    } catch {
      window.alert('剪贴板权限被阻止');
    }
  };

  return (
    <div className={`page manager-page ${isProd ? 'prod-ui' : 'dev-ui'}`}>
      <div className="noise-layer" />
      <header className="top-header card">
        <div>
          <p className="eyebrow">{isProd ? '媒体中心' : '媒体空间'}</p>
          <h1>{library?.siteTitle || 'SMAI 俱乐部播放器'}</h1>
          <p className="muted">
            {library?.description ||
              (isProd
                ? '这是生产版 UI，适合最终线上展示。'
                : '这是开发版 UI，适合调试与迭代。')}
          </p>
          {!isProd ? <p className="muted small">当前入口：{UI_NAME}</p> : null}
        </div>
        <div className="header-actions">
          {!isProd ? (
            <a className="ghost-btn" href="/videos.json" target="_blank" rel="noreferrer">
              打开 videos.json
            </a>
          ) : null}
          <Link className="primary-btn" to={library?.videos?.[0] ? `/player/${encodeURIComponent(library.videos[0].id)}` : '/player'}>
            {isProd ? '进入播放中心' : '打开播放器'}
          </Link>
        </div>
      </header>

      <main className={`manager-layout ${isProd ? 'single-column' : ''}`}>
        <section className="card content-card">
          <div className="section-head">
            <h2>{isProd ? '资源总览' : '文件管理'}</h2>
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="按标题、编码、标签、分辨率搜索"
            />
          </div>
          {error ? <p className="muted">{error}</p> : null}
          <p className="muted">
            {library ? `${filteredVideos.length} / ${library.videos.length} 个文件` : '正在加载文件...'}
          </p>
          <div className={isProd ? 'video-list' : 'video-grid'}>
            {filteredVideos.map((video) =>
              isProd ? (
                <Link className="video-row" key={video.id} to={`/player/${encodeURIComponent(video.id)}`}>
                  <img className="video-row-cover" src={video.cover} alt={video.title} loading="lazy" />
                  <div className="video-row-body">
                    <p className="video-title">{video.title}</p>
                    <p className="muted small">{[video.codec, video.resolution, video.duration].filter(Boolean).join(' | ')}</p>
                    <div className="chip-row">
                      {video.variants?.length > 0 ? (
                        <span className="chip chip-quality">{video.variants.length} 种质量</span>
                      ) : null}
                      {video.tags.slice(0, 4).map((tag) => (
                        <span className="chip" key={`${video.id}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              ) : (
                <Link className="video-card" key={video.id} to={`/player/${encodeURIComponent(video.id)}`}>
                  <img className="video-cover" src={video.cover} alt={video.title} loading="lazy" />
                  <div className="video-body">
                    <p className="video-title">{video.title}</p>
                    <div className="chip-row">
                      <span className="chip">{video.codec}</span>
                      <span className="chip">{video.resolution}</span>
                      {video.duration ? <span className="chip">{video.duration}</span> : null}
                      {video.variants?.length > 0 ? (
                        <span className="chip chip-quality">{video.variants.length} 种质量</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ),
            )}
            {library && filteredVideos.length === 0 ? <p className="muted">没有匹配该关键词的文件。</p> : null}
          </div>
        </section>

        {!isProd ? (
          <aside className="card content-card">
            <h2>JSON 模板</h2>
            <p className="muted">请在 public/videos.json 中编辑该结构，应用会在运行时读取。</p>
            <pre className="json-preview">{JSON.stringify(JSON_TEMPLATE, null, 2)}</pre>
            <button className="ghost-btn wide-btn" onClick={copyTemplate} type="button">
              复制模板
            </button>
          </aside>
        ) : null}
      </main>
    </div>
  );
}
