import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CatalogService } from './catalog.service';
import { Product, formatPrice } from './models';
import { ProductImage } from './product-image';

@Component({
  selector: 'app-product-detail',
  imports: [ProductImage],
  template: `
    @let p = product();
    <div class="backdrop" (click)="close.emit()"></div>
    <div class="dialog dialog-wide" role="dialog" aria-modal="true" [attr.aria-label]="p.name">
      <button class="close" type="button" (click)="close.emit()" aria-label="Cerrar">✕</button>

      <div class="detail">
        <div class="gallery">
          <div class="gallery-main">
            <app-product-image [src]="p.images[index()]" [alt]="p.name" [category]="p.category" />
            @if (p.images.length > 1) {
              <button class="nav prev" type="button" (click)="step(-1)" aria-label="Foto anterior">‹</button>
              <button class="nav next" type="button" (click)="step(1)" aria-label="Foto siguiente">›</button>
            }
          </div>
          @if (p.images.length > 1) {
            <div class="thumbs">
              @for (img of p.images; track img; let i = $index) {
                <button type="button" [class.active]="i === index()" (click)="index.set(i)" [attr.aria-label]="'Foto ' + (i + 1)">
                  <img [src]="img" alt="" />
                </button>
              }
            </div>
          }
        </div>

        <div class="detail-info">
          <p class="brand">{{ p.brand }}</p>
          <h2>{{ p.name }}</h2>
          <div class="tags">
            <span class="status status-{{ p.status }}">{{ p.status }}</span>
            <span class="tag">{{ p.origin }}</span>
            <span class="tag">{{ p.condition }}</span>
          </div>
          <p class="price price-lg">{{ price() }}</p>
          @if (p.description) {
            <p class="desc">{{ p.description }}</p>
          }

          @if (p.specs.length) {
            <h4>Características</h4>
            <dl class="specs">
              @for (s of p.specs; track s.label) {
                <dt>{{ s.label }}</dt>
                <dd>{{ s.value }}</dd>
              }
            </dl>
          }

          <div class="detail-actions">
            @if (p.status !== 'vendido') {
              <button class="btn btn-primary" type="button" (click)="interest.emit([p])">Me interesa</button>
              <button class="btn btn-ghost" type="button" (click)="catalog.toggleFavorite(p.id)">
                {{ isFav() ? '♥ En favoritos' : '♡ Guardar' }}
              </button>
            } @else {
              <p class="muted">Este producto ya se vendió.</p>
            }
            @if (p.reviewUrl) {
              <a class="btn btn-ghost" [href]="p.reviewUrl" target="_blank" rel="noopener">▶ Ver la review</a>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  host: { '(document:keydown.escape)': 'close.emit()' },
})
export class ProductDetail {
  protected readonly catalog = inject(CatalogService);
  readonly product = input.required<Product>();
  readonly close = output<void>();
  readonly interest = output<Product[]>();

  protected readonly index = signal(0);
  protected readonly price = computed(() => formatPrice(this.product().price));
  protected readonly isFav = computed(() => this.catalog.favorites().has(this.product().id));

  protected step(delta: number) {
    const n = this.product().images.length;
    this.index.update((i) => (i + delta + n) % n);
  }
}
