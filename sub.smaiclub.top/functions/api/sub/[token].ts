import { getUserByToken, isBlocked } from '../../_shared/db.ts';
import { jsonResponse } from '../../_shared/http.ts';
import {
  buildSubscriptionUserinfo,
  buildVpsNode,
  detectClientFormat,
  fetchEdgetunnelNodes,
  renderSubscription,
} from '../../_shared/subscription.ts';
import type { Env, ProxyNode } from '../../_shared/types.ts';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = String(params.token || '').trim();
  if (!token) return jsonResponse({ error: 'NOT_FOUND' }, { status: 404 });

  const user = await getUserByToken(env.DB, token);
  if (!user) return jsonResponse({ error: 'NOT_FOUND' }, { status: 404 });

  const blocked = isBlocked(user);
  if (blocked) return jsonResponse({ error: 'SUBSCRIPTION_BLOCKED', status: blocked }, { status: 403 });

  const nodes: ProxyNode[] = [];
  const vpsNode = buildVpsNode(env, user);
  if (vpsNode) nodes.push(vpsNode);
  nodes.push(...await fetchEdgetunnelNodes(env, user));

  if (nodes.length === 0) {
    return jsonResponse({ error: 'NO_AVAILABLE_NODES' }, { status: 503 });
  }

  const format = detectClientFormat(request.headers.get('User-Agent'));
  return new Response(renderSubscription(nodes, format), {
    headers: {
      'Content-Type': format.contentType,
      'Cache-Control': 'no-store',
      'Subscription-Userinfo': buildSubscriptionUserinfo(user),
      'Profile-Update-Interval': '12',
    },
  });
};
