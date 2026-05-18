import { isUnlimitedTime, isUnlimitedTraffic } from './db.ts';
import type { ClientFormat, Env, ProxyNode, UserSubscriptionRow } from './types.ts';

const CLASH_CONNECTIVITY_TEST_URL = 'http://connectivitycheck.gstatic.com/generate_204';
const CLASH_GROUP = 'SMAICLUB';
const CLASH_AUTO_GROUP = 'SMAICLUB Auto';
const CLASH_PROVIDER_BASE = 'https://fastly.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash';
const SING_BOX_RULE_SET_BASE = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo';

const CLASH_RULE_PROVIDERS = [
  ['Apple_Classical_No_Resolve', 'Apple/Apple_Classical_No_Resolve.yaml', 'classical'],
  ['BiliBili_No_Resolve', 'BiliBili/BiliBili_No_Resolve.yaml', 'classical'],
  ['Netflix_No_Resolve', 'Netflix/Netflix_No_Resolve.yaml', 'classical'],
  ['Disney_No_Resolve', 'Disney/Disney_No_Resolve.yaml', 'classical'],
  ['YouTube_No_Resolve', 'YouTube/YouTube_No_Resolve.yaml', 'classical'],
  ['TikTok_No_Resolve', 'TikTok/TikTok_No_Resolve.yaml', 'classical'],
  ['GlobalMedia_Classical_No_Resolve', 'GlobalMedia/GlobalMedia_Classical_No_Resolve.yaml', 'classical'],
  ['OpenAI_No_Resolve', 'OpenAI/OpenAI_No_Resolve.yaml', 'classical'],
  ['Google_No_Resolve', 'Google/Google_No_Resolve.yaml', 'classical'],
  ['Microsoft_No_Resolve', 'Microsoft/Microsoft_No_Resolve.yaml', 'classical'],
  ['PayPal_No_Resolve', 'PayPal/PayPal_No_Resolve.yaml', 'classical'],
  ['Telegram_No_Resolve', 'Telegram/Telegram_No_Resolve.yaml', 'classical'],
  ['Steam_No_Resolve', 'Steam/Steam_No_Resolve.yaml', 'classical'],
  ['Lan_No_Resolve', 'Lan/Lan_No_Resolve.yaml', 'classical'],
  ['ChinaMax_Classical_No_IPv6_No_Resolve', 'ChinaMax/ChinaMax_Classical_No_IPv6_No_Resolve.yaml', 'classical'],
] as const;

interface ClashPolicyGroup {
  name: string;
  direct?: boolean;
  directFirst?: boolean;
  preferredRegions?: readonly string[];
}

const CLASH_POLICY_GROUPS: readonly ClashPolicyGroup[] = [
  { name: 'Apple', direct: true },
  { name: 'BiliBili', direct: true, preferredRegions: ['Hong Kong', 'Taiwan'] },
  { name: 'Netflix' },
  { name: 'Disney' },
  { name: 'YouTube' },
  { name: 'TikTok' },
  { name: 'GlobalMedia' },
  { name: 'OpenAI' },
  { name: 'Google' },
  { name: 'Microsoft', direct: true },
  { name: 'PayPal', direct: true },
  { name: 'Telegram' },
  { name: 'Steam', direct: true },
  { name: 'Lan', directFirst: true },
  { name: 'ChinaMax', directFirst: true },
] as const;

