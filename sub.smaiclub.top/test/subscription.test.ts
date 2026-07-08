import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHy2Node, detectClientFormat, parseEdgetunnelSubscription, renderSubscription } from '../functions/_shared/subscription.ts';
import type { Env, ProxyNode, UserSubscriptionRow } from '../functions/_shared/types.ts';
import { buildSubscriptionUserinfo } from '../functions/_shared/subscription.ts';
import { isBlocked } from '../functions/_shared/db.ts';
import { setXuiClientEnabled } from '../functions/_shared/xui.ts';

test('detectClientFormat handles mainstream clients', () => {
  assert.equal(detectClientFormat('Clash Verge/2.0').kind, 'clash');
  assert.equal(detectClientFormat('sing-box/1.10').kind, 'sing-box');
  assert.equal(detectClientFormat('v2rayN').kind, 'raw');
});

test('parseEdgetunnelSubscription rewrites UUID and preserves upstream node name', () => {
  const nodes = parseEdgetunnelSubscription(
    'vless://old@1.2.3.4:443?security=tls&type=ws&host=proxy.smaiclub.top&sni=proxy.smaiclub.top&path=%2F#HK',
    'new-uuid',
    1,
  );

  assert.equal(nodes.length, 1);
  assert.match(nodes[0].uri, /^vless:\/\/new-uuid@1\.2\.3\.4/);
  assert.equal(nodes[0].name, 'HK');
});

test('parseEdgetunnelSubscription preserves upstream UUID by default', () => {
  const nodes = parseEdgetunnelSubscription(
    'vless://edge-uuid@1.2.3.4:443?security=tls&type=ws&host=proxy.smaiclub.top&sni=proxy.smaiclub.top&path=%2F#HK',
    null,
    1,
  );

  assert.equal(nodes.length, 1);
  assert.match(nodes[0].uri, /^vless:\/\/edge-uuid@1\.2\.3\.4/);
});

test('parseEdgetunnelSubscription keeps all upstream nodes in order', () => {
  const input = [
    'vless://uuid@1.1.1.1:443?security=tls&type=ws#edge-a',
    'vless://uuid@1.1.1.2:443?security=tls&type=ws#edge-b',
    'vless://uuid@1.1.1.3:443?security=tls&type=ws#edge-c',
  ].join('\n');

  const nodes = parseEdgetunnelSubscription(input, null, 99);

  assert.deepEqual(nodes.map(node => node.name), ['edge-a', 'edge-b', 'edge-c']);
});


test('parseEdgetunnelSubscription de-duplicates duplicate upstream names', () => {
  const input = [
    'vless://uuid@1.1.1.1:443?security=tls&type=ws#proxy US官方优选191ms',
    'vless://uuid@1.1.1.2:443?security=tls&type=ws#proxy US官方优选191ms',
  ].join('\n');

  const nodes = parseEdgetunnelSubscription(input, null, 99);

  assert.deepEqual(nodes.map(node => node.name), ['proxy US官方优选191ms', 'proxy US官方优选191ms-02']);
});

test('renderSubscription emits clash yaml and raw base64', () => {
  const nodes: ProxyNode[] = [
    {
      id: 'vps',
      kind: 'vps',
      name: 'VPS-Japan',
      uri: 'vless://uuid@example.com:443?type=tcp&encryption=none&security=reality&pbk=pub&fp=chrome&sni=www.softbank.jp&sid=ad&flow=xtls-rprx-vision#VPS-Japan',
    },
    {
      id: 'vps-hy2',
      kind: 'vps',
      name: 'VPS-Japan-HY2',
      uri: 'hysteria2://uuid@example.com:443?security=tls&alpn=h3#VPS-Japan-HY2',
    },
  ];

  const clash = renderSubscription(nodes, { kind: 'clash', contentType: 'text/yaml' });
  assert.match(clash, /reality-opts/);
  assert.match(clash, /type: hysteria2/);
  assert.match(clash, /password: "uuid"/);
  assert.match(clash, /rule-providers:/);
  assert.match(clash, /name: SMAICLUB/);
  assert.match(clash, /name: SMAICLUB Auto/);
  assert.match(clash, /RULE-SET,OpenAI_No_Resolve,OpenAI/);
  assert.match(clash, /MATCH,Final/);
  assert.match(atob(renderSubscription(nodes, { kind: 'raw', contentType: 'text/plain' })), /vless:\/\/uuid/);
  assert.match(atob(renderSubscription(nodes, { kind: 'raw', contentType: 'text/plain' })), /hysteria2:\/\/uuid/);
});

