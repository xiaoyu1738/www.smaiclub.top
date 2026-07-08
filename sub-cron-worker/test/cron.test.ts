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

test('setXuiClientEnabled toggles clients through 3x-ui bulk enable API', async () => {
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
    } as Env, 'client-uuid', false, 'fish');

    assert.equal(ok, true);
    const updateCalls = calls.filter(call => call.url.endsWith('/panel/api/clients/bulkDisable'));
    assert.equal(updateCalls.length, 1);

    const payload = JSON.parse(updateCalls[0].body) as { emails: string[] };
    assert.deepEqual(payload.emails, ['fish']);
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
    } as Env, 'client-uuid', false, 'fish');

    assert.equal(ok, true);

    const loginCall = calls.find(call => call.url === 'https://xui.example/login');
    assert.ok(loginCall);
    assert.equal(loginCall.headers.get('X-CSRF-Token'), 'login-token');
    assert.equal(loginCall.headers.get('Cookie'), 'csrf=seed');

    const updateCall = calls.find(call => call.url === 'https://xui.example/panel/api/clients/bulkDisable');
    assert.ok(updateCall);
    assert.equal(updateCall.headers.get('X-CSRF-Token'), 'login-token');
    assert.equal(updateCall.headers.get('Cookie'), 'csrf=seed; sid=ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
