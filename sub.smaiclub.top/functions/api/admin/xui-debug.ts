import { requireAdminLogin } from '../../_shared/auth.ts';
import { jsonResponse } from '../../_shared/http.ts';
import type { Env } from '../../_shared/types.ts';
import { probeXuiAuth, probeXuiAuthModes, xuiConfigDiagnostic } from '../../_shared/xui.ts';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const admin = await requireAdminLogin(request, env);
    if (admin instanceof Response) return admin;

    const url = new URL(request.url);
    const probe = url.searchParams.get('probe') === '1'
      ? await probeXuiAuth(env)
      : null;
    const probes = url.searchParams.get('modes') === '1'
      ? await probeXuiAuthModes(env)
      : null;

    return jsonResponse({
      ok: true,
      admin: admin.username,
      config: xuiConfigDiagnostic(env),
      accessSecretFingerprint: await accessSecretFingerprint(env),
      probe,
      probes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('XUI_DEBUG_UNHANDLED', message);
    return jsonResponse({
      error: 'XUI_DEBUG_UNHANDLED',
      message,
    }, { status: 500 });
  }
};

async function accessSecretFingerprint(env: Env) {
  return {
    clientId: await fingerprint(env.XUI_ACCESS_CLIENT_ID),
    clientSecret: await fingerprint(env.XUI_ACCESS_CLIENT_SECRET),
  };
}

async function fingerprint(value?: string) {
  if (!value) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  return {
    length: value.length,
    sha256Prefix: hex.slice(0, 12),
    startsWithCfHeaderName: /^CF-Access-Client-/i.test(value),
    endsWithAccess: value.endsWith('.access'),
    hasWhitespace: /\s/.test(value),
  };
}
