import { Component, DOCUMENT, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Admin } from './admin/admin';
import { AuthService } from './auth.service';
import { Login } from './login';
import { CatalogService } from './catalog.service';
import { ContactDialog } from './contact-dialog';
import { Product } from './models';
import { ProductCard } from './product-card';
import { ProductDetail } from './product-detail';

type Sort = 'destacados' | 'precio-asc' | 'precio-desc';
/** Hash routes, so the site works on any static host without server rewrites. */
type Route = 'home' | 'admin' | 'login';

const routeFromHash = (): Route => {
  if (location.hash === '#admin') return 'admin';
  // coming back from GitHub (?code=…): show the login screen while the session is created
  if (location.hash === '#login' || new URLSearchParams(location.search).has('code')) return 'login';
  return 'home';
};

@Component({
  selector: 'app-root',
  imports: [ProductCard, ProductDetail, ContactDialog, Admin, Login],
  templateUrl: './app.html',
})
export class App {
  protected readonly catalog = inject(CatalogService);
  protected readonly auth = inject(AuthService);

  protected readonly category = signal<string>('Todos');
  protected readonly hideSold = signal(false);
  protected readonly onlyFavorites = signal(false);
  protected readonly search = signal('');
  protected readonly sort = signal<Sort>('destacados');

  protected readonly route = signal<Route>(routeFromHash());

  private readonly hero = viewChild<ElementRef<HTMLElement>>('hero');

  protected readonly selected = signal<Product | null>(null);
  protected readonly contactItems = signal<Product[] | null>(null);

  protected readonly categories = computed(() => [
    'Todos',
    ...new Set(this.catalog.products().map((p) => p.category)),
  ]);

  protected readonly availableCount = computed(
    () => this.catalog.products().filter((p) => p.status !== 'vendido').length,
  );

  protected readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const favs = this.catalog.favorites();
    const statusRank = { disponible: 0, reservado: 1, vendido: 2 };
    const list = this.catalog
      .products()
      .filter((p) => this.category() === 'Todos' || p.category === this.category())
      .filter((p) => !this.hideSold() || p.status !== 'vendido')
      .filter((p) => !this.onlyFavorites() || favs.has(p.id))
      .filter((p) => !q || `${p.name} ${p.brand} ${p.highlights.join(' ')}`.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      // sold items always go last
      const byStatus = statusRank[a.status] - statusRank[b.status];
      if (byStatus) return byStatus;
      if (this.sort() === 'precio-asc') return a.price - b.price;
      if (this.sort() === 'precio-desc') return b.price - a.price;
      return 0;
    });
  });

  constructor() {
    this.catalog
      .load()
      .then((config) => this.auth.init(config))
      // init may rewrite the address (?code=… → #admin) without firing hashchange
      .then(() => this.route.set(routeFromHash()));
    window.addEventListener('hashchange', () => this.route.set(routeFromHash()));

    // #admin guard: not logged in → #login (and come back after logging in).
    // Logged in but not an admin → the login screen explains it (rendered in the template).
    effect(() => {
      this.route(); // re-run on navigation…
      // …but read the live address: logout changes the hash right before ending the session,
      // and the hashchange event (which updates the signal) arrives later
      const route = routeFromHash();
      const status = this.auth.status();
      if (route === 'admin' && (status === 'anon' || status === 'unconfigured')) {
        this.auth.returnTo = 'admin';
        location.replace('#login');
      } else if (route === 'login' && status === 'admin' && this.auth.returnTo === 'admin') {
        this.auth.returnTo = null;
        location.replace('#admin');
      }
    });

    // freeze the page behind any open modal
    const doc = inject(DOCUMENT);
    effect(() => {
      doc.body.classList.toggle('modal-open', !!this.selected() || !!this.contactItems());
    });

    // stop the hero grid animation while the hero is out of view
    effect((onCleanup) => {
      const hero = this.hero()?.nativeElement;
      if (!hero || !('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver(([e]) => hero.classList.toggle('offscreen', !e.isIntersecting));
      io.observe(hero);
      onCleanup(() => io.disconnect());
    });
  }

  protected openContact(items: Product[]) {
    this.selected.set(null);
    this.contactItems.set(items);
  }
}
