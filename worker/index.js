/**
 * Garage Sale — Cloudflare Worker.
 *
 * Login con GitHub (la web no puede guardar el "client secret" de la GitHub App):
 *   POST /token    { code }           -> cambia el código del login por una sesión
 *   POST /refresh  { refresh_token }  -> renueva una sesión vencida
 *
 * Contador anónimo de "Me interesa" (opcional, necesita el KV INTEREST):
 *   POST /interest { ids: [...] }     -> suma 1 a cada producto (sin datos personales)
 *   GET  /stats                       -> totales; solo para admins (Authorization: Bearer <token de GitHub>)
 *
 * Variables (Cloudflare → Worker → Settings → Variables and Secrets):
 *   GITHUB_CLIENT_ID      (texto)   Client ID de la GitHub App
 *   GITHUB_CLIENT_SECRET  (secreto) Client secret de la GitHub App
 *   ALLOWED_ORIGINS       (texto)   Orígenes permitidos separados por coma, ej.
 *                                   https://locosporelhardware.pages.dev,http://localhost:4200
 *   GITHUB_REPO           (texto)   owner/repo cuyos colaboradores son admins, ej.
 *                                   luciogarcia97/locos_x_el_hard_sale
 * Bindings (Settings → Bindings → KV namespace):
 *   INTEREST              KV namespace para el contador
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_IDS = 20;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : {};

    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed.includes(origin)) return reply(403, { error: 'origin_not_allowed' });

    const path = new URL(request.url).pathname;

    if (request.method === 'GET' && path === '/stats') return stats(request, env, reply);
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

    let input;
    try {
      input = await request.json();
    } catch {
      return reply(400, { error: 'invalid_json' });
    }

    if (path === '/interest') return interest(input, env, reply);

    const params = { client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET };
    if (path === '/token' && typeof input.code === 'string') {
      params.code = input.code;
    } else if (path === '/refresh' && typeof input.refresh_token === 'string') {
      params.grant_type = 'refresh_token';
      params.refresh_token = input.refresh_token;
    } else {
      return reply(404, { error: 'not_found' });
    }

    const gh = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'garage-sale-auth' },
      body: JSON.stringify(params),
    });
    const data = await gh.json().catch(() => ({}));
    if (!gh.ok || data.error || !data.access_token) {
      return reply(401, { error: data.error ?? 'github_error' });
    }

    // only what the site needs; never echo the secret
    return reply(200, {
      access_token: data.access_token,
      expires_in: data.expires_in ?? null,
      refresh_token: data.refresh_token ?? null,
      refresh_token_expires_in: data.refresh_token_expires_in ?? null,
    });
  },
};

/** +1 per product id. No IPs, cookies or anything about the visitor is stored. */
async function interest(input, env, reply) {
  if (!env.INTEREST) return reply(501, { error: 'counter_not_configured' });
  const ids = Array.isArray(input.ids) ? [...new Set(input.ids)].filter((id) => typeof id === 'string' && ID_PATTERN.test(id)) : [];
  if (!ids.length || ids.length > MAX_IDS) return reply(400, { error: 'invalid_ids' });
  await Promise.all(
    ids.map(async (id) => {
      const key = `interest:${id}`;
      const current = Number(await env.INTEREST.get(key)) || 0;
      await env.INTEREST.put(key, String(current + 1));
    }),
  );
  return reply(200, { ok: true });
}

/** Totals for the admin panel. GitHub itself confirms the caller can write to the repo. */
async function stats(request, env, reply) {
  if (!env.INTEREST || !env.GITHUB_REPO) return reply(501, { error: 'counter_not_configured' });
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'missing_token' });

  const gh = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'garage-sale-auth' },
  });
  const repo = gh.ok ? await gh.json().catch(() => ({})) : {};
  if (!repo.permissions?.push) return reply(403, { error: 'not_admin' });

  const counts = {};
  let cursor;
  do {
    const page = await env.INTEREST.list({ prefix: 'interest:', cursor });
    await Promise.all(page.keys.map(async (k) => (counts[k.name.slice(9)] = Number(await env.INTEREST.get(k.name)) || 0)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return reply(200, { counts });
}
