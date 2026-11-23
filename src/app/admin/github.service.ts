import { Injectable, inject } from '@angular/core';
import { AuthService, SessionExpired } from '../auth.service';
import { Product } from '../models';

/** A new file to add to the repo, already encoded as base64. */
export interface PendingFile {
  path: string;
  base64: string;
}

export const PRODUCTS_PATH = 'public/data/products.json';
export const IMAGES_DIR = 'images/products';

/**
 * Talks to the GitHub REST API from the browser with the logged-in admin's token.
 * Reads the catalog straight from the repo (always the latest version, not the
 * deployed copy) and publishes every change as a single commit, which triggers
 * the GitHub Pages deploy workflow.
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  private readonly auth = inject(AuthService);

  /** sha of products.json when it was loaded; used to detect edits made elsewhere. */
  private loadedSha: string | null = null;

  async loadProducts(): Promise<Product[]> {
    const { base, branch } = this.target();
    const file = await this.api<{ sha: string; content: string }>(`${base}/contents/${PRODUCTS_PATH}?ref=${encodeURIComponent(branch)}`);
    this.loadedSha = file.sha;
    return JSON.parse(decodeBase64(file.content));
  }

  /** Public URL of a file already in the repo (works before the site redeploys). */
  rawUrl(publicPath: string) {
    const r = this.auth.repo;
    if (!r) return publicPath;
    return `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${r.branch}/public/${publicPath}`;
  }

  /**
   * One commit with the new products.json, the uploaded photos and the removal of photos
   * no product uses any more.
   */
  async publish(products: Product[], added: PendingFile[], removed: string[], message: string) {
    const { base, branch } = this.target();

    const current = await this.api<{ sha: string }>(`${base}/contents/${PRODUCTS_PATH}?ref=${encodeURIComponent(branch)}`);
    if (this.loadedSha && current.sha !== this.loadedSha) {
      throw new Error('El catálogo se modificó desde otro lado mientras editabas. Recargá el panel para traer la última versión y volvé a hacer los cambios.');
    }

    const ref = await this.api<{ object: { sha: string } }>(`${base}/git/ref/heads/${branch}`);
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

    await this.api(`${base}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    // next publish compares against what we just wrote
    const fresh = await this.api<{ sha: string }>(`${base}/contents/${PRODUCTS_PATH}?ref=${commit.sha}`);
    this.loadedSha = fresh.sha;
  }

  private target() {
    const r = this.auth.repo;
    if (!r) throw new Error('Falta configurar el repositorio en config.json (github.owner / github.repo).');
    return { base: `/repos/${r.owner}/${r.repo}`, branch: r.branch };
  }

  private async api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    let token: string;
    try {
      token = await this.auth.token();
    } catch {
      this.auth.expire();
      throw new SessionExpired();
    }

    let res: Response;
    try {
      res = await fetch(`https://api.github.com${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new Error('No hay conexión con GitHub. Revisá internet y probá de nuevo.');
    }
    if (res.ok) return (res.status === 204 ? null : await res.json()) as T;

    if (res.status === 401) {
      this.auth.expire();
      throw new SessionExpired();
    }
    if (res.status === 403) {
      const reason = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? '';
      if (/not accessible by integration/i.test(reason)) {
        throw new Error(
          'GitHub rechazó el cambio: la GitHub App no tiene permiso de escritura en este repositorio. ' +
            'Revisá que esté instalada en el repo y que "Contents" sea "Read and write" (y aceptá el permiso nuevo en la instalación). Después tocá Salir e ingresá de nuevo.',
        );
      }
      if (/rate limit/i.test(reason)) {
        throw new Error('GitHub frenó los pedidos por exceso de uso. Esperá unos minutos y probá de nuevo.');
      }
      throw new Error(
        `GitHub rechazó el cambio. Revisá que tu cuenta sea colaboradora del repositorio y que la GitHub App esté instalada en él.${reason ? ` (GitHub: ${reason})` : ''}`,
      );
    }
    if (res.status === 404) throw new Error('No se encontró el repositorio, la rama o el archivo de productos. Revisá github.owner / github.repo / github.branch en config.json.');
    if (res.status === 409 || res.status === 422) throw new Error('GitHub no aceptó el cambio porque el repositorio se actualizó. Recargá el panel y probá de nuevo.');
    throw new Error(`GitHub respondió con un error (${res.status}). Probá de nuevo en un rato.`);
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
