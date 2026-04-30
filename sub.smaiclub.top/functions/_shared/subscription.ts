import { isUnlimitedTime, isUnlimitedTraffic } from './db.ts';
import type { ClientFormat, Env, ProxyNode, UserSubscriptionRow } from './types.ts';

const CLASH_RULE_PROVIDER_BASE = 'https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release';
const SING_BOX_RULE_SET_BASE = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo';

/** Detect subscription output format from client User-Agent. */
export function detectClientFormat(userAgent: string | null): ClientFormat {
  const ua = (userAgent ?? '').toLowerCase();
  if (ua.includes('sing-box') || ua.includes('singbox')) {
    return { kind: 'sing-box', contentType: 'application/json; charset=utf-8' };
  }
  if (
    ua.includes('clash') ||
    ua.includes('mihomo') ||
    ua.includes('flclash') ||
    ua.includes('verge') ||
    ua.includes('stash')
  ) {
    return { kind: 'clash', contentType: 'text/yaml; charset=utf-8' };
  }
  return { kind: 'raw', contentType: 'text/plain; charset=utf-8' };
}

/** Build `Subscription-Userinfo` header fields for quota-aware clients. */
export function buildSubscriptionUserinfo(user: UserSubscriptionRow): string {
  return [
    'upload=0',
    `download=${Math.max(0, Math.floor(user.traffic_used_vps))}`,
    `total=${isUnlimitedTraffic(user) ? 0 : Math.max(0, Math.floor(user.traffic_total))}`,
    `expire=${isUnlimitedTime(user) ? 0 : Math.max(0, Math.floor(user.sub_expired_at / 1000))}`,
  ].join('; ');
}

/** Build the self-hosted VPS Reality node when all required env values exist. */
export function buildVpsNode(env: Env, user: UserSubscriptionRow): ProxyNode | null {
  if (!user.xui_uuid || !env.REALITY_HOST || !env.REALITY_PUBLIC_KEY || !env.REALITY_SNI) {
    return null;
  }

  const params = new URLSearchParams({
    type: 'tcp',
    encryption: 'none',
    security: 'reality',
    pbk: env.REALITY_PUBLIC_KEY,
    fp: env.REALITY_FINGERPRINT || 'chrome',
    sni: env.REALITY_SNI,
  });
  const shortId = selectRealityShortId(env);
  if (shortId) params.set('sid', shortId);
  if (env.REALITY_SPIDER_X) params.set('spx', env.REALITY_SPIDER_X);
  if (env.REALITY_FLOW) params.set('flow', env.REALITY_FLOW);

  const port = env.REALITY_PORT || '443';
  const name = env.REALITY_NODE_NAME || 'VPS-Japan';
  return {
    id: 'vps-reality',
    name,
    kind: 'vps',
    uri: `vless://${user.xui_uuid}@${env.REALITY_HOST}:${port}?${params.toString()}#${encodeURIComponent(name)}`,
  };
}

