export type ArtistRegion = string;

import { PROXY_PLAYER_ORIGIN, normalizeProxyOriginUrl } from '../config/mediaProxy';

export interface CatalogTrack {
  id: string;
  title: string;
  duration: string | null;
  cover: string;
  path: string;
  lyricPath: string | null;
  version: string | null;
  lyricVersion: string | null;
  albumSlug: string;
  albumTitle: string;
  artistSlug: string;
  artistName: string;
}

export interface CatalogAlbum {
  id: string;
  slug: string;
  title: string;
  cover: string;
  basePath: string;
  tracks: CatalogTrack[];
}

export interface CatalogArtist {
  slug: string;
  name: string;
  region: ArtistRegion;
  genres: string[];
  listeners: string;
  avatar: string;
  hero: string;
  about: string;
  albums: CatalogAlbum[];
  tracks: CatalogTrack[];
}

export interface CatalogCacheSnapshot {
  version: string | null;
  artists: CatalogArtist[];
  updatedAt: number;
}

const LEGACY_MUSIC_PREFIX = '/aliyun/music';
const MUSIC_PREFIX = '/assets/music';

/** catalog 数据现统一走 Worker 代理，解决前端直连 AList 的 CORS + 401 问题 */
export const CATALOG_REMOTE_URL =
  import.meta.env.VITE_CATALOG_URL ?? `${PROXY_PLAYER_ORIGIN}/api/music/catalog`;
export const CATALOG_CACHE_STORAGE_KEY = 'hall.catalog.v3';
export const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeMusicLibraryPath(path: string): string {
  return path.startsWith(LEGACY_MUSIC_PREFIX)
    ? `${MUSIC_PREFIX}${path.slice(LEGACY_MUSIC_PREFIX.length)}`
    : path;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readVersionValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return readString(value);
}

