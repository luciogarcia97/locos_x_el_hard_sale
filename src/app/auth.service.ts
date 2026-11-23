import { Injectable, computed, signal } from '@angular/core';
import { SiteConfig } from './models';

/**
 * "Ingresar con GitHub" for the admin panel.
 *
 * Flow: the site sends the person to GitHub → GitHub sends them back here with a
 * one-time `code` → the Cloudflare Worker (/worker) swaps it for a user token.
 * Who is admin is decided by GitHub itself: anyone with write access to the repo
 * (Settings → Collaborators). The panel button is only a shortcut; GitHub rejects
 * changes from any other account even if someone forces their way into #admin.
 */

export type AuthStatus =
  | 'idle' // config not loaded yet
  | 'unconfigured' // config.json has no auth settings
  | 'anon'
  | 'checking'
  | 'admin'
  | 'user' // logged in, but can't edit the repo
  | 'error';

interface Session {
  token: string;
  /** ms epoch; absent when the GitHub App doesn't expire tokens */
  expiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

export interface GithubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

const SESSION_KEY = 'loh-session';
const PENDING_KEY = 'loh-oauth-pending';
const RETURN_KEY = 'loh-return-to';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly status = signal<AuthStatus>('idle');
  readonly user = signal<GithubUser | null>(null);
  readonly error = signal<string | null>(null);
  readonly isAdmin = computed(() => this.status() === 'admin');

  private config: SiteConfig | null = null;
  private session: Session | null = readJson<Session>(localStorage, SESSION_KEY);
  private refreshing: Promise<string> | null = null;

  get repo(): RepoRef | null {
    const g = this.config?.github;
    return g?.owner && g.repo ? { owner: g.owner, repo: g.repo, branch: g.branch || 'main' } : null;
  }

  /** Called once the site config is loaded. Finishes a login in progress, or re-checks a saved session. */
  async init(config: SiteConfig | null) {
    this.config = config;
    if (!config?.auth?.clientId || !config.auth.workerUrl || !this.repo) {
      this.status.set('unconfigured');
      return;
    }

    const params = new URLSearchParams(location.search);
    if (params.has('code') || params.has('error')) {
      await this.finishLogin(params);
      return;
    }

    if (this.session) await this.verify();
    else this.status.set('anon');
  }

  /** Sends the person to GitHub's authorization page. */
  login(returnTo: string = this.returnTo ?? '') {
    const auth = this.config?.auth;
    if (!auth) return;
    const state = crypto.randomUUID();
    writeJson(sessionStorage, PENDING_KEY, { state, returnTo });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', auth.clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl());
    url.searchParams.set('state', state);
    location.assign(url.toString());
  }

  logout() {
    this.session = null;
    removeKey(localStorage, SESSION_KEY);
    this.user.set(null);
    this.error.set(null);
    this.status.set(this.config?.auth ? 'anon' : 'unconfigured');
  }

  /** Where to go after logging in (set by the #admin guard). */
  get returnTo(): string | null {
    return readJson<string>(sessionStorage, RETURN_KEY);
  }
  set returnTo(value: string | null) {
    if (value) writeJson(sessionStorage, RETURN_KEY, value);
    else removeKey(sessionStorage, RETURN_KEY);
  }

