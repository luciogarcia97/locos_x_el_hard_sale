import { Component, inject } from '@angular/core';
import { AuthService } from './auth.service';

/** #login, and what #admin shows while the account is being checked or has no permission. */
@Component({
  selector: 'app-login',
  template: `
    <main class="login">
      <div class="login-card">
        <a class="login-logo" href="./" aria-label="Volver a la web">
          <img src="images/logo.webp" alt="" width="96" height="96" />
        </a>

        @switch (auth.status()) {
          @case ('admin') {
            <h1>Hola, {{ auth.user()?.name || auth.user()?.login }}</h1>
            <p>Ya ingresaste con una cuenta que puede administrar la Garage Sale.</p>
            <div class="login-actions">
              <a class="btn btn-primary" href="#admin">Ir al panel</a>
              <button class="btn btn-ghost" type="button" (click)="logout()">Salir</button>
            </div>
          }
          @case ('user') {
            <h1>Esta cuenta no es administradora</h1>
            <p>
              Ingresaste como <strong>&#64;{{ auth.user()?.login }}</strong>, pero solo las cuentas que colaboran en el
              repositorio de la web pueden editar el catálogo. Pedile a quien lo administra que te agregue como colaborador.
            </p>
            <div class="login-actions">
              <button class="btn btn-ghost" type="button" (click)="logout()">Salir</button>
              <a class="btn btn-ghost" href="./">Volver a la web</a>
            </div>
          }
          @case ('anon') {
            <h1>Ingresá para administrar</h1>
            <p>El panel de la Garage Sale es solo para el equipo de Locos por el Hardware. Se entra con tu cuenta de GitHub.</p>
            @if (auth.error()) {
              <p class="adm-msg adm-msg-error" role="alert">{{ auth.error() }}</p>
            }
            <div class="login-actions">
              <button class="btn btn-primary btn-github" type="button" (click)="auth.login('admin')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.3 4.8 18.3 5.1 18.3 5.1c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>
                Ingresar con GitHub
              </button>
              <a class="btn btn-ghost" href="./">Volver a la web</a>
            </div>
          }
          @case ('unconfigured') {
            <h1>El ingreso todavía no está configurado</h1>
            <p>
              Falta cargar la GitHub App y el Worker de Cloudflare en <code>public/data/config.json</code>
              (<code>auth.clientId</code> y <code>auth.workerUrl</code>). Los pasos están en el README, en la sección
              "Ingreso de administradores".
            </p>
            <div class="login-actions"><a class="btn btn-ghost" href="./">Volver a la web</a></div>
          }
          @case ('error') {
            <h1>No pudimos verificar tu cuenta</h1>
            <p class="adm-msg adm-msg-error" role="alert">{{ auth.error() }}</p>
            <div class="login-actions">
              <button class="btn btn-primary" type="button" (click)="reload()">Reintentar</button>
              <button class="btn btn-ghost" type="button" (click)="logout()">Salir</button>
            </div>
          }
          @default {
            <h1>Verificando tu cuenta…</h1>
            <p>Un segundo: estamos consultando tus permisos en GitHub.</p>
          }
        }
      </div>
    </main>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);

  protected logout() {
    this.auth.logout();
    location.hash = '';
  }

  protected reload() {
    location.reload();
  }
}
