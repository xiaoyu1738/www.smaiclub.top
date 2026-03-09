import { useEffect, useState } from 'react';
import {
  getCachedMusicLink,
  invalidateMusicLink,
  resolveMusicLink,
  toMusicLinkErrorMessage,
  type MusicLinkSource
} from '../lib/musicLinkCache';

interface UseMusicLinkOptions {
  enabled?: boolean;
}

interface UseMusicLinkState {
  url: string | null;
  expiresAt: number | null;
  source: MusicLinkSource | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseMusicLinkResult extends UseMusicLinkState {
  refresh: () => void;
}

const EMPTY_STATE: UseMusicLinkState = {
  url: null,
  expiresAt: null,
  source: null,
  isLoading: false,
  error: null
};

function getInitialState(path: string | null | undefined, enabled: boolean): UseMusicLinkState {
  if (!enabled || !path?.trim()) {
    return EMPTY_STATE;
  }

  const cached = getCachedMusicLink(path);
  if (cached) {
    return {
      url: cached.url,
      expiresAt: cached.expiresAt,
      source: cached.source,
      isLoading: false,
      error: null
    };
  }

  return {
    ...EMPTY_STATE,
    isLoading: true
  };
}

export function useMusicLink(path: string | null | undefined, options: UseMusicLinkOptions = {}): UseMusicLinkResult {
  const enabled = options.enabled ?? true;
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<UseMusicLinkState>(() => getInitialState(path, enabled));

  useEffect(() => {
    if (!enabled || !path?.trim()) {
      setState(EMPTY_STATE);
      return;
    }

    const cached = getCachedMusicLink(path);
    if (cached) {
      setState({
        url: cached.url,
        expiresAt: cached.expiresAt,
        source: cached.source,
        isLoading: false,
        error: null
      });
      return;
    }

    let isCancelled = false;
    setState((previousState) => ({
      ...previousState,
      url: null,
      expiresAt: null,
      source: null,
      isLoading: true,
      error: null
    }));

    void resolveMusicLink(path)
      .then((result) => {
        if (isCancelled) {
          return;
        }

        setState({
          url: result.url,
          expiresAt: result.expiresAt,
          source: result.source,
          isLoading: false,
          error: null
        });
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        setState({
          ...EMPTY_STATE,
          isLoading: false,
          error: toMusicLinkErrorMessage(error)
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [enabled, path, refreshToken]);

  return {
    ...state,
    refresh: () => {
      if (path?.trim()) {
        invalidateMusicLink(path);
      }
      setRefreshToken((currentValue) => currentValue + 1);
    }
  };
}
