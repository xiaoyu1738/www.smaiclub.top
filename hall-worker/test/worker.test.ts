import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import worker from '../src/index.ts';

interface TestEnv {
  ALIST_HOST: string;
  PRODUCTION_ORIGIN: string;
  MUSIC_CACHE: KVNamespace;
  ALIST_TOKEN?: string;
  ALIST_USERNAME?: string;
  ALIST_PASSWORD?: string;
  ALIST_PASSWORD_HASH?: string;
}

class MemoryKV implements KVNamespace {
  private readonly storage = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async getWithMetadata(): Promise<KVNamespaceGetWithMetadataResult<null>> {
    throw new Error('Not implemented for tests');
  }

  list(): Promise<KVNamespaceListResult<null>> {
    throw new Error('Not implemented for tests');
  }
}

function createEnv(): TestEnv {
  return {
    ALIST_HOST: 'https://smaiclub-alist-v3.onrender.com/assets/music',
    ALIST_TOKEN: 'test-token',
    PRODUCTION_ORIGIN: 'https://hall.smaiclub.top',
    MUSIC_CACHE: new MemoryKV(),
  };
}

function createCtx(): ExecutionContext {
  return {
    waitUntil(_promise: Promise<unknown>) {
      // no-op in tests
    },
    passThroughOnException() {
      // no-op in tests
    },
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('hall-worker music gateway', () => {
  it('keeps /api/music/get-link as JSON contract and points to /api/music/stream', async () => {
    const env = createEnv();
    const ctx = createCtx();
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init });

      if (url === 'https://smaiclub-alist-v3.onrender.com/api/fs/get') {
        return new Response(
          JSON.stringify({
            code: 200,
            data: { raw_url: 'https://google.test/track.mp3' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://hall-worker.test/api/music/get-link?path=/assets/music/test.mp3'),
      env as any,
      ctx
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { code: number; url: string };
    assert.equal(payload.code, 200);
    assert.match(payload.url, /\/api\/music\/stream\?path=%2Fassets%2Fmusic%2Ftest\.mp3$/);
    assert.equal(calls.length, 1);
  });

  it('proxies /api/music/stream with Range headers and returns upstream audio stream', async () => {
    const env = createEnv();
    const ctx = createCtx();
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init });

      if (url === 'https://smaiclub-alist-v3.onrender.com/api/fs/get') {
        return new Response(
          JSON.stringify({
            code: 200,
            data: { raw_url: 'https://google.test/stream.mp3' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url === 'https://google.test/stream.mp3') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('range'), 'bytes=0-10');

        return new Response('audio-chunk', {
          status: 206,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Range': 'bytes 0-10/100',
            'Accept-Ranges': 'bytes',
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://hall-worker.test/api/music/stream?path=/assets/music/test.mp3', {
        headers: { Range: 'bytes=0-10' },
      }),
      env as any,
      ctx
    );

    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal(response.headers.get('content-range'), 'bytes 0-10/100');
    assert.equal(await response.text(), 'audio-chunk');
    assert.equal(calls.length, 2);
  });

  it('serves catalog by fetching /assets/music/database.json from upstream', async () => {
    const env = createEnv();
    const ctx = createCtx();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const expectedCatalog = { artists: [{ name: 'Test Artist' }] };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init });

      if (url === 'https://smaiclub-alist-v3.onrender.com/api/fs/get') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { path?: string };
        assert.equal(body.path, '/assets/music/database.json');

        return new Response(
          JSON.stringify({
            code: 200,
            data: { raw_url: 'https://google.test/database.json' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url === 'https://google.test/database.json') {
        return new Response(JSON.stringify(expectedCatalog), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request('https://hall-worker.test/api/music/catalog'),
      env as any,
      ctx
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expectedCatalog);
    assert.equal(calls.length, 2);
  });
});