test('renderSubscription emits sing-box route rules', () => {
  const rendered = renderSubscription([
    {
      id: 'vps',
      kind: 'vps',
      name: 'VPS-Japan',
      uri: 'vless://uuid@example.com:443?type=tcp&encryption=none&security=reality&pbk=pub&fp=chrome&sni=www.softbank.jp&sid=ad&flow=xtls-rprx-vision#VPS-Japan',
    },
    {
      id: 'vps-hy2',
      kind: 'vps',
      name: 'VPS-Japan-HY2',
      uri: 'hysteria2://uuid@example.com:443?security=tls&alpn=h3#VPS-Japan-HY2',
    },
  ], { kind: 'sing-box', contentType: 'application/json' });
  const config = JSON.parse(rendered) as {
    outbounds: Array<{ type: string; tag: string }>;
    route: { final: string; rule_set: Array<{ tag: string }> };
  };

  assert.equal(config.outbounds[0].type, 'selector');
  assert.equal(config.outbounds[0].tag, 'SMAICLUB');
  assert.ok(config.outbounds.some(outbound => outbound.type === 'hysteria2' && outbound.tag === 'VPS-Japan-HY2'));
  assert.equal(config.route.final, 'SMAICLUB');
  assert.ok(config.route.rule_set.some(ruleSet => ruleSet.tag === 'geosite-cn'));
});

