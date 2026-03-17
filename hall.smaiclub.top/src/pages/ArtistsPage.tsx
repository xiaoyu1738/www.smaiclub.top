import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { artistMatchesKeyword, getArtistLetter } from '../data/catalog';
import { useCatalog } from '../hooks/useCatalog';

const LETTERS = ['热', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'] as const;
const ALL_REGION = '全部地区';
const ALL_GENRE = '全部流派';

type ArtistsPageProps = {
  searchText: string;
};

export function ArtistsPage({ searchText }: ArtistsPageProps) {
  const { artists, error, isLoading, refresh } = useCatalog();
  const [region, setRegion] = useState<string>(ALL_REGION);
  const [genre, setGenre] = useState<string>(ALL_GENRE);
  const [letter, setLetter] = useState<(typeof LETTERS)[number]>('热');

  const regions = useMemo(() => {
    const dynamicRegions = Array.from(new Set(artists.map((artist) => artist.region)));
    return [ALL_REGION, ...dynamicRegions];
  }, [artists]);

  const genres = useMemo(() => {
    const dynamicGenres = Array.from(new Set(artists.flatMap((artist) => artist.genres))).sort((left, right) => left.localeCompare(right));
    return [ALL_GENRE, ...dynamicGenres];
  }, [artists]);

  useEffect(() => {
    if (!regions.includes(region)) {
      setRegion(ALL_REGION);
    }
  }, [region, regions]);

  useEffect(() => {
    if (!genres.includes(genre)) {
      setGenre(ALL_GENRE);
    }
  }, [genre, genres]);

  const list = useMemo(() => {
    return artists.filter((artist) => {
      const searchMatch = artistMatchesKeyword(artist, searchText);
      const regionMatch = region === ALL_REGION ? true : artist.region === region;
      const genreMatch = genre === ALL_GENRE ? true : artist.genres.includes(genre);
      const artistLetter = getArtistLetter(artist.name);
      const letterMatch = letter === '热' ? true : artistLetter === letter;
      return searchMatch && regionMatch && genreMatch && letterMatch;
    });
  }, [artists, genre, letter, region, searchText]);

  return (
    <section className="bg-background-dark font-display text-text-dark min-h-[calc(100vh-88px)] animate-fade-in">
      <div className="mx-auto flex w-full max-w-[960px] flex-col px-4 py-6 md:px-6">
        <div className="mt-4 flex min-w-72 flex-col gap-3 px-2">
          <h1 className="text-4xl font-black leading-tight tracking-[-0.033em]">全部艺人</h1>
          <p className="text-base font-normal leading-normal text-subtext-dark">发现更多摇滚乐队和歌手</p>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-slate-100">
            目录刷新失败：{error}
            <button type="button" className="ml-3 text-primary hover:underline" onClick={() => void refresh()}>
              重新获取
            </button>
          </div>
        ) : null}

        <div className="mb-8 mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 px-2">
            <div className="flex h-8 items-center justify-center rounded-lg bg-surface-dark px-4">
              <p className="text-sm font-medium text-text-muted-dark">地区</p>
            </div>
            {regions.map((item) => (
              <button
                key={item}
                type="button"
                className={`flex h-8 items-center justify-center rounded-lg px-4 text-sm font-medium ${region === item ? 'bg-primary text-text-dark' : 'bg-surface-dark/80'
                  }`}
                onClick={() => setRegion(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 px-2">
            <div className="flex h-8 items-center justify-center rounded-lg bg-surface-dark px-4">
              <p className="text-sm font-medium text-text-muted-dark">流派</p>
            </div>
            {genres.map((item) => (
              <button
                key={item}
                type="button"
                className={`flex h-8 items-center justify-center rounded-lg px-4 text-sm font-medium ${genre === item ? 'bg-primary text-text-dark' : 'bg-surface-dark/80'
                  }`}
                onClick={() => setGenre(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="hide-scrollbar flex gap-2 overflow-x-auto px-2 md:flex-wrap">
            {LETTERS.map((item) => (
              <button
                key={item}
                type="button"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium ${letter === item ? 'bg-primary text-text-dark' : 'bg-surface-dark/80'
                  }`}
                onClick={() => setLetter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 p-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((artist) => (
            <Link key={artist.slug} className="group flex cursor-pointer flex-col items-center gap-3" to={`/artist/${artist.slug}`}>
              <div className="h-32 w-32 overflow-hidden rounded-full border-2 border-transparent group-hover:border-primary">
                <img alt={artist.name} className="h-full w-full object-cover" src={artist.hero || artist.avatar} />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-center font-bold group-hover:text-primary">{artist.name}</p>
                <span className="rounded-full bg-surface-dark/80 px-2 py-1 text-[11px] font-medium leading-none text-subtext-dark">
                  {artist.genres[0]}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {isLoading && artists.length === 0 ? <p className="px-2 text-slate-400">正在加载目录...</p> : null}
        {!isLoading && list.length === 0 ? <p className="px-2 text-slate-500">没有匹配的艺人、专辑或歌曲。</p> : null}
      </div>
    </section>
  );
}
