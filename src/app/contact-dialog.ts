import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CatalogService } from './catalog.service';
import { Product } from './models';

/**
 * "Me interesa" flow. Not a checkout: it builds a ready-to-send message and
 * opens Instagram DM (or WhatsApp, if configured) so the buyer talks directly to Locos.
 */
@Component({
  selector: 'app-contact-dialog',
  template: `
    <div class="backdrop" (click)="close.emit()"></div>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="contact-title">
      <button class="close" type="button" (click)="close.emit()" aria-label="Cerrar">✕</button>
      <h2 id="contact-title">¡Buenísimo!</h2>
      <p class="muted">
        Las ventas se coordinan por mensaje privado. Copiá este mensaje y mandáselo a
        <strong>&#64;{{ cfg()?.instagram }}</strong>:
      </p>

      <textarea rows="6" [value]="message()" readonly aria-label="Mensaje para enviar"></textarea>

      <div class="contact-actions">
        <button class="btn btn-primary" type="button" (click)="openInstagram()">
          {{ copied() ? '✓ Copiado, abriendo Instagram…' : 'Copiar mensaje y abrir Instagram' }}
        </button>
        @if (cfg()?.whatsapp) {
          <a class="btn btn-whatsapp" [href]="whatsappUrl()" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        }
        <button class="btn btn-ghost" type="button" (click)="copy()">Solo copiar</button>
      </div>

      <p class="fine">{{ cfg()?.zone }} · {{ cfg()?.shipping }}</p>
    </div>
  `,
  host: { '(document:keydown.escape)': 'close.emit()' },
})
export class ContactDialog {
  private readonly catalog = inject(CatalogService);
  readonly items = input.required<Product[]>();
  readonly close = output<void>();

  protected readonly cfg = this.catalog.config;
  protected readonly copied = signal(false);
  protected readonly message = computed(() => this.catalog.buildMessage(this.items()));
  protected readonly whatsappUrl = computed(
    () => `https://wa.me/${this.cfg()?.whatsapp}?text=${encodeURIComponent(this.message())}`,
  );

  protected async copy() {
    try {
      await navigator.clipboard.writeText(this.message());
      this.copied.set(true);
    } catch {
      /* clipboard blocked: the text is still visible to copy by hand */
    }
  }

  protected async openInstagram() {
    // Instagram DMs can't be pre-filled via URL, so we copy the text first.
    await this.copy();
    window.open(`https://ig.me/m/${this.cfg()?.instagram}`, '_blank', 'noopener');
  }
}
