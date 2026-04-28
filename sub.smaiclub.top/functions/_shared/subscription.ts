import { extractRegionFromName, labelRegion } from './geo.ts';
import type { ClientFormat, Env, ProxyNode, UserSubscriptionRow } from './types.ts';

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
    `total=${Math.max(0, Math.floor(user.traffic_total))}`,
    `expire=${Math.max(0, Math.floor(user.sub_expired_at / 1000))}`,
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
  if (env.REALITY_SHORT_ID) params.set('sid', env.REALITY_SHORT_ID);
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
    return parseEdgetunnelSubscription(text, user.xui_uuid, maxNodes);
  } catch (error) {
    console.warn('Failed to fetch edgetunnel subscription', error);
    return [];
  }
}

export function parseEdgetunnelSubscription(input: string, userUuid: string | null | undefined, maxNodes = 99): ProxyNode[] {
  if (!userUuid) return [];
  const decoded = maybeDecodeBase64(input);
  const links = decoded
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('vless://'));

  return links.slice(0, maxNodes).map((link, index) => normalizeEdgeNode(link, userUuid, index + 1)).filter(Boolean) as ProxyNode[];
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

function normalizeEdgeNode(link: string, userUuid: string, ordinal: number): ProxyNode | null {
  try {
    const url = new URL(link);
    url.username = userUuid;
    const originalName = decodeURIComponent(url.hash.replace(/^#/, ''));
    const region = extractRegionFromName(originalName || url.hostname);
    const name = `优选-${labelRegion(region)}-${String(ordinal).padStart(2, '0')}`;
    url.hash = encodeURIComponent(name);
    return {
      id: `edge-${ordinal}`,
      kind: 'edge',
      name,
      uri: url.toString(),
    };
  } catch {
    return null;
  }
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
    'rules:',
    '  - MATCH,SmaiClub',
    '',
  ].join('\n');
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
  return JSON.stringify({
    outbounds: nodes.map(node => {
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
  }, null, 2);
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
