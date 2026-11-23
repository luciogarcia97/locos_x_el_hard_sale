import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product, ProductStatus, formatPrice } from '../models';
import { AuthService } from '../auth.service';
import { GithubService, IMAGES_DIR, PendingFile, compressImage, slugify } from './github.service';

interface Draft extends Product {
  /** id of the product being edited, or null when creating one */
  originalId: string | null;
}

const ORIGINS = ['Nuevo de review', 'Usado'];
const STATUSES: ProductStatus[] = ['disponible', 'reservado', 'vendido'];

@Component({
  selector: 'app-admin',
  imports: [FormsModule],
  templateUrl: './admin.html',
  host: { '(window:beforeunload)': 'warnUnsaved($event)' },
})
export class Admin implements OnDestroy {
  protected readonly gh = inject(GithubService);
  protected readonly auth = inject(AuthService);

  protected readonly origins = ORIGINS;
  protected readonly statuses = STATUSES;
  protected readonly statusLabel: Record<ProductStatus, string> = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido' };
  protected readonly formatPrice = formatPrice;

  // ---- catalog being edited ----
  protected readonly products = signal<Product[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly publishing = signal(false);
  /** products.json as last loaded/published; starts equal to the empty list so nothing looks unsaved */
  private readonly published = signal('[]');
  /** photos picked in this session, keyed by their public path */
  private readonly pending = signal(new Map<string, { base64: string; url: string }>());
  private originalImages = new Set<string>();

  // photos only matter once a product uses them, so comparing the list is enough
  protected readonly dirty = computed(() => JSON.stringify(this.products()) !== this.published());
  protected readonly categories = computed(() => [...new Set(this.products().map((p) => p.category).filter(Boolean))]);

  // ---- editor ----
  protected readonly draft = signal<Draft | null>(null);
  protected readonly draftError = signal<string | null>(null);
  protected readonly processing = signal(false);
  protected newHighlight = '';

  /** "Me interesa" taps per product id (null until loaded / when the counter isn't set up) */
  protected readonly interest = signal<Record<string, number>>({});
  protected readonly hasInterest = computed(() => Object.keys(this.interest()).length > 0);

  constructor() {
    this.load();
    this.loadInterest();
  }

  ngOnDestroy() {
    this.pending().forEach((p) => URL.revokeObjectURL(p.url));
  }

  protected logout() {
    if (this.dirty() && !confirm('Tenés cambios sin publicar. Si salís se pierden. ¿Salir igual?')) return;
    this.published.set(JSON.stringify(this.products())); // don't trigger the unload warning
    location.hash = '';
    this.auth.logout();
  }

  protected async load() {
    if (this.dirty() && !confirm('Vas a perder los cambios sin publicar. ¿Recargar igual?')) return;
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const list = await this.gh.loadProducts();
      this.products.set(list);
      this.published.set(JSON.stringify(list));
      this.originalImages = new Set(list.flatMap((p) => p.images));
      this.clearPending();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async publish() {
    this.publishing.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const list = this.products();
      const used = new Set(list.flatMap((p) => p.images));
      const added: PendingFile[] = [...this.pending()]
        .filter(([path]) => used.has(path))
        .map(([path, f]) => ({ path: `public/${path}`, base64: f.base64 }));
      const removed = [...this.originalImages]
        .filter((path) => !used.has(path) && path.startsWith(`${IMAGES_DIR}/`))
        .map((path) => `public/${path}`);

      await this.gh.publish(list, added, removed, 'Actualizar catálogo desde el panel');

      this.published.set(JSON.stringify(list));
      this.originalImages = used;
      this.clearPending();
      this.notice.set('Cambios publicados. La web se actualiza sola en 1 o 2 minutos.');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.publishing.set(false);
    }
  }

  // ---- list actions ----
  protected move(index: number, delta: number) {
    this.products.update((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }

  protected setStatus(id: string, status: ProductStatus) {
    this.products.update((list) => list.map((p) => (p.id === id ? stampSold({ ...p, status }) : p)));
  }

  protected imageUrl(path: string | undefined) {
    if (!path) return '';
    return this.pending().get(path)?.url ?? this.gh.rawUrl(path);
  }

  // ---- editor ----
  protected create() {
    this.openDraft({
      originalId: null,
      id: '',
      name: '',
      brand: '',
      category: this.categories()[0] ?? '',
      origin: ORIGINS[0],
      condition: 'Completo, como nuevo',
      price: 0,
      status: 'disponible',
      images: [],
      highlights: [],
      specs: [],
      description: '',
      reviewUrl: '',
    });
  }

  protected edit(p: Product) {
    this.openDraft({ ...structuredClone(p), originalId: p.id });
  }

  private openDraft(d: Draft) {
    this.draftError.set(null);
    this.newHighlight = '';
    this.draft.set(d);
    window.scrollTo({ top: 0 });
  }

  protected cancelDraft() {
    this.draft.set(null);
  }

  protected saveDraft() {
    const d = this.draft();
    if (!d) return;
    const name = d.name.trim();
    if (!name) return this.draftError.set('Falta el nombre del producto.');
    if (!(d.price >= 0)) return this.draftError.set('El precio tiene que ser un número (0 o más).');
    if (!d.category.trim()) return this.draftError.set('Falta la categoría (por ejemplo, Teclados).');

    const { originalId, ...rest } = d;
    const product: Product = stampSold({
      ...rest,
      name,
      brand: d.brand.trim(),
      category: d.category.trim(),
      price: Math.round(d.price),
      specs: d.specs.filter((s) => s.label.trim() && s.value.trim()),
      reviewUrl: d.reviewUrl?.trim() ?? '',
    });

    if (originalId === null) {
      product.id = this.uniqueId(slugify(`${d.brand} ${name}`) || 'producto');
      this.products.update((list) => [product, ...list]);
    } else {
      this.products.update((list) => list.map((p) => (p.id === originalId ? product : p)));
    }
    this.draft.set(null);
  }

  protected deleteDraft() {
    const d = this.draft();
    if (!d?.originalId) return;
    if (!confirm(`¿Eliminar "${d.name}" del catálogo? Se borra al publicar los cambios.`)) return;
    this.products.update((list) => list.filter((p) => p.id !== d.originalId));
    this.draft.set(null);
  }

  protected addHighlight() {
    const text = this.newHighlight.trim();
    const d = this.draft();
    if (!text || !d) return;
    if (!d.highlights.includes(text)) d.highlights.push(text);
    this.newHighlight = '';
  }

  protected removeAt<T>(list: T[], index: number) {
    list.splice(index, 1);
  }

  protected moveAt<T>(list: T[], index: number, delta: number) {
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
  }

  protected addSpec() {
    this.draft()?.specs.push({ label: '', value: '' });
  }

  protected async addPhotos(input: HTMLInputElement) {
    const d = this.draft();
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!d || !files.length) return;

    this.processing.set(true);
    this.draftError.set(null);
    try {
      const base = slugify(`${d.brand} ${d.name}`) || 'foto';
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const { blob, base64 } = await compressImage(file);
        const path = `${IMAGES_DIR}/${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.webp`;
        const url = URL.createObjectURL(blob);
        this.pending.update((m) => new Map(m).set(path, { base64, url }));
        d.images.push(path);
      }
    } catch {
      this.draftError.set('No se pudo procesar una de las fotos. Probá con un JPG o PNG.');
    } finally {
      this.processing.set(false);
    }
  }

  protected warnUnsaved(e: BeforeUnloadEvent) {
    if (this.dirty()) e.preventDefault();
  }

  protected interestFor(id: string) {
    return this.interest()[id] ?? 0;
  }

  private async loadInterest() {
    try {
      this.interest.set(await this.auth.interestStats());
    } catch {
      /* counter not set up yet: the column just stays hidden */
    }
  }

  private uniqueId(base: string) {
    const ids = new Set(this.products().map((p) => p.id));
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    return id;
  }

  private clearPending() {
    this.pending().forEach((p) => URL.revokeObjectURL(p.url));
    this.pending.set(new Map());
  }
}

/** Keeps soldAt in sync with the status, so the site can hide sold items after a while. */
function stampSold(p: Product): Product {
  if (p.status === 'vendido') return p.soldAt ? p : { ...p, soldAt: new Date().toISOString().slice(0, 10) };
  const { soldAt: _, ...rest } = p;
  return rest;
}