test('buildHy2Node uses xui uuid and defaults to reality host', () => {
  const node = buildHy2Node({
    REALITY_HOST: '45.202.255.218',
  } as Env, {
    username: 'fish',
    xui_uuid: 'client-uuid',
    sub_status: 'active',
    sub_expired_at: 0,
    traffic_total: -1,
    traffic_used_vps: 0,
    traffic_updated_at: 0,
  });

  assert.ok(node);
  assert.equal(node.name, 'VPS-Japan-HY2');
  assert.match(node.uri, /^hysteria2:\/\/client-uuid@45\.202\.255\.218:443\?security=tls&alpn=h3#VPS-Japan-HY2$/);
});

test('isBlocked enforces expiration and quota', () => {
  const base: UserSubscriptionRow = {
    username: 'fish',
    sub_status: 'active',
    sub_expired_at: 2_000,
    traffic_total: 100,
    traffic_used_vps: 50,
    traffic_updated_at: 0,
  };

  assert.equal(isBlocked(base, 1_000), null);
  assert.equal(isBlocked({ ...base, traffic_used_vps: 100 }, 1_000), 'limited');
  assert.equal(isBlocked(base, 3_000), 'expired');
  assert.equal(isBlocked({ ...base, role: 'admin', sub_expired_at: 0, traffic_total: -1, traffic_used_vps: 999 }, 3_000), null);
  assert.equal(isBlocked({ ...base, sub_expired_at: 10_000, traffic_total: -1, traffic_used_vps: 999 }, 3_000), null);
});

test('buildSubscriptionUserinfo exposes vps quota fields', () => {
  const header = buildSubscriptionUserinfo({
    username: 'fish',
    sub_status: 'active',
    sub_expired_at: 2_000_000,
    traffic_total: 100,
    traffic_used_vps: 40,
    traffic_updated_at: 0,
  });

  assert.equal(header, 'upload=0; download=40; total=100; expire=2000');
});

test('buildSubscriptionUserinfo exposes unlimited quota fields', () => {
  const header = buildSubscriptionUserinfo({
    username: 'fish',
    sub_status: 'active',
    sub_expired_at: 0,
    traffic_total: -1,
    traffic_used_vps: 40,
    traffic_updated_at: 0,
  });

  assert.equal(header, 'upload=0; download=40; total=0; expire=0');
});

test('setXuiClientEnabled creates the same user on reality and hy2 inbounds', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body || '');
    calls.push({ url: String(input), body });
    return new Response(JSON.stringify({ success: true, msg: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await setXuiClientEnabled({
      XUI_BASE_URL: 'https://xui.example',
      XUI_COOKIE: 'sid=ok',
      XUI_INBOUND_ID: '1',
      XUI_HY2_INBOUND_ID: '2',
    } as Env, 'client-uuid', true, {
      email: 'fish',
      createOnly: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.targets?.length, 2);

    const addCalls = calls.filter(call => call.url.endsWith('/panel/api/clients/add'));
    assert.equal(addCalls.length, 2);

    const payloads = addCalls.map(call => JSON.parse(call.body) as { client: Record<string, string>; inboundIds: number[] });
    assert.deepEqual(payloads.map(payload => payload.inboundIds), [[1], [2]]);

    const clients = payloads.map(payload => payload.client);

    assert.equal(clients[0].id, 'client-uuid');
    assert.equal(clients[0].flow, 'xtls-rprx-vision');
    assert.equal(clients[1].id, 'client-uuid');
    assert.equal(clients[1].auth, 'client-uuid');
    assert.equal(clients[0].subId, clients[1].subId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('setXuiClientEnabled logs in with csrf before mutating 3x-ui clients', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; headers: Headers; body: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body || '');
    calls.push({ url, method: init?.method || 'GET', headers, body });

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
    const result = await setXuiClientEnabled({
      XUI_BASE_URL: 'https://xui.example',
      XUI_USERNAME: 'admin',
      XUI_PASSWORD: 'secret',
      XUI_INBOUND_ID: '1',
      XUI_HY2_INBOUND_ID: '1',
    } as Env, 'client-uuid', false, { email: 'fish' });

    assert.equal(result.ok, true);

    const loginCall = calls.find(call => call.url === 'https://xui.example/login');
    assert.ok(loginCall);
    assert.equal(loginCall.headers.get('X-CSRF-Token'), 'login-token');
    assert.equal(loginCall.headers.get('X-Requested-With'), 'XMLHttpRequest');
    assert.equal(loginCall.headers.get('Cookie'), 'csrf=seed');

    const updateCall = calls.find(call => call.url === 'https://xui.example/panel/api/clients/bulkDisable');
    assert.ok(updateCall);
    assert.equal(updateCall.headers.get('X-CSRF-Token'), 'login-token');
    assert.equal(updateCall.headers.get('X-Requested-With'), 'XMLHttpRequest');
    assert.equal(updateCall.headers.get('Cookie'), 'csrf=seed; sid=ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('setXuiClientEnabled summarizes html responses without leaking html bodies', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('<!doctype html><html><head><title>Login Required</title></head><body><main>session expired</main></body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })) as typeof fetch;

  try {
    const result = await setXuiClientEnabled({
      XUI_BASE_URL: 'https://xui.example',
      XUI_COOKIE: 'sid=expired',
      XUI_INBOUND_ID: '1',
      XUI_HY2_INBOUND_ID: '2',
    } as Env, 'client-uuid', false, { email: 'fish' });

    assert.equal(result.ok, false);
    assert.match(result.message || '', /returned HTML/);
    assert.equal(result.body, 'html_response:Login Required');
    assert.ok(!JSON.stringify(result).includes('<main>'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
