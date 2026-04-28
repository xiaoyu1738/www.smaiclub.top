import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectClientFormat, parseEdgetunnelSubscription, renderSubscription } from '../functions/_shared/subscription.ts';
import type { ProxyNode, UserSubscriptionRow } from '../functions/_shared/types.ts';
import { buildSubscriptionUserinfo } from '../functions/_shared/subscription.ts';
import { isBlocked } from '../functions/_shared/db.ts';

test('detectClientFormat handles mainstream clients', () => {
  assert.equal(detectClientFormat('Clash Verge/2.0').kind, 'clash');
  assert.equal(detectClientFormat('sing-box/1.10').kind, 'sing-box');
  assert.equal(detectClientFormat('v2rayN').kind, 'raw');
});

test('parseEdgetunnelSubscription rewrites UUID and names nodes', () => {
  const nodes = parseEdgetunnelSubscription(
    'vless://old@1.2.3.4:443?security=tls&type=ws&host=proxy.smaiclub.top&sni=proxy.smaiclub.top&path=%2F#HK',
    'new-uuid',
    1,
  );

  assert.equal(nodes.length, 1);
  assert.match(nodes[0].uri, /^vless:\/\/new-uuid@1\.2\.3\.4/);
  assert.equal(nodes[0].name, '优选-Hongkong-01');
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

test('renderSubscription emits clash yaml and raw base64', () => {
  const nodes: ProxyNode[] = [
    {
      id: 'vps',
      kind: 'vps',
      name: 'VPS-Japan',
      uri: 'vless://uuid@example.com:443?type=tcp&encryption=none&security=reality&pbk=pub&fp=chrome&sni=www.softbank.jp&sid=ad&flow=xtls-rprx-vision#VPS-Japan',
    },
  ];

  assert.match(renderSubscription(nodes, { kind: 'clash', contentType: 'text/yaml' }), /reality-opts/);
  assert.match(atob(renderSubscription(nodes, { kind: 'raw', contentType: 'text/plain' })), /vless:\/\/uuid/);
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
