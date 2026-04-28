import { requireAdminLogin } from '../../_shared/auth.ts';
import { getUserByUsername } from '../../_shared/db.ts';
import { jsonResponse } from '../../_shared/http.ts';
import type { Env } from '../../_shared/types.ts';
import { setXuiClientEnabled } from '../../_shared/xui.ts';

interface BanPayload {
  username?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdminLogin(request, env);
  if (admin instanceof Response) return admin;

  const payload = await request.json().catch(() => ({})) as BanPayload;
  const username = payload.username?.trim();
  if (!username) return jsonResponse({ error: 'USERNAME_REQUIRED' }, { status: 400 });

  const user = await getUserByUsername(env.DB, username);
  if (!user) return jsonResponse({ error: 'USER_NOT_FOUND' }, { status: 404 });

  await env.DB.prepare(`
    UPDATE users
    SET sub_status = 'banned',
        traffic_updated_at = ?
    WHERE username = ?
  `).bind(Date.now(), username).run();

  const xui = user.xui_uuid ? await setXuiClientEnabled(env, user.xui_uuid, false) : { attempted: false, ok: false };
  return jsonResponse({ ok: true, username, admin: admin.username, xui });
};
