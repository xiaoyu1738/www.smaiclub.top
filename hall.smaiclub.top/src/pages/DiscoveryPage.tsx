import { Link } from 'react-router-dom';
import { artistMatchesKeyword } from '../data/catalog';
import { useCatalog } from '../hooks/useCatalog';

type DiscoveryPageProps = {
  searchText: string;
};

const HERO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBl_n1_BMKx5ReC3AjtrNZfOBKNUhITX89TdWrsi9e0Oj8YhB0hCUR9scDgTtW8uGVdhjCjZq9kq0Jz_i_sOH10F1fSIoeCMF7sVBMB6Y6Ad3B5FXzF8pwTuV3ULZ-OlrOkPMT-g7o_O-3FPdmWdjw8shyhqS9i_YKdYw3rXjEImCYcjZSwUW6r7WyFE_99Z8fAF6_YJ0yXVw4kTny0w0O3qJ48Bf6YZ635TtH3CG8XnJis1hawtFRq6XNomeO0AMF6Z3-YDokU78M';

export function DiscoveryPage({ searchText }: DiscoveryPageProps) {
  const { artists, error, isLoading, isRefreshing, refresh } = useCatalog();
  const list = artists.filter((artist) => artistMatchesKeyword(artist, searchText));

  return (
    <section className="bg-background-dark font-display text-slate-100 min-h-[calc(100vh-88px)] animate-fade-in">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pb-10 md:px-6">
        <div
          className="relative mt-6 flex min-h-[380px] flex-col items-center justify-center gap-5 overflow-hidden rounded-xl bg-cover bg-center p-8 text-center animate-fade-up"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.8) 100%), url('${HERO}')`
          }}
        >
          <h1 className="text-5xl font-black uppercase tracking-tighter text-white md:text-6xl">寻找你的节奏</h1>
          <p className="max-w-2xl text-lg font-medium tracking-wide text-slate-300 md:text-xl">
            在 SMAI CLUB 发现最棒的摇滚乐队、传奇艺术家和纯粹的能量。
          </p>
          {isRefreshing ? <span className="sr-only">目录刷新中</span> : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-slate-100">
            目录刷新失败：{error}
            <button type="button" className="ml-3 text-primary hover:underline" onClick={() => void refresh()}>
              重新获取
            </button>
          </div>
        ) : null}

        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="border-l-4 border-primary pl-4 text-2xl font-black uppercase tracking-tight md:text-3xl">特色传奇</h2>
            <Link className="text-sm font-bold uppercase tracking-wider text-primary hover:underline" to="/artists">
              查看全部
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((artist) => (
              <Link key={artist.slug} className="group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-xl" to={`/artist/${artist.slug}`}>
                <img
                  src={artist.hero || artist.avatar}
                  alt={`${artist.name} 专辑封面集合`}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-80" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <span className="mb-2 inline-block rounded border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90">
                    {artist.genres[0]}
                  </span>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white group-hover:text-primary">{artist.name}</h3>
                  <p className="text-sm font-medium text-slate-300">
                    {artist.albums.length} 张专辑 · {artist.tracks.length} 首歌曲
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {isLoading && artists.length === 0 ? <p className="text-center text-slate-400">正在加载目录...</p> : null}
          {!isLoading && list.length === 0 ? <p className="text-center text-slate-500">没有匹配结果</p> : null}
        </section>
      </div>
    </section>
  );
}
