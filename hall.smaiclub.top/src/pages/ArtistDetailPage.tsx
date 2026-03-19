import { useMemo } from 'react';
import { Info, Play } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCatalog } from '../hooks/useCatalog';
import { resetPlaybackProgress, saveTrack } from '../playerState';

export function ArtistDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { artists, getArtist, isLoading } = useCatalog();

  const artist = useMemo(() => {
    if (!slug) {
      return artists[0];
    }

    return getArtist(slug);
  }, [artists, getArtist, slug]);

  const similar = useMemo(
    () => artists.filter((item) => item.slug !== artist?.slug).slice(0, 3),
    [artist?.slug, artists]
  );

  if (!artist) {
    return (
      <section className="bg-background-dark text-slate-100 min-h-[calc(100vh-88px)] font-display animate-fade-in">
        <main className="mx-auto flex h-full max-w-[960px] items-center justify-center px-4 py-10 md:px-6">
          <p className="text-slate-400">{isLoading ? '正在加载歌手目录...' : '没有找到对应的歌手。'}</p>
        </main>
      </section>
    );
  }

  return (
    <section className="bg-background-dark text-slate-100 min-h-[calc(100vh-88px)] font-display animate-fade-in">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-8 md:px-6 lg:flex-row">
        <div className="flex flex-1 flex-col gap-8">
          <div className="relative h-80 w-full overflow-hidden rounded-xl shadow-2xl">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${artist.hero || artist.avatar}')` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-background-dark via-background-dark/50 to-transparent" />
            <div className="absolute bottom-0 left-0 w-full p-8">
              <div className="mb-2 flex flex-wrap items-center gap-4">
                <h1 className="text-4xl font-bold text-white md:text-5xl">{artist.name}</h1>
                <div className="flex gap-2">
                  {artist.genres.map((genre) => (
                    <span key={genre} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white">
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-lg text-slate-300">{artist.listeners}</p>
            </div>
          </div>

          <div className="space-y-6">
            {artist.albums.map((album) => (
              <section key={album.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-col gap-5 md:flex-row md:items-center">
                  <img src={album.cover} alt={`${album.title} 专辑封面`} className="h-32 w-32 rounded-xl object-cover shadow-lg shadow-black/35" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Album</p>
                    <h2 className="mt-2 text-2xl font-black text-white">{album.title}</h2>
                    <p className="mt-2 text-sm text-slate-400">{album.tracks.length} 首歌曲</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  {album.tracks.map((track, index) => (
                    <button
                      key={track.id}
                      type="button"
                      className="group flex cursor-pointer items-center gap-4 rounded-lg bg-white/5 p-3 text-left hover:bg-primary/10"
                      onClick={() => {
                        saveTrack({
                          title: track.title,
                          artist: artist.name,
                          album: album.title,
                          cover: track.cover,
                          path: track.path,
                          version: track.version,
                          lyricPath: track.lyricPath,
                          lyricVersion: track.lyricVersion
                        });
                        resetPlaybackProgress();
                        navigate('/player', {
                          state: {
                            fromPath: `${location.pathname}${location.search}`
                          }
                        });
                      }}
                    >
                      <span className="w-6 text-center font-medium text-slate-500 group-hover:hidden">{index + 1}</span>
                      <span className="hidden w-6 items-center justify-center text-primary group-hover:flex">
                        <Play size={16} aria-hidden="true" />
                      </span>
                      <img alt={`${track.title} 封面`} className="size-12 rounded object-cover" src={track.cover} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold group-hover:text-primary">{track.title}</p>
                        <p className="truncate text-sm text-slate-400">{track.duration ?? album.title}</p>
                      </div>
                      <span className="text-sm text-slate-400">{track.duration ?? `${album.title}`}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="flex w-full flex-col gap-8 lg:w-80">
          <div className="rounded-xl border border-primary/20 bg-black/20 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Info size={18} className="text-primary" aria-hidden="true" />
              关于
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-slate-300">{artist.about}</p>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-bold">相似艺人</h3>
            <div className="flex flex-col gap-4">
              {similar.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  className="flex items-center gap-4 rounded-lg p-2 text-left transition-colors hover:bg-primary/5"
                  onClick={() => navigate(`/artist/${item.slug}`)}
                >
                  <div className="size-12 rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${item.hero || item.avatar}')` }} />
                  <div className="flex-1">
                    <p className="text-sm font-bold">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.albums.length} 张专辑 · {item.tracks.length} 首歌
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </section>
  );
}
