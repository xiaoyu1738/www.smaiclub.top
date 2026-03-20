import { useMemo, useState } from 'react';
import { Disc3, Play, Search, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCatalog } from '../hooks/useCatalog';
import { resetPlaybackProgress, saveTrack } from '../playerState';

type AllSongsPageProps = {
  searchText: string;
};

const ALL_REGION = '全部地区';
const ALL_GENRE = '全部流派';

type SongEntry = {
  id: string;
  title: string;
  duration: string | null;
  cover: string;
  path: string;
  version: string | null;
  lyricPath: string | null;
  lyricVersion: string | null;
  albumTitle: string;
  artistName: string;
  artistSlug: string;
  region: string;
  genres: string[];
};

function matchesSongKeyword(entry: SongEntry, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }

  return [
    entry.title,
    entry.artistName,
    entry.albumTitle,
    entry.region,
    entry.genres.join(' ')
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedKeyword);
}

export function AllSongsPage({ searchText }: AllSongsPageProps) {
  const { artists, error, isLoading, refresh } = useCatalog();
  const navigate = useNavigate();
  const location = useLocation();
  const [region, setRegion] = useState(ALL_REGION);
  const [genre, setGenre] = useState(ALL_GENRE);

  const entries = useMemo<SongEntry[]>(() => {
    return artists.flatMap((artist) =>
      artist.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        duration: track.duration,
        cover: track.cover,
        path: track.path,
        version: track.version,
        lyricPath: track.lyricPath,
        lyricVersion: track.lyricVersion,
        albumTitle: track.albumTitle,
        artistName: track.artistName,
        artistSlug: track.artistSlug,
        region: artist.region,
        genres: artist.genres
      }))
    );
  }, [artists]);

  const regions = useMemo(() => {
    return [ALL_REGION, ...Array.from(new Set(entries.map((entry) => entry.region)))];
  }, [entries]);

  const genres = useMemo(() => {
    return [ALL_GENRE, ...Array.from(new Set(entries.flatMap((entry) => entry.genres))).sort((left, right) => left.localeCompare(right))];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesKeyword = matchesSongKeyword(entry, searchText);
      const matchesRegion = region === ALL_REGION ? true : entry.region === region;
      const matchesGenre = genre === ALL_GENRE ? true : entry.genres.includes(genre);
      return matchesKeyword && matchesRegion && matchesGenre;
    });
  }, [entries, genre, region, searchText]);

  return (
    <section className="bg-background-dark font-display text-slate-100 min-h-[calc(100vh-88px)] animate-fade-in">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-12 md:px-6">
        <section className="songs-hero relative mt-6 overflow-hidden rounded-[32px] p-6 md:p-8">
          <div className="songs-hero-grid">
            <div>
              <p className="songs-hero-kicker">
                <Sparkles size={14} aria-hidden="true" />
                SONG ATLAS
              </p>
              <h1 className="songs-hero-title">全部歌曲</h1>
              <p className="songs-hero-copy">
                把艺人、专辑、歌名、流派和地区都放进同一个检索面板里，像翻唱片目录一样找歌。
              </p>
            </div>
            <div className="songs-hero-stats">
              <div className="songs-stat-card">
                <span>已收录歌曲</span>
                <strong>{entries.length}</strong>
              </div>
              <div className="songs-stat-card">
                <span>艺人数量</span>
                <strong>{artists.length}</strong>
              </div>
              <div className="songs-stat-card">
                <span>当前结果</span>
                <strong>{filteredEntries.length}</strong>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-slate-100">
            目录刷新失败：{error}
            <button type="button" className="ml-3 text-primary hover:underline" onClick={() => void refresh()}>
              重新获取
            </button>
          </div>
        ) : null}

        <section className="songs-filter-panel">
          <div className="songs-filter-head">
            <div>
              <p className="songs-filter-label">目录筛选</p>
              <h2>按地区与流派缩小范围</h2>
            </div>
          </div>

          <div className="songs-chip-row">
            {regions.map((item) => (
              <button
                key={item}
                type="button"
                className={`songs-chip ${region === item ? 'is-active' : ''}`}
                onClick={() => setRegion(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="songs-chip-row">
            {genres.map((item) => (
              <button
                key={item}
                type="button"
                className={`songs-chip ${genre === item ? 'is-active' : ''}`}
                onClick={() => setGenre(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="songs-list">
          {filteredEntries.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className="song-row"
              onClick={() => {
                saveTrack({
                  title: entry.title,
                  artist: entry.artistName,
                  album: entry.albumTitle,
                  cover: entry.cover,
                  path: entry.path,
                  version: entry.version,
                  lyricPath: entry.lyricPath,
                  lyricVersion: entry.lyricVersion
                });
                resetPlaybackProgress();
                navigate('/player', {
                  state: {
                    fromPath: `${location.pathname}${location.search}`
                  }
                });
              }}
            >
              <span className="song-row-index">{String(index + 1).padStart(2, '0')}</span>
              <img className="song-row-cover" src={entry.cover} alt={`${entry.title} 封面`} />
              <span className="song-row-main">
                <span className="song-row-title">{entry.title}</span>
                <span className="song-row-meta">
                  <span>{entry.artistName}</span>
                  <span>·</span>
                  <span>{entry.albumTitle}</span>
                  <span>·</span>
                  <span>{entry.region}</span>
                </span>
              </span>
              <span className="song-row-tags">
                {entry.genres.slice(0, 2).map((item) => (
                  <span key={`${entry.id}-${item}`} className="song-row-tag">
                    {item}
                  </span>
                ))}
              </span>
              <span className="song-row-duration">{entry.duration ?? '未知时长'}</span>
              <span className="song-row-action">
                <Play size={16} aria-hidden="true" />
              </span>
            </button>
          ))}

          {isLoading && entries.length === 0 ? (
            <div className="songs-empty-state">
              <Disc3 size={20} aria-hidden="true" />
              <span>正在整理歌曲目录...</span>
            </div>
          ) : null}

          {!isLoading && filteredEntries.length === 0 ? (
            <div className="songs-empty-state">
              <Search size={20} aria-hidden="true" />
              <span>没有找到符合当前条件的歌曲。</span>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}