function appendVersionParam(url: string, version: string | null | undefined): string {
  if (!version) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

function readAssetVersion(
  record: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = readVersionValue(record?.[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
}

function createSlug(value: string, prefix: string, index: number): string {
  const normalized = encodeURIComponent(value.trim().toLowerCase()).replace(/%/g, '-');
  const compact = normalized.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return compact || `${prefix}-${index + 1}`;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

function joinPath(basePath: string, fileName: string): string {
  const normalizedBase = normalizeMusicLibraryPath(basePath).replace(/\/+$/, '');
  const normalizedFile = fileName.replace(/^\/+/, '');
  return normalizedBase ? `${normalizedBase}/${normalizedFile}` : `/${normalizedFile}`;
}

function getParentPath(path: string): string {
  const normalizedPath = path.replace(/\/+$/, '');
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  if (lastSlashIndex <= 0) {
    return '';
  }

  return normalizedPath.slice(0, lastSlashIndex);
}


function toAbsoluteAssetUrl(pathOrUrl: string): string {
  // 已经是完整 URL（外部 CDN 链接等）则直接返回
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return normalizeProxyOriginUrl(pathOrUrl);
  }

  // 本地路径 → 走 Worker 资源代理端点，Worker 会 302 到云存储直链
  const normalizedPath = normalizeMusicLibraryPath(
    pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  );
  return `${PROXY_PLAYER_ORIGIN}/api/music/asset?path=${encodeURIComponent(normalizedPath)}`;
}

function resolveAssetUrl(
  basePath: string,
  asset: string | null,
  fallback: string,
  version?: string | null
): string {
  if (asset) {
    if (/^https?:\/\//i.test(asset)) {
      return appendVersionParam(asset, version);
    }

    if (asset.startsWith('/')) {
      return appendVersionParam(toAbsoluteAssetUrl(asset), version);
    }

    return appendVersionParam(toAbsoluteAssetUrl(joinPath(basePath, asset)), version);
  }

  return appendVersionParam(fallback, version);
}

function resolveTrackPath(
  trackRecord: Record<string, unknown> | null,
  basePath: string,
  fallbackFileName: string | null
): string | null {
  const explicitPath = readString(trackRecord?.path);
  if (explicitPath?.startsWith('/')) {
    return normalizeMusicLibraryPath(explicitPath);
  }

  if (fallbackFileName) {
    return joinPath(basePath, fallbackFileName);
  }

  return null;
}

function normalizeTrack(
  trackValue: unknown,
  artist: Pick<CatalogArtist, 'name' | 'slug'>,
  album: Pick<CatalogAlbum, 'slug' | 'title' | 'cover' | 'basePath'>,
  trackIndex: number
): CatalogTrack | null {
  const trackRecord = asRecord(trackValue);
  const fallbackFileName =
    typeof trackValue === 'string'
      ? readString(trackValue)
      : readString(trackRecord?.file) ??
      readString(trackRecord?.filename) ??
      readString(trackRecord?.name) ??
      readString(trackRecord?.source);
  const path = resolveTrackPath(trackRecord, album.basePath, fallbackFileName);

  if (!path) {
    return null;
  }

  const title =
    readString(trackRecord?.title) ??
    (fallbackFileName ? stripExtension(fallbackFileName.split('/').pop() ?? fallbackFileName) : null) ??
    `Track ${trackIndex + 1}`;
  const duration = readString(trackRecord?.duration);
  const coverVersion = readAssetVersion(trackRecord, 'cover_version', 'coverVersion');
  const lyricVersion =
    readVersionValue(trackRecord?.lyric_version) ??
    readVersionValue(trackRecord?.lyricVersion);
  const cover = resolveAssetUrl(
    album.basePath,
    readString(trackRecord?.cover),
    album.cover,
    coverVersion
  );
  const lyricPath = (() => {
    const explicitLyricPath =
      readString(trackRecord?.lyric_path) ??
      readString(trackRecord?.lyricPath) ??
      readString(trackRecord?.lrc_path) ??
      readString(trackRecord?.lrcPath);

    if (explicitLyricPath) {
      if (explicitLyricPath.startsWith('/')) {
        return appendVersionParam(toAbsoluteAssetUrl(explicitLyricPath), lyricVersion);
      }

      return appendVersionParam(
        toAbsoluteAssetUrl(joinPath(album.basePath, explicitLyricPath)),
        lyricVersion
      );
    }

    const lyricFile =
      readString(trackRecord?.lyric) ??
      readString(trackRecord?.lyrics) ??
      readString(trackRecord?.lrc);

    return lyricFile
      ? appendVersionParam(toAbsoluteAssetUrl(joinPath(album.basePath, lyricFile)), lyricVersion)
      : null;
  })();
  const version =
    readVersionValue(trackRecord?.version) ??
    readVersionValue(trackRecord?.audio_version) ??
    readVersionValue(trackRecord?.audioVersion);

  return {
    id: `${album.slug}-${trackIndex + 1}-${createSlug(title, 'track', trackIndex)}`,
    title,
    duration,
    cover,
    path,
    lyricPath,
    version,
    lyricVersion,
    albumSlug: album.slug,
    albumTitle: album.title,
    artistSlug: artist.slug,
    artistName: artist.name
  };
}

function normalizeAlbum(
  albumValue: unknown,
  artist: Pick<CatalogArtist, 'name' | 'slug'>,
  albumIndex: number
): CatalogAlbum | null {
  const albumRecord = asRecord(albumValue);
  if (!albumRecord) {
    return null;
  }

  const title = readString(albumRecord.title) ?? `Untitled Album ${albumIndex + 1}`;
  const basePath = normalizeMusicLibraryPath(
    readString(albumRecord.base_path) ?? readString(albumRecord.basePath) ?? ''
  );
  const slug = createSlug(`${artist.slug}-${title}`, 'album', albumIndex);
  const coverVersion = readAssetVersion(albumRecord, 'cover_version', 'coverVersion');
  const coverFallback = basePath
    ? appendVersionParam(toAbsoluteAssetUrl(joinPath(basePath, 'cover.jpg')), coverVersion)
    : '';
  const cover = resolveAssetUrl(basePath, readString(albumRecord.cover), coverFallback, coverVersion);
  const trackValues = Array.isArray(albumRecord.tracks) ? albumRecord.tracks : [];
  const albumForTracks: Pick<CatalogAlbum, 'slug' | 'title' | 'cover' | 'basePath'> = {
    slug,
    title,
    cover,
    basePath
  };
  const tracks = trackValues
    .map((trackValue, trackIndex) => normalizeTrack(trackValue, artist, albumForTracks, trackIndex))
    .filter((track): track is CatalogTrack => Boolean(track));

  return {
    id: slug,
    slug,
    title,
    cover,
    basePath,
    tracks
  };
}

function normalizeRegion(value: string | null): ArtistRegion {
  return value?.trim() || '未知';
}

export function normalizeCatalogPayload(payload: unknown): CatalogArtist[] {
  const rootRecord = asRecord(payload);
  const bandValues = Array.isArray(rootRecord?.bands) ? rootRecord.bands : [];

  return bandValues
    .map((bandValue, bandIndex) => {
      const bandRecord = asRecord(bandValue);
      if (!bandRecord) {
        return null;
      }

      const name = readString(bandRecord.name) ?? `Unknown Artist ${bandIndex + 1}`;
      const slug = createSlug(name, 'artist', bandIndex);
      const region = normalizeRegion(readString(bandRecord.region));
      const genres = readStringArray(bandRecord.genres);
      const albums = (Array.isArray(bandRecord.albums) ? bandRecord.albums : [])
        .map((albumValue, albumIndex) => normalizeAlbum(albumValue, { name, slug }, albumIndex))
        .filter((album): album is CatalogAlbum => Boolean(album));
      const tracks = albums.flatMap((album) => album.tracks);
      const bandBasePath =
        readString(bandRecord.base_path) ??
        readString(bandRecord.basePath) ??
        (albums[0]?.basePath ? getParentPath(albums[0].basePath) : '');
      const fallbackCover = albums[0]?.cover ?? '';
      const avatarVersion = readAssetVersion(bandRecord, 'avatar_version', 'avatarVersion', 'image_version', 'imageVersion');
      const heroVersion = readAssetVersion(bandRecord, 'hero_version', 'heroVersion', 'banner_version', 'bannerVersion');
      const avatar = resolveAssetUrl(
        bandBasePath,
        readString(bandRecord.avatar) ?? readString(bandRecord.image),
        fallbackCover,
        avatarVersion
      );
      const hero = resolveAssetUrl(
        bandBasePath,
        readString(bandRecord.hero) ?? readString(bandRecord.banner),
        avatar || fallbackCover,
        heroVersion
      );
      const resolvedHero = hero || avatar || fallbackCover;
      const resolvedAvatar = avatar || hero || fallbackCover;
      const listeners =
        readString(bandRecord.listeners) ??
        `${albums.length} 张专辑 · ${tracks.length} 首歌曲`;
      const about =
        readString(bandRecord.about) ??
        `${name} 当前已整理 ${albums.length} 张专辑，收录 ${tracks.length} 首歌曲。`;

      return {
        slug,
        name,
        region,
        genres: genres.length > 0 ? genres : ['Rock'],
        listeners,
        avatar: resolvedAvatar,
        hero: resolvedHero,
        about,
        albums,
        tracks
      };
    })
    .filter((artist): artist is CatalogArtist => Boolean(artist))
    .filter((artist) => artist.albums.length > 0 || artist.tracks.length > 0);
}

export function readCatalogVersion(payload: unknown): string | null {
  const rootRecord = asRecord(payload);
  return readVersionValue(rootRecord?.version);
}

export function serializeCatalogArtists(artists: CatalogArtist[]): string {
  return JSON.stringify(artists);
}

export function getArtistBySlug(artists: CatalogArtist[], slug: string): CatalogArtist | undefined {
  return artists.find((artist) => artist.slug === slug);
}

export function artistMatchesKeyword(artist: CatalogArtist, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }

  const haystack = [
    artist.name,
    artist.region,
    artist.genres.join(' '),
    artist.about,
    artist.listeners,
    artist.albums.map((album) => album.title).join(' '),
    artist.tracks.map((track) => `${track.title} ${track.albumTitle}`).join(' ')
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedKeyword);
}

export function getArtistLetter(name: string): string {
  const firstLetter = name.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(firstLetter) ? firstLetter : '#';
}

function normalizeCachedArtists(artists: CatalogArtist[]): CatalogArtist[] {
  return artists.map((artist) => ({
    ...artist,
    avatar: artist.avatar ? toAbsoluteAssetUrl(artist.avatar) : artist.avatar,
    hero: artist.hero ? toAbsoluteAssetUrl(artist.hero) : artist.hero,
    albums: artist.albums.map((album) => ({
      ...album,
      basePath: normalizeMusicLibraryPath(album.basePath),
      cover: album.cover ? toAbsoluteAssetUrl(album.cover) : album.cover,
      tracks: album.tracks.map((track) => ({
        ...track,
        cover: track.cover ? toAbsoluteAssetUrl(track.cover) : track.cover,
        lyricPath: track.lyricPath ? toAbsoluteAssetUrl(track.lyricPath) : track.lyricPath,
        path: normalizeMusicLibraryPath(track.path)
      }))
    })),
    tracks: artist.tracks.map((track) => ({
      ...track,
      cover: track.cover ? toAbsoluteAssetUrl(track.cover) : track.cover,
      lyricPath: track.lyricPath ? toAbsoluteAssetUrl(track.lyricPath) : track.lyricPath,
      path: normalizeMusicLibraryPath(track.path)
    }))
  }));
}

export function readCachedCatalogSnapshot(): CatalogCacheSnapshot | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawSnapshot = localStorage.getItem(CATALOG_CACHE_STORAGE_KEY);
  if (!rawSnapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as Partial<CatalogCacheSnapshot>;
    if (!Array.isArray(parsed.artists) || typeof parsed.updatedAt !== 'number') {
      localStorage.removeItem(CATALOG_CACHE_STORAGE_KEY);
      return null;
    }

    if (Date.now() - parsed.updatedAt > CATALOG_CACHE_TTL_MS) {
      localStorage.removeItem(CATALOG_CACHE_STORAGE_KEY);
      return null;
    }

    return {
      version: readVersionValue(parsed.version),
      artists: normalizeCachedArtists(parsed.artists as CatalogArtist[]),
      updatedAt: parsed.updatedAt
    };
  } catch {
    localStorage.removeItem(CATALOG_CACHE_STORAGE_KEY);
    return null;
  }
}

export function writeCachedCatalogSnapshot(snapshot: CatalogCacheSnapshot): void {
  if (!canUseLocalStorage()) {
    return;
  }

  localStorage.setItem(CATALOG_CACHE_STORAGE_KEY, JSON.stringify(snapshot));
}