const CLASH_REGION_GROUPS = [
  { name: 'Hong Kong', label: 'Hong Kong', patterns: [/香港/i, /\bHK\b/i, /\bHKG\b/i, /Hong\s*Kong/i] },
  { name: 'Singapore', label: 'Singapore', patterns: [/新加坡/i, /\bSG\b/i, /\bSGP\b/i, /Singapore/i] },
  { name: 'Japan', label: 'Japan', patterns: [/日本/i, /\bJP\b/i, /\bJPN\b/i, /Japan/i] },
  { name: 'United States', label: 'United States', patterns: [/美国/i, /\bUS\b/i, /\bUSA\b/i, /United\s*States/i] },
  { name: 'Taiwan', label: 'Taiwan', patterns: [/台湾/i, /\bTW\b/i, /\bTWN\b/i, /Taiwan/i] },
  { name: 'Korea', label: 'Korea', patterns: [/韩国/i, /\bKR\b/i, /\bKOR\b/i, /Korea/i] },
  { name: 'United Kingdom', label: 'United Kingdom', patterns: [/英国/i, /\bUK\b/i, /\bGB\b/i, /\bGBR\b/i, /United\s*Kingdom/i] },
  { name: 'Thailand', label: 'Thailand', patterns: [/泰国/i, /\bTH\b/i, /\bTHA\b/i, /Thailand/i] },
] as const;

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
  const proxyNodes = nodes.filter(node => !isDisplayOnlyNodeName(node.name));
  const proxyNames = proxyNodes.map(node => node.name);
  const regionGroups = buildRegionGroups(proxyNames);
  const homeBroadband = proxyNames.filter(name => /家宽|home\s*broadband|broadband/i.test(name));
  const selectableGroups = [...regionGroups.map(group => group.name), ...(homeBroadband.length ? ['Home Broadband'] : [])];
  return [
    'mixed-port: 7890',
    'allow-lan: false',
    'mode: rule',
    'log-level: info',
    'proxies:',
    ...proxyNodes.map(node => renderClashProxy(node)),
    'proxy-groups:',
    ...renderClashPrimaryGroups(proxyNames, selectableGroups),
    ...CLASH_POLICY_GROUPS.flatMap(group => renderClashPolicyGroup(group, selectableGroups, regionGroups)),
    ...regionGroups.flatMap(group => renderUrlTestGroup(group.name, group.proxies)),
    ...(homeBroadband.length ? renderUrlTestGroup('Home Broadband', homeBroadband) : []),
    'rule-providers:',
    ...CLASH_RULE_PROVIDERS.flatMap(([name, relativePath, behavior]) => renderClashRuleProvider(name, behavior, relativePath)),
    'rules:',
    '  - DOMAIN,rtx.al,DIRECT',
    '  - RULE-SET,Apple_Classical_No_Resolve,Apple',
    '  - RULE-SET,BiliBili_No_Resolve,BiliBili',
    '  - RULE-SET,Netflix_No_Resolve,Netflix',
    '  - RULE-SET,Disney_No_Resolve,Disney',
    '  - RULE-SET,YouTube_No_Resolve,YouTube',
    '  - RULE-SET,TikTok_No_Resolve,TikTok',
    '  - RULE-SET,GlobalMedia_Classical_No_Resolve,GlobalMedia',
    '  - RULE-SET,OpenAI_No_Resolve,OpenAI',
    '  - RULE-SET,Google_No_Resolve,Google',
    '  - RULE-SET,Microsoft_No_Resolve,Microsoft',
    '  - RULE-SET,PayPal_No_Resolve,PayPal',
    '  - RULE-SET,Telegram_No_Resolve,Telegram',
    '  - RULE-SET,Steam_No_Resolve,Steam',
    '  - RULE-SET,Lan_No_Resolve,Lan',
    '  - RULE-SET,ChinaMax_Classical_No_IPv6_No_Resolve,ChinaMax',
    '  - MATCH,Final',
    '',
  ].join('\n');
}

function renderClashPrimaryGroups(proxyNames: string[], selectableGroups: string[]): string[] {
  const autoCandidates = proxyNames.length ? proxyNames : ['DIRECT'];
  return [
    `  - name: ${CLASH_GROUP}`,
    '    type: select',
    '    proxies:',
    `      - ${CLASH_AUTO_GROUP}`,
    '      - DIRECT',
    ...selectableGroups.map(name => `      - ${yamlString(name)}`),
    ...proxyNames.map(name => `      - ${yamlString(name)}`),
    `  - name: ${CLASH_AUTO_GROUP}`,
    '    type: fallback',
    `    url: ${yamlString(CLASH_CONNECTIVITY_TEST_URL)}`,
    '    interval: 300',
    '    proxies:',
    ...autoCandidates.map(name => `      - ${yamlString(name)}`),
    `  - name: Final`,
    '    type: select',
    '    proxies:',
    `      - ${CLASH_GROUP}`,
    `      - ${CLASH_AUTO_GROUP}`,
    '      - DIRECT',
  ];
}