function selectRealityShortId(env: Env): string {
  const candidates = (env.REALITY_SHORT_IDS || env.REALITY_SHORT_ID || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return candidates[0] || '';
}

/** Fetch EdgeTunnel upstream subscription and optionally rewrite UUID. */
export async function fetchEdgetunnelNodes(env: Env, user: UserSubscriptionRow): Promise<ProxyNode[]> {
  if (!env.EDGETUNNEL_SUB_URL) return [];
  const maxNodes = Math.max(0, Math.min(99, Number(env.EDGETUNNEL_MAX_NODES || 99) || 99));
  if (!maxNodes) return [];

  try {
    const response = await fetch(env.EDGETUNNEL_SUB_URL, {
      headers: { 'User-Agent': 'SmaiClub-Sub/1.0' },
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return [];
    const text = await response.text();
    const rewriteUuid = env.EDGETUNNEL_REWRITE_UUID === 'true';
    return parseEdgetunnelSubscription(text, rewriteUuid ? user.xui_uuid : null, maxNodes);
  } catch (error) {
    console.warn('Failed to fetch edgetunnel subscription', error);
    return [];
  }
}

/** Parse EdgeTunnel vless links, preserving upstream order and names. */
export function parseEdgetunnelSubscription(
  input: string,
  userUuid: string | null | undefined,
  maxNodes = 99,
): ProxyNode[] {
  const decoded = maybeDecodeBase64(input);
  const links = decoded
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('vless://'));

  const nodes: ProxyNode[] = [];
  const nameCounts = new Map<string, number>();
  const totalLimit = normalizeNonNegativeInt(maxNodes, 99, 99);

  for (const link of links) {
    if (nodes.length >= totalLimit) break;
    const prepared = prepareEdgeNode(link, userUuid);
    if (!prepared) continue;
    const currentCount = (nameCounts.get(prepared.name) || 0) + 1;
    nameCounts.set(prepared.name, currentCount);
    nodes.push(finalizeEdgeNode(prepared, nodes.length + 1, currentCount));
  }

  return nodes;
}

/** Decode base64 payloads used by subscription endpoints when needed. */
function maybeDecodeBase64(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('vless://')) return trimmed;
  try {
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    return atob(normalized);
  } catch {
    return trimmed;
  }
}

interface PreparedEdgeNode {
  url: URL;
  name: string;
}

/** Parse one upstream vless link and apply UUID rewrite when configured. */
function prepareEdgeNode(
  link: string,
  userUuid: string | null | undefined,
): PreparedEdgeNode | null {
  try {
    const url = new URL(link);
    if (userUuid) url.username = userUuid;
    const originalName = decodeURIComponent(url.hash.replace(/^#/, ''));
    return { url, name: originalName || 'EdgeTunnel' };
  } catch {
    return null;
  }
}

/** Convert parsed EdgeTunnel data into internal node shape with stable de-duplicated names. */
function finalizeEdgeNode(prepared: PreparedEdgeNode, ordinal: number, duplicateCount: number): ProxyNode {
  const name = duplicateCount > 1 ? `${prepared.name}-${String(duplicateCount).padStart(2, '0')}` : prepared.name;
  prepared.url.hash = encodeURIComponent(name);
  return {
    id: `edge-${ordinal}`,
    kind: 'edge',
    name,
    uri: prepared.url.toString(),
  };
}

/** Clamp a numeric value to a non-negative integer range. */
function normalizeNonNegativeInt(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.min(max, Math.floor(value));
}

/** Render final subscription payload in raw/clash/sing-box format. */
export function renderSubscription(nodes: ProxyNode[], format: ClientFormat): string {
  if (format.kind === 'sing-box') return renderSingBox(nodes);
  if (format.kind === 'clash') return renderClash(nodes);
  return btoaUtf8(nodes.map(node => node.uri).join('\n'));
}

function renderClash(nodes: ProxyNode[]): string {
  const proxyNames = nodes.map(node => node.name);
  return [
    'mixed-port: 7890',
    'allow-lan: false',
    'mode: rule',
    'log-level: info',
    'proxies:',
    ...nodes.map(node => renderClashProxy(node)),
    'proxy-groups:',
    '  - name: SmaiClub',
    '    type: select',
    '    proxies:',
    ...proxyNames.map(name => `      - ${yamlString(name)}`),
    '      - DIRECT',
    '      - REJECT',
    'rule-providers:',
    ...renderClashRuleProvider('reject', 'classical', 'reject.txt'),
    ...renderClashRuleProvider('private', 'classical', 'private.txt'),
    ...renderClashRuleProvider('direct', 'classical', 'direct.txt'),
    ...renderClashRuleProvider('proxy', 'classical', 'proxy.txt'),
    ...renderClashRuleProvider('gfw', 'classical', 'gfw.txt'),
    ...renderClashRuleProvider('tld-not-cn', 'classical', 'tld-not-cn.txt'),
    ...renderClashRuleProvider('cncidr', 'classical', 'cncidr.txt'),
    ...renderClashRuleProvider('lancidr', 'classical', 'lancidr.txt'),
    'rules:',
    '  - RULE-SET,reject,REJECT',
    '  - RULE-SET,private,DIRECT',
    '  - RULE-SET,lancidr,DIRECT,no-resolve',
    '  - RULE-SET,direct,DIRECT',
    '  - RULE-SET,cncidr,DIRECT,no-resolve',
    '  - GEOIP,CN,DIRECT',
    '  - RULE-SET,proxy,SmaiClub',
    '  - RULE-SET,gfw,SmaiClub',
    '  - RULE-SET,tld-not-cn,SmaiClub',
    '  - MATCH,SmaiClub',
    '',
  ].join('\n');
}

function renderClashRuleProvider(name: string, behavior: string, fileName: string): string[] {
  return [
    `  ${name}:`,
    '    type: http',
    `    behavior: ${behavior}`,
    `    url: ${yamlString(`${CLASH_RULE_PROVIDER_BASE}/${fileName}`)}`,
    `    path: ${yamlString(`./ruleset/${fileName}`)}`,
    '    interval: 86400',
  ];
}

function renderClashProxy(node: ProxyNode): string {
  const parsed = parseVlessUrl(node.uri);
  const lines = [
    `  - name: ${yamlString(node.name)}`,
    '    type: vless',
    `    server: ${yamlString(parsed.host)}`,
    `    port: ${parsed.port}`,
    `    uuid: ${yamlString(parsed.uuid)}`,
    '    udp: true',
    `    network: ${yamlString(parsed.network)}`,
    `    tls: ${parsed.security === 'tls' || parsed.security === 'reality'}`,
  ];
  if (parsed.security === 'reality') {
    lines.push('    reality-opts:');
    lines.push(`      public-key: ${yamlString(parsed.params.get('pbk') || '')}`);
    if (parsed.params.get('sid')) lines.push(`      short-id: ${yamlString(parsed.params.get('sid') || '')}`);
    if (parsed.params.get('flow')) lines.push(`    flow: ${yamlString(parsed.params.get('flow') || '')}`);
  }
  if (parsed.network === 'ws') {
    lines.push('    ws-opts:');
    lines.push(`      path: ${yamlString(parsed.params.get('path') || '/')}`);
    lines.push('      headers:');
    lines.push(`        Host: ${yamlString(parsed.params.get('host') || parsed.host)}`);
  }
  if (parsed.params.get('sni')) lines.push(`    servername: ${yamlString(parsed.params.get('sni') || '')}`);
  if (parsed.params.get('fp')) lines.push(`    client-fingerprint: ${yamlString(parsed.params.get('fp') || '')}`);
  return lines.join('\n');
}

function renderSingBox(nodes: ProxyNode[]): string {
  const proxyNames = nodes.map(node => node.name);
  return JSON.stringify({
    outbounds: [
      {
        type: 'selector',
        tag: 'SmaiClub',
        outbounds: [...proxyNames, 'DIRECT'],
        default: proxyNames[0] || 'DIRECT',
      },
      { type: 'direct', tag: 'DIRECT' },
      { type: 'block', tag: 'REJECT' },
      ...nodes.map(node => {
      const parsed = parseVlessUrl(node.uri);
      const outbound: Record<string, unknown> = {
        type: 'vless',
        tag: node.name,
        server: parsed.host,
        server_port: parsed.port,
        uuid: parsed.uuid,
        flow: parsed.params.get('flow') || undefined,
        tls: parsed.security === 'tls' || parsed.security === 'reality'
          ? {
              enabled: true,
              server_name: parsed.params.get('sni') || parsed.host,
              utls: { enabled: true, fingerprint: parsed.params.get('fp') || 'chrome' },
              reality: parsed.security === 'reality'
                ? {
                    enabled: true,
                    public_key: parsed.params.get('pbk') || '',
                    short_id: parsed.params.get('sid') || '',
                  }
                : undefined,
            }
          : undefined,
      };
      if (parsed.network === 'ws') {
        outbound.transport = {
          type: 'ws',
          path: parsed.params.get('path') || '/',
          headers: { Host: parsed.params.get('host') || parsed.host },
        };
      }
      return outbound;
    }),
    ],
    route: {
      auto_detect_interface: true,
      rule_set: [
        renderSingBoxRuleSet('geosite-category-ads-all', 'geosite/category-ads-all.srs'),
        renderSingBoxRuleSet('geoip-private', 'geoip/private.srs'),
        renderSingBoxRuleSet('geosite-cn', 'geosite/cn.srs'),
        renderSingBoxRuleSet('geoip-cn', 'geoip/cn.srs'),
        renderSingBoxRuleSet('geosite-geolocation-!cn', 'geosite/geolocation-!cn.srs'),
      ],
      rules: [
        { rule_set: ['geosite-category-ads-all'], outbound: 'REJECT' },
        { rule_set: ['geoip-private', 'geosite-cn', 'geoip-cn'], outbound: 'DIRECT' },
        { rule_set: ['geosite-geolocation-!cn'], outbound: 'SmaiClub' },
      ],
      final: 'SmaiClub',
    },
  }, null, 2);
}

function renderSingBoxRuleSet(tag: string, path: string): Record<string, string> {
  return {
    type: 'remote',
    tag,
    format: 'binary',
    url: `${SING_BOX_RULE_SET_BASE}/${path}`,
    download_detour: 'SmaiClub',
  };
}

function parseVlessUrl(uri: string) {
  const url = new URL(uri);
  return {
    uuid: url.username,
    host: url.hostname,
    port: Number(url.port || 443),
    params: url.searchParams,
    network: url.searchParams.get('type') || 'tcp',
    security: url.searchParams.get('security') || 'none',
  };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function btoaUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
