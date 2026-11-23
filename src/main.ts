import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// GitHub Pages can't send X-Frame-Options, so refuse to run inside someone else's frame
// (keeps the admin panel from being overlaid by a page that tricks clicks).
if (window.top !== window.self) {
  document.body.textContent = 'Abrí la Garage Sale directamente: https://luciogarcia97.github.io/locos_x_el_hard_sale/';
} else {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
