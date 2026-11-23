/**
 * Login con GitHub para la Garage Sale — Cloudflare Worker.
 *
 * La web no puede guardar el "client secret" de la GitHub App (sería público),
 * así que este Worker hace solo dos cosas:
 *   POST /token   { code }           -> cambia el código del login por una sesión
 *   POST /refresh { refresh_token }  -> renueva una sesión vencida
 * No guarda nada: no tiene base de datos ni cookies.
 *
 * Variables (Cloudflare → Worker → Settings → Variables and Secrets):
 *   GITHUB_CLIENT_ID      (texto)   Client ID de la GitHub App
 *   GITHUB_CLIENT_SECRET  (secreto) Client secret de la GitHub App
 *   ALLOWED_ORIGINS       (texto)   Orígenes permitidos separados por coma, ej.
 *                                   https://luciogarcia97.github.io,http://localhost:4200
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : {};

    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed.includes(origin)) return reply(403, { error: 'origin_not_allowed' });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

    const path = new URL(request.url).pathname;
    let input;
    try {
      input = await request.json();
    } catch {
      return reply(400, { error: 'invalid_json' });
    }

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
