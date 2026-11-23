import { Injectable, signal } from '@angular/core';
import { Product } from '../models';

export interface RepoSettings {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

/** A new file to add to the repo, already encoded as base64. */
export interface PendingFile {
  path: string;
  base64: string;
}

const SETTINGS_KEY = 'loh-admin-repo';
export const PRODUCTS_PATH = 'public/data/products.json';
export const IMAGES_DIR = 'images/products';

/**
 * Talks to the GitHub REST API from the browser.
 * Reads the catalog straight from the repo (always the latest version, not the
 * deployed copy) and publishes every change as a single commit, which triggers
 * the GitHub Pages deploy workflow.
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  readonly settings = signal<RepoSettings | null>(this.readSettings());

  /** sha of products.json when it was loaded; used to detect edits made elsewhere. */
  private loadedSha: string | null = null;

  async connect(s: RepoSettings) {
    const settings = { ...s, owner: s.owner.trim(), repo: s.repo.trim(), branch: s.branch.trim() || 'main', token: s.token.trim() };
    const repo = await this.api<{ permissions?: { push?: boolean } }>(`/repos/${settings.owner}/${settings.repo}`, {}, settings);
    if (repo.permissions && !repo.permissions.push) {
      throw new Error('La clave no tiene permiso de escritura en este repositorio. Revisá que tenga "Contents: Read and write".');
    }
    this.settings.set(settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage blocked: the session works until the tab closes */
    }
  }

  disconnect() {
    this.settings.set(null);
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      /* nothing to clean */
    }
  }

  async loadProducts(): Promise<Product[]> {
    const s = this.require();
    const file = await this.api<{ sha: string; content: string }>(
      `/repos/${s.owner}/${s.repo}/contents/${PRODUCTS_PATH}?ref=${encodeURIComponent(s.branch)}`,
    );
    this.loadedSha = file.sha;
    return JSON.parse(decodeBase64(file.content));
  }

  /** Public URL of a file already in the repo (works before the site redeploys). */
  rawUrl(publicPath: string) {
    const s = this.settings();
    if (!s) return publicPath;
    return `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${s.branch}/public/${publicPath}`;
  }

  /**
   * One commit with the new products.json, the uploaded photos and the removal of photos
   * no product uses any more.
   */
  async publish(products: Product[], added: PendingFile[], removed: string[], message: string) {
    const s = this.require();
    const base = `/repos/${s.owner}/${s.repo}`;

    const current = await this.api<{ sha: string }>(`${base}/contents/${PRODUCTS_PATH}?ref=${encodeURIComponent(s.branch)}`);
    if (this.loadedSha && current.sha !== this.loadedSha) {
      throw new Error('El catálogo se modificó desde otro lado mientras editabas. Recargá el panel para traer la última versión y volvé a hacer los cambios.');
    }

    const ref = await this.api<{ object: { sha: string } }>(`${base}/git/ref/heads/${s.branch}`);
    const headSha = ref.object.sha;
    const head = await this.api<{ tree: { sha: string } }>(`${base}/git/commits/${headSha}`);

    const blobs = await Promise.all(
      added.map(async (f) => {
        const blob = await this.api<{ sha: string }>(`${base}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({ content: f.base64, encoding: 'base64' }),
        });
        return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );

    const tree = await this.api<{ sha: string }>(`${base}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: head.tree.sha,
        tree: [
          { path: PRODUCTS_PATH, mode: '100644', type: 'blob', content: JSON.stringify(products, null, 2) + '\n' },
          ...blobs,
          ...removed.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
        ],
      }),
    });

    const commit = await this.api<{ sha: string }>(`${base}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
    });

    await this.api(`${base}/git/refs/heads/${s.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    // next publish compares against what we just wrote
    const fresh = await this.api<{ sha: string }>(`${base}/contents/${PRODUCTS_PATH}?ref=${commit.sha}`);
    this.loadedSha = fresh.sha;
  }

  private require(): RepoSettings {
    const s = this.settings();
    if (!s) throw new Error('Primero conectá el panel con GitHub.');
    return s;
  }

  private async api<T = unknown>(path: string, init: RequestInit = {}, settings = this.settings()): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`https://api.github.com${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(settings?.token ? { Authorization: `Bearer ${settings.token}` } : {}),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new Error('No hay conexión con GitHub. Revisá internet y probá de nuevo.');
    }
    if (res.ok) return (res.status === 204 ? null : await res.json()) as T;

    if (res.status === 401) throw new Error('La clave de acceso no es válida o venció. Generá una nueva y volvé a conectar.');
    if (res.status === 403) throw new Error('GitHub rechazó la operación: la clave no tiene permiso de escritura (Contents: Read and write) en este repositorio.');
    if (res.status === 404) throw new Error('No se encontró el repositorio, la rama o el archivo de productos. Revisá usuario, repositorio y rama.');
    if (res.status === 409 || res.status === 422) throw new Error('GitHub no aceptó el cambio porque el repositorio se actualizó. Recargá el panel y probá de nuevo.');
    throw new Error(`GitHub respondió con un error (${res.status}). Probá de nuevo en un rato.`);
  }

  private readSettings(): RepoSettings | null {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    } catch {
      return null;
    }
  }
}

function decodeBase64(b64: string) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Resizes a photo to max 1200px wide and converts it to WebP, entirely in the browser. */
export async function compressImage(file: File, maxWidth = 1200, quality = 0.82): Promise<{ blob: Blob; base64: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))), 'image/webp', quality),
  );
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
  return { blob, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
