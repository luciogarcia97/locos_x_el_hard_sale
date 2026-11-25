import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// No X-Frame-Options header is sent, so refuse to run inside someone else's frame
// (keeps the admin panel from being overlaid by a page that tricks clicks).
if (window.top !== window.self) {
  document.body.textContent = 'Abrí la Garage Sale directamente: https://locosporelhardware.pages.dev/';
} else {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
