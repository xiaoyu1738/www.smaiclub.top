import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  CATALOG_REMOTE_URL,
  getArtistBySlug,
  normalizeCatalogPayload,
  readCachedCatalogSnapshot,
  serializeCatalogArtists,
  writeCachedCatalogSnapshot,
  type CatalogArtist,
  type CatalogCacheSnapshot
} from '../data/catalog';

interface CatalogContextValue {
  artists: CatalogArtist[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  updatedAt: number | null;
  refresh: () => Promise<void>;
  getArtist: (slug: string) => CatalogArtist | undefined;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

function getCatalogErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return '目录刷新失败，请稍后重试。';
}

async function fetchRemoteCatalog(): Promise<CatalogCacheSnapshot> {
  const response = await fetch(CATALOG_REMOTE_URL, {
    method: 'GET',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`database.json 请求失败，HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return {
    artists: normalizeCatalogPayload(payload),
    updatedAt: Date.now()
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const initialSnapshot = readCachedCatalogSnapshot();
  const [artists, setArtists] = useState<CatalogArtist[]>(initialSnapshot?.artists ?? []);
  const [updatedAt, setUpdatedAt] = useState<number | null>(initialSnapshot?.updatedAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(initialSnapshot ? false : true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function refresh(): Promise<void> {
    if (isMountedRef.current) {
      setIsRefreshing(true);
      if (artists.length === 0) {
        setIsLoading(true);
      }
    }

    try {
      const nextSnapshot = await fetchRemoteCatalog();
      const cachedSnapshot = readCachedCatalogSnapshot();
      const hasChanged =
        !cachedSnapshot ||
        serializeCatalogArtists(cachedSnapshot.artists) !== serializeCatalogArtists(nextSnapshot.artists);

      if (hasChanged) {
        writeCachedCatalogSnapshot(nextSnapshot);
      }

      if (!isMountedRef.current) {
        return;
      }

      startTransition(() => {
        if (hasChanged || artists.length === 0) {
          setArtists(nextSnapshot.artists);
          setUpdatedAt(nextSnapshot.updatedAt);
        } else if (!updatedAt) {
          setUpdatedAt(nextSnapshot.updatedAt);
        }
        setError(null);
      });
    } catch (nextError) {
      if (!isMountedRef.current) {
        return;
      }

      setError(getCatalogErrorMessage(nextError));
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
    // We only want the boot-time SWR request here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CatalogContext.Provider
      value={{
        artists,
        isLoading,
        isRefreshing,
        error,
        updatedAt,
        refresh,
        getArtist: (slug: string) => getArtistBySlug(artists, slug)
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('useCatalog must be used within CatalogProvider');
  }

  return context;
}
