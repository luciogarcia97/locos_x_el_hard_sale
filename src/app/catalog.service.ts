import { Injectable, computed, effect, signal } from '@angular/core';
import { Product, SiteConfig, formatPrice } from './models';

const FAVORITES_KEY = 'loh-favorites';
const INTEREST_KEY = 'loh-interest-sent';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  readonly products = signal<Product[]>([]);
  readonly config = signal<SiteConfig | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly favorites = signal<Set<string>>(this.readFavorites());
  readonly favoriteProducts = computed(() =>
    this.products().filter((p) => this.favorites().has(p.id) && p.status !== 'vendido'),
  );

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...this.favorites()]));
      } catch {
        /* storage blocked: favorites just won't persist */
      }
    });
  }

  async load() {
    try {
      // cache-busting so edits to the JSON show up right after a deploy
      const bust = `?v=${Date.now()}`;
      const [products, config] = await Promise.all([
        fetch(`data/products.json${bust}`).then((r) => r.json()),
        fetch(`data/config.json${bust}`).then((r) => r.json()),
      ]);
      this.products.set(products);
      this.config.set(config);
      return config as SiteConfig;
    } catch (e) {
      console.error(e);
      this.error.set('No pudimos cargar los productos. Probá recargar la página.');
    } finally {
      this.loading.set(false);
    }
    return null;
  }

  isFavorite(id: string) {
    return this.favorites().has(id);
  }

  toggleFavorite(id: string) {
    this.favorites.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  buildMessage(items: Product[]) {
    const intro = this.config()?.messageTemplate ?? '¡Hola! Me interesa:';
    const lines = items.map((p) => `• ${p.name} (${formatPrice(p.price)})`);
    return [intro, ...lines].join('\n');
  }

  /**
   * Anonymous "Me interesa" counter (see worker/): only the product id is sent, at most once per
   * product per browser per day. Fire-and-forget: failures never bother the visitor.
   */
  trackInterest(ids: string[]) {
    const worker = this.config()?.auth?.workerUrl;
    if (!worker || !ids.length) return;
    const today = new Date().toISOString().slice(0, 10);
    let seen: Record<string, string> = {};
    try {
      seen = JSON.parse(localStorage.getItem(INTEREST_KEY) ?? '{}');
    } catch {
      /* storage blocked: count anyway */
    }
    const fresh = ids.filter((id) => seen[id] !== today);
    if (!fresh.length) return;
    fresh.forEach((id) => (seen[id] = today));
    try {
      localStorage.setItem(INTEREST_KEY, JSON.stringify(seen));
    } catch {
      /* ignore */
    }
    // text/plain keeps it a "simple" request (no CORS preflight)
    fetch(`${worker.replace(/\/$/, '')}/interest`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ ids: fresh }),
      keepalive: true,
    }).catch(() => {});
  }

  private readFavorites(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }
}
