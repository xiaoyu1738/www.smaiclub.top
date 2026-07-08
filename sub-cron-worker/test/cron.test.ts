import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseXuiClientStats, setXuiClientEnabled, type Env } from '../src/xui.ts';

test('parseXuiClientStats extracts client traffic from 3x-ui list payload', () => {
  const stats = parseXuiClientStats({
    obj: [
      {
        clientStats: [
          { email: 'label-a', uuid: 'uuid-a', up: 1024, down: 2048 },
          { id: 'uuid-b', upload: 10, download: 20 },
        ],
      },
    ],
  });

  assert.deepEqual(stats, [
    { uuid: 'uuid-a', used: 3072 },
    { uuid: 'uuid-b', used: 30 },
  ]);
});

test('setXuiClientEnabled updates reality and hy2 inbounds', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body || '') });
    return new Response(JSON.stringify({ success: true, msg: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const ok = await setXuiClientEnabled({
      XUI_BASE_URL: 'https://xui.example',
      XUI_COOKIE: 'sid=ok',
      XUI_INBOUND_ID: '1',
      XUI_HY2_INBOUND_ID: '2',
    } as Env, 'client-uuid', false);

    assert.equal(ok, true);
    const updateCalls = calls.filter(call => call.url.endsWith('/panel/api/inbounds/updateClient/client-uuid'));
    assert.equal(updateCalls.length, 2);

    const payloads = updateCalls.map(call => JSON.parse(call.body) as { id: number; settings: string });
    assert.deepEqual(payloads.map(payload => payload.id), [1, 2]);

    const clients = payloads.map(payload => {
      const settings = JSON.parse(payload.settings) as { clients: Array<Record<string, unknown>> };
      return settings.clients[0];
    });
    assert.deepEqual(clients[0], { id: 'client-uuid', enable: false });
    assert.deepEqual(clients[1], { id: 'client-uuid', enable: false, auth: 'client-uuid' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('setXuiClientEnabled logs in with csrf before cron mutations', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Headers; body: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, headers, body: String(init?.body || '') });

    if (url === 'https://xui.example/') {
      return new Response('<!doctype html><html><head><meta name="csrf-token" content="login-token"></head></html>', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'set-cookie': 'csrf=seed; Path=/; HttpOnly',
        },
      });
    }

    if (url === 'https://xui.example/login') {
      return new Response(JSON.stringify({ success: true, msg: 'ok' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'sid=ok; Path=/; HttpOnly',
        },
      });
    }

    return new Response(JSON.stringify({ success: true, msg: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const ok = await setXuiClientEnabled({
      XUI_BASE_URL: 'https://xui.example',
      XUI_USERNAME: 'admin',
      XUI_PASSWORD: 'secret',
      XUI_INBOUND_ID: '1',
      XUI_HY2_INBOUND_ID: '1',
    } as Env, 'client-uuid', false);

    assert.equal(ok, true);

    const loginCall = calls.find(call => call.url === 'https://xui.example/login');
    assert.ok(loginCall);
    assert.equal(loginCall.headers.get('X-CSRF-Token'), 'login-token');
    assert.equal(loginCall.headers.get('Cookie'), 'csrf=seed');

    const updateCall = calls.find(call => call.url.endsWith('/panel/api/inbounds/updateClient/client-uuid'));
    assert.ok(updateCall);
    assert.equal(updateCall.headers.get('X-CSRF-Token'), 'login-token');
    assert.equal(updateCall.headers.get('Cookie'), 'csrf=seed; sid=ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