  /** A usable token, renewed with the refresh token when it's about to expire. */
  async token(): Promise<string> {
    const s = this.session;
    if (!s) throw new SessionExpired();
    if (!s.expiresAt || Date.now() < s.expiresAt - 60_000) return s.token;
    this.refreshing ??= this.refresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** The API said the token is no longer valid: end the session so the guard sends the person to login. */
  expire() {
    this.logout();
    this.returnTo = 'admin';
    this.error.set('Tu sesión venció. Volvé a ingresar.');
  }

  // ---------------------------------------------------------------------------

  private callbackUrl() {
    // must match the "Callback URL" configured in the GitHub App
    return `${location.origin}${location.pathname}`;
  }

  private async finishLogin(params: URLSearchParams) {
    const pending = readJson<{ state: string; returnTo: string }>(sessionStorage, PENDING_KEY);
    removeKey(sessionStorage, PENDING_KEY);
    const returnTo = pending?.returnTo ?? '';
    // drop ?code=… from the address bar so it isn't bookmarked or shared
    history.replaceState(null, '', `${location.pathname}${returnTo ? `#${returnTo}` : '#login'}`);

    if (params.has('error')) {
      this.status.set('anon');
      this.error.set('Cancelaste el ingreso con GitHub.');
      return;
    }
    if (!pending || pending.state !== params.get('state')) {
      this.status.set('anon');
      this.error.set('El ingreso no se pudo validar. Probá de nuevo desde este navegador.');
      return;
    }

    this.status.set('checking');
    try {
      this.saveSession(await this.callWorker('/token', { code: params.get('code') }));
      this.returnTo = null;
      await this.verify();
    } catch (e) {
      this.status.set('anon');
      this.error.set((e as Error).message);
    }
  }

  /** Who is logged in and whether they can write to the repo. */
  private async verify() {
    this.status.set('checking');
    this.error.set(null);
    const repo = this.repo!;
    try {
      const [user, repoInfo] = await Promise.all([
        this.get<{ login: string; name: string | null; avatar_url: string }>('/user'),
        this.get<{ permissions?: { push?: boolean } }>(`/repos/${repo.owner}/${repo.repo}`),
      ]);
      this.user.set({ login: user.login, name: user.name, avatarUrl: user.avatar_url });
      this.status.set(repoInfo.permissions?.push ? 'admin' : 'user');
    } catch (e) {
      if (e instanceof SessionExpired) {
        this.logout();
      } else {
        this.status.set('error');
        this.error.set('No se pudo verificar tu cuenta con GitHub. Revisá la conexión y recargá la página.');
      }
    }
  }

  private async get<T>(path: string, retried = false): Promise<T> {
    const res = await fetch(`https://api.github.com${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${await this.token()}` },
    });
    if (res.status === 401 && !retried && this.session?.refreshToken) {
      await this.refresh();
      return this.get<T>(path, true);
    }
    if (res.status === 401) throw new SessionExpired();
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    return res.json();
  }

  private async refresh(): Promise<string> {
    const s = this.session;
    if (!s?.refreshToken || (s.refreshExpiresAt && Date.now() > s.refreshExpiresAt)) throw new SessionExpired();
    try {
      this.saveSession(await this.callWorker('/refresh', { refresh_token: s.refreshToken }));
      return this.session!.token;
    } catch {
      throw new SessionExpired();
    }
  }

  private async callWorker(path: string, body: object) {
    let res: Response;
    try {
      res = await fetch(`${this.config!.auth!.workerUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('No se pudo conectar con el servicio de ingreso. Revisá internet y probá de nuevo.');
    }
    if (res.status === 403) throw new Error('El servicio de ingreso no acepta pedidos desde esta dirección (revisar ALLOWED_ORIGINS en el Worker).');
    if (!res.ok) throw new Error('GitHub no aceptó el ingreso. Probá de nuevo.');
    return res.json() as Promise<{ access_token: string; expires_in: number | null; refresh_token: string | null; refresh_token_expires_in: number | null }>;
  }

  private saveSession(t: { access_token: string; expires_in: number | null; refresh_token: string | null; refresh_token_expires_in: number | null }) {
    const now = Date.now();
    this.session = {
      token: t.access_token,
      expiresAt: t.expires_in ? now + t.expires_in * 1000 : undefined,
      refreshToken: t.refresh_token ?? undefined,
      refreshExpiresAt: t.refresh_token_expires_in ? now + t.refresh_token_expires_in * 1000 : undefined,
    };
    writeJson(localStorage, SESSION_KEY, this.session);
  }
}

export class SessionExpired extends Error {
  constructor() {
    super('Tu sesión venció. Volvé a ingresar.');
  }
}

function readJson<T>(store: Storage, key: string): T | null {
  try {
    return JSON.parse(store.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
function writeJson(store: Storage, key: string, value: unknown) {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the session lasts until the tab closes */
  }
}
function removeKey(store: Storage, key: string) {
  try {
    store.removeItem(key);
  } catch {
    /* nothing to clean */
  }
}
