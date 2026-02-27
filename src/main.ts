import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

if (!isDevMode() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/ngsw-worker.js');
  });
}
