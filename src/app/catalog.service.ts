import { Injectable, computed, effect, signal } from '@angular/core';
import { Product, SiteConfig, formatPrice } from './models';

const FAVORITES_KEY = 'loh-favorites';

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
    } catch (e) {
      console.error(e);
      this.error.set('No pudimos cargar los productos. Probá recargar la página.');
    } finally {
      this.loading.set(false);
    }
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

  private readFavorites(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }
}
