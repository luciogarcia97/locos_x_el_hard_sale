import { Component, input } from '@angular/core';

/** Shows a product photo, or a branded placeholder when the product has no photos yet. */
@Component({
  selector: 'app-product-image',
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="alt()" loading="lazy" />
    } @else {
      <div class="placeholder" [attr.aria-label]="alt()">
        @if (category() === 'Auriculares') {
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="M12 38v-6a20 20 0 0 1 40 0v6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
            <rect x="8" y="36" width="12" height="18" rx="4" fill="currentColor" />
            <rect x="44" y="36" width="12" height="18" rx="4" fill="currentColor" />
          </svg>
        } @else {
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect x="4" y="18" width="56" height="28" rx="5" fill="none" stroke="currentColor" stroke-width="4" />
            @for (x of keys; track x) {
              <rect [attr.x]="x" y="24" width="6" height="5" rx="1" fill="currentColor" />
              <rect [attr.x]="x" y="32" width="6" height="5" rx="1" fill="currentColor" />
            }
            <rect x="18" y="39" width="28" height="4" rx="1" fill="currentColor" />
          </svg>
        }
        <span>Fotos próximamente</span>
      </div>
    }
  `,
  host: { class: 'product-image' },
})
export class ProductImage {
  readonly src = input<string | undefined>();
  readonly alt = input('');
  readonly category = input('');
  protected readonly keys = [10, 18, 26, 34, 42, 50];
}
