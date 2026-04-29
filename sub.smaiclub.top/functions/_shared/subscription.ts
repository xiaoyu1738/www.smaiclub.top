import { isUnlimitedTime, isUnlimitedTraffic } from './db.ts';
import { extractRegionFromName, labelRegion } from './geo.ts';
import type { ClientFormat, Env, ProxyNode, UserSubscriptionRow } from './types.ts';

const DEFAULT_EDGE_MAX_PER_REGION = 3;
const CLASH_RULE_PROVIDER_BASE = 'https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release';
const SING_BOX_RULE_SET_BASE = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo';

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

export function buildSubscriptionUserinfo(user: UserSubscriptionRow): string {
  return [
    'upload=0',
    `download=${Math.max(0, Math.floor(user.traffic_used_vps))}`,
    `total=${isUnlimitedTraffic(user) ? 0 : Math.max(0, Math.floor(user.traffic_total))}`,
    `expire=${isUnlimitedTime(user) ? 0 : Math.max(0, Math.floor(user.sub_expired_at / 1000))}`,
  ].join('; ');
}

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

export async function fetchEdgetunnelNodes(env: Env, user: UserSubscriptionRow): Promise<ProxyNode[]> {
  if (!env.EDGETUNNEL_SUB_URL) return [];
  const maxNodes = Math.max(0, Math.min(99, Number(env.EDGETUNNEL_MAX_NODES || 99) || 99));
  const maxPerRegion = normalizePositiveInt(env.EDGETUNNEL_MAX_PER_REGION, DEFAULT_EDGE_MAX_PER_REGION, 99);
  if (!maxNodes) return [];

  try {
    const response = await fetch(env.EDGETUNNEL_SUB_URL, {
      headers: { 'User-Agent': 'SmaiClub-Sub/1.0' },
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return [];
    const text = await response.text();
    const rewriteUuid = env.EDGETUNNEL_REWRITE_UUID === 'true';
    const geoByHost = await fetchEdgeGeoRegions(env, collectEdgeHosts(text));
    return parseEdgetunnelSubscription(text, rewriteUuid ? user.xui_uuid : null, maxNodes, maxPerRegion, geoByHost);
  } catch (error) {
    console.warn('Failed to fetch edgetunnel subscription', error);
    return [];
  }
}

export function parseEdgetunnelSubscription(
  input: string,
  userUuid: string | null | undefined,
  maxNodes = 99,
  maxPerRegion = DEFAULT_EDGE_MAX_PER_REGION,
  geoByHost?: Map<string, string> | Record<string, string>,
): ProxyNode[] {
  const decoded = maybeDecodeBase64(input);
  const links = decoded
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('vless://'));

  const nodes: ProxyNode[] = [];
  const regionCounts = new Map<string, number>();
  const totalLimit = normalizeNonNegativeInt(maxNodes, 99, 99);
  const regionLimit = normalizePositiveInt(String(maxPerRegion), DEFAULT_EDGE_MAX_PER_REGION, 99);

  for (const link of links) {
    if (nodes.length >= totalLimit) break;
    const prepared = prepareEdgeNode(link, userUuid, geoByHost);
    if (!prepared) continue;

    const currentCount = regionCounts.get(prepared.regionKey) ?? 0;
    if (currentCount >= regionLimit) continue;

    const regionOrdinal = currentCount + 1;
    regionCounts.set(prepared.regionKey, regionOrdinal);
    nodes.push(finalizeEdgeNode(prepared, nodes.length + 1, regionOrdinal));
  }

  return nodes;
}

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
  regionLabel: string;
  regionKey: string;
}

function prepareEdgeNode(
  link: string,
  userUuid: string | null | undefined,
  geoByHost?: Map<string, string> | Record<string, string>,
): PreparedEdgeNode | null {
  try {
    const url = new URL(link);
    if (userUuid) url.username = userUuid;
    const originalName = decodeURIComponent(url.hash.replace(/^#/, ''));
    const geoRegion = getGeoRegion(geoByHost, url.hostname);
    const fallbackRegion = extractRegionFromName(originalName || url.hostname);
    const regionLabel = labelRegion(geoRegion || fallbackRegion);
    return { url, regionLabel, regionKey: regionLabel.toLowerCase() };
  } catch {
    return null;
  }
}

function finalizeEdgeNode(prepared: PreparedEdgeNode, ordinal: number, regionOrdinal: number): ProxyNode {
  const name = `优选-${prepared.regionLabel}-${String(regionOrdinal).padStart(2, '0')}`;
  prepared.url.hash = encodeURIComponent(name);
  return {
    id: `edge-${ordinal}`,
    kind: 'edge',
    name,
    uri: prepared.url.toString(),
  };
}

function collectEdgeHosts(input: string): string[] {
  const decoded = maybeDecodeBase64(input);
  const hosts = new Set<string>();
  for (const line of decoded.split(/\r?\n/)) {
    const link = line.trim();
    if (!link.startsWith('vless://')) continue;
    try {
      const host = new URL(link).hostname;
      if (isPublicIp(host)) hosts.add(host);
    } catch {
      // Ignore malformed upstream links; parseEdgetunnelSubscription will skip them too.
    }
  }
  return [...hosts];
}

async function fetchEdgeGeoRegions(env: Env, hosts: string[]): Promise<Map<string, string>> {
  const endpoint = (env.EDGETUNNEL_GEO_API_URL || env.GEO_API_BASE_URL || '').trim();
  if (!endpoint || hosts.length === 0) return new Map();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SmaiClub-Sub/1.0',
      },
      body: JSON.stringify(hosts.slice(0, 100)),
      cf: { cacheTtl: 3600, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return new Map();

    const payload = await response.json();
    return parseGeoBatchResponse(payload);
  } catch (error) {
    console.warn('Failed to fetch edgetunnel geo regions', error);
    return new Map();
  }
}

function parseGeoBatchResponse(payload: unknown): Map<string, string> {
  const rows = Array.isArray(payload) ? payload : [];
  const regions = new Map<string, string>();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const ip = stringField(record, 'query') || stringField(record, 'ip') || stringField(record, 'ip_address');
    if (!ip) continue;

    const success = record.success;
    const status = stringField(record, 'status');
    if (success === false || status === 'fail') continue;

    const countryCode = stringField(record, 'countryCode') || stringField(record, 'country_code');
    const country = stringField(record, 'country') || stringField(record, 'country_name');
    const city = stringField(record, 'city') || stringField(record, 'cityName');
    const region = labelRegion(countryCode || extractRegionFromName(`${city ?? ''} ${country ?? ''}`));
    if (region !== 'Global') regions.set(ip, region);
  }

  return regions;
}

function getGeoRegion(geoByHost: Map<string, string> | Record<string, string> | undefined, host: string): string {
  if (!geoByHost) return '';
  if (geoByHost instanceof Map) return geoByHost.get(host) || '';
  return geoByHost[host] || '';
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function normalizeNonNegativeInt(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.min(max, Math.floor(value));
}

function isPublicIp(host: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.some(part => part < 0 || part > 255)) return false;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    return true;
  }
  return /^[a-f0-9:]+$/i.test(host) && host.includes(':') && !host.startsWith('fc') && !host.startsWith('fd') && host !== '::1';
}

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
