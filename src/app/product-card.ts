import { Component, computed, inject, input, output } from '@angular/core';
import { CatalogService } from './catalog.service';
import { Product, formatPrice } from './models';
import { ProductImage } from './product-image';

@Component({
  selector: 'app-product-card',
  imports: [ProductImage],
  template: `
    @let p = product();
    <article class="card" [class.sold]="p.status === 'vendido'">
      <button class="card-media" type="button" (click)="open.emit(p)" [attr.aria-label]="'Ver ' + p.name">
        <app-product-image [src]="p.images[0]" [alt]="p.name" [category]="p.category" />
        <span class="origin" [class.used]="p.origin === 'Usado'">{{ p.origin }}</span>
        @if (p.status === 'vendido') {
          <span class="stamp">Vendido</span>
        } @else if (p.status === 'reservado') {
          <span class="stamp stamp-reserved">Reservado</span>
        }
        <span class="price-tag">{{ price() }}</span>
      </button>

      <button
        class="fav"
        type="button"
        [class.on]="isFav()"
        [disabled]="p.status === 'vendido'"
        (click)="catalog.toggleFavorite(p.id)"
        [attr.aria-pressed]="isFav()"
        [attr.aria-label]="isFav() ? 'Quitar de favoritos' : 'Agregar a favoritos'"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.3 4 7.2 4c2 0 3.6 1.1 4.8 2.7C13.2 5.1 14.8 4 16.8 4 20.7 4 23 8 21.5 11.7 19.5 16.4 12 21 12 21z" />
        </svg>
      </button>

      <div class="card-body">
        <p class="brand">{{ p.brand }}</p>
        <h3>{{ p.name }}</h3>
        <ul class="chips">
          @for (h of p.highlights; track h) {
            <li>{{ h }}</li>
          }
        </ul>
        <div class="card-foot">
          <button class="btn btn-ghost btn-sm" type="button" (click)="open.emit(p)">Ver specs</button>
          @if (p.status === 'vendido') {
            <span class="muted">Ya tiene dueño</span>
          } @else {
            <button class="btn btn-primary btn-sm" type="button" (click)="interest.emit([p])">Me interesa</button>
          }
        </div>
      </div>
    </article>
  `,
})
export class ProductCard {
  protected readonly catalog = inject(CatalogService);
  readonly product = input.required<Product>();
  readonly open = output<Product>();
  readonly interest = output<Product[]>();

  protected readonly price = computed(() => formatPrice(this.product().price));
  protected readonly isFav = computed(() => this.catalog.favorites().has(this.product().id));
}