function renderClashPolicyGroup(
  group: ClashPolicyGroup,
  selectableGroups: string[],
  regionGroups: Array<{ name: string; label: string; proxies: string[] }>,
): string[] {
  const preferredRegions = group.preferredRegions
    ? regionGroups.filter(region => group.preferredRegions?.includes(region.label)).map(region => region.name)
    : [];
  const regionChoices = preferredRegions.length ? preferredRegions : selectableGroups;
  const firstChoices = group.directFirst
    ? ['DIRECT', CLASH_GROUP, CLASH_AUTO_GROUP]
    : [CLASH_GROUP, ...(group.direct ? ['DIRECT'] : []), CLASH_AUTO_GROUP];

  return [
    `  - name: ${group.name}`,
    '    type: select',
    '    proxies:',
    ...dedupeStrings([...firstChoices, ...regionChoices]).map(name => `      - ${yamlString(name)}`),
  ];
}

function renderUrlTestGroup(name: string, proxies: string[]): string[] {
  return [
    `  - name: ${yamlString(name)}`,
    '    type: url-test',
    `    url: ${yamlString(CLASH_CONNECTIVITY_TEST_URL)}`,
    '    interval: 300',
    '    proxies:',
    ...proxies.map(proxy => `      - ${yamlString(proxy)}`),
  ];
}

function renderClashRuleProvider(name: string, behavior: string, relativePath: string): string[] {
  return [
    `  ${name}:`,
    '    type: http',
    `    behavior: ${behavior}`,
    `    url: ${yamlString(`${CLASH_PROVIDER_BASE}/${relativePath}`)}`,
    `    path: ${yamlString(`./providers/${name}.yaml`)}`,
    '    interval: 86400',
  ];
}

function buildRegionGroups(proxyNames: string[]): Array<{ name: string; label: string; proxies: string[] }> {
  return CLASH_REGION_GROUPS
    .map(region => ({
      name: `${regionFlag(region.label)} ${region.name}`,
      label: region.label,
      proxies: proxyNames.filter(proxyName => region.patterns.some(pattern => pattern.test(proxyName))),
    }))
    .filter(region => region.proxies.length > 0);
}

function regionFlag(region: string): string {
  const flags: Record<string, string> = {
    'Hong Kong': '🇭🇰',
    Singapore: '🇸🇬',
    Japan: '🇯🇵',
    'United States': '🇺🇸',
    Taiwan: '🇹🇼',
    Korea: '🇰🇷',
    'United Kingdom': '🇬🇧',
    Thailand: '🇹🇭',
  };
  return flags[region] || '🌐';
}

function isDisplayOnlyNodeName(name: string): boolean {
  return /剩余流量|距离下次|套餐到期|到期时间|流量重置|traffic|expire|reset/i.test(name);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
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
  const proxyNodes = nodes.filter(node => !isDisplayOnlyNodeName(node.name));
  const proxyNames = proxyNodes.map(node => node.name);
  return JSON.stringify({
    outbounds: [
      {
        type: 'selector',
        tag: CLASH_GROUP,
        outbounds: [...proxyNames, 'DIRECT'],
        default: proxyNames[0] || 'DIRECT',
      },
      { type: 'direct', tag: 'DIRECT' },
      { type: 'block', tag: 'REJECT' },
      ...proxyNodes.map(node => {
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
        { rule_set: ['geosite-geolocation-!cn'], outbound: CLASH_GROUP },
      ],
      final: CLASH_GROUP,
    },
  }, null, 2);
}

function renderSingBoxRuleSet(tag: string, path: string): Record<string, string> {
  return {
    type: 'remote',
    tag,
    format: 'binary',
    url: `${SING_BOX_RULE_SET_BASE}/${path}`,
    download_detour: CLASH_GROUP,
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
