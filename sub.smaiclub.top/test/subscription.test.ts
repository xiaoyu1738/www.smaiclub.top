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

test('parseEdgetunnelSubscription groups by geo region and limits each region', () => {
  const input = [
    'vless://uuid@1.1.1.1:443?security=tls&type=ws#edge-a',
    'vless://uuid@1.1.1.2:443?security=tls&type=ws#edge-b',
    'vless://uuid@1.1.1.3:443?security=tls&type=ws#edge-c',
    'vless://uuid@1.1.1.4:443?security=tls&type=ws#edge-d',
    'vless://uuid@8.8.8.8:443?security=tls&type=ws#edge-e',
    'vless://uuid@8.8.4.4:443?security=tls&type=ws#edge-f',
  ].join('\n');
  const geoByHost = new Map([
    ['1.1.1.1', 'AU'],
    ['1.1.1.2', 'AU'],
    ['1.1.1.3', 'AU'],
    ['1.1.1.4', 'AU'],
    ['8.8.8.8', 'US'],
    ['8.8.4.4', 'US'],
  ]);

  const nodes = parseEdgetunnelSubscription(input, null, 99, 3, geoByHost);

  assert.deepEqual(nodes.map(node => node.name), [
    '优选-Australia-01',
    '优选-Australia-02',
    '优选-Australia-03',
    '优选-UnitedStates-01',
    '优选-UnitedStates-02',
  ]);
});

test('parseEdgetunnelSubscription does not trust unknown upstream two letter labels', () => {
  const nodes = parseEdgetunnelSubscription(
    'vless://uuid@1.2.3.4:443?security=tls&type=ws#FL',
    null,
    99,
    3,
  );

  assert.equal(nodes[0].name, '优选-Global-01');
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

  const clash = renderSubscription(nodes, { kind: 'clash', contentType: 'text/yaml' });
  assert.match(clash, /reality-opts/);
  assert.match(clash, /rule-providers:/);
  assert.match(clash, /RULE-SET,cncidr,DIRECT/);
  assert.match(clash, /MATCH,SmaiClub/);
  assert.match(atob(renderSubscription(nodes, { kind: 'raw', contentType: 'text/plain' })), /vless:\/\/uuid/);
});

test('renderSubscription emits sing-box route rules', () => {
  const rendered = renderSubscription([
    {
      id: 'vps',
      kind: 'vps',
      name: 'VPS-Japan',
      uri: 'vless://uuid@example.com:443?type=tcp&encryption=none&security=reality&pbk=pub&fp=chrome&sni=www.softbank.jp&sid=ad&flow=xtls-rprx-vision#VPS-Japan',
    },
  ], { kind: 'sing-box', contentType: 'application/json' });
  const config = JSON.parse(rendered) as {
    outbounds: Array<{ type: string; tag: string }>;
    route: { final: string; rule_set: Array<{ tag: string }> };
  };

  assert.equal(config.outbounds[0].type, 'selector');
  assert.equal(config.outbounds[0].tag, 'SmaiClub');
  assert.equal(config.route.final, 'SmaiClub');
  assert.ok(config.route.rule_set.some(ruleSet => ruleSet.tag === 'geosite-cn'));
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
