import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';

import { KjvDataService } from './services/kjv-data.service';

const OFFLINE_CACHE_PRIMED_KEY = 'kjvreader.sqlite.cache-primed';

type StartupState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'kjv-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnDestroy {
  private readonly kjvDataService = inject(KjvDataService);

  private readonly startupStateSignal = signal<StartupState>('loading');
  private readonly errorMessageSignal = signal<string | null>(null);
  private readonly isOnlineSignal = signal(this.readIsOnline());
  private readonly isOfflineReadySignal = signal(this.detectOfflineReady());
  private readonly booksSignal = signal(this.kjvDataService.kjvBooks);

  protected readonly startupState = this.startupStateSignal.asReadonly();
  protected readonly errorMessage = this.errorMessageSignal.asReadonly();
  protected readonly books = this.booksSignal.asReadonly();
  protected readonly statusMessage = computed(() => {
    if (this.startupStateSignal() === 'loading' && !this.isOfflineReadySignal()) {
      return 'Preparing offline Bible database. Keep this tab open while setup completes.';
    }

    if (this.startupStateSignal() === 'ready' && this.isOfflineReadySignal()) {
      return 'Offline reading is ready for this device.';
    }

    if (this.startupStateSignal() === 'ready') {
      return 'Database loaded. Reload once to let the service worker take control for offline mode.';
    }

    if (!this.isOnlineSignal()) {
      return 'Database setup failed while offline. Connect to the internet once to finish setup.';
    }

    return 'Database setup failed. Retry while online.';
  });
  protected readonly totalBooks = computed(() => this.booksSignal().length);
  protected readonly previewBooks = computed(() => this.booksSignal().slice(0, 5));

  constructor() {
    this.attachConnectivityListeners();
    void this.initialize();
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.handleConnectivityChange);
    window.removeEventListener('offline', this.handleConnectivityChange);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('controllerchange', this.handleConnectivityChange);
    }
  }

  protected async retryInitialization(): Promise<void> {
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    this.startupStateSignal.set('loading');
    this.errorMessageSignal.set(null);

    try {
      await this.kjvDataService.load();
      this.booksSignal.set(this.kjvDataService.kjvBooks);
      this.markOfflineCachePrimed();
      this.isOfflineReadySignal.set(this.detectOfflineReady());
      this.startupStateSignal.set('ready');
    } catch (error) {
      this.startupStateSignal.set('error');
      this.errorMessageSignal.set(
        error instanceof Error ? error.message : 'Unable to initialize KJV SQLite database.'
      );
    }
  }

  private attachConnectivityListeners(): void {
    window.addEventListener('online', this.handleConnectivityChange);
    window.addEventListener('offline', this.handleConnectivityChange);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', this.handleConnectivityChange);
    }
  }

  private readonly handleConnectivityChange = (): void => {
    this.isOnlineSignal.set(this.readIsOnline());
    this.isOfflineReadySignal.set(this.detectOfflineReady());
  };

  private readIsOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine;
  }

  private markOfflineCachePrimed(): void {
    try {
      localStorage.setItem(OFFLINE_CACHE_PRIMED_KEY, '1');
    } catch {
      // Ignore storage failures in restricted browsing modes.
    }
  }

  private hasOfflineCachePrimed(): boolean {
    try {
      return localStorage.getItem(OFFLINE_CACHE_PRIMED_KEY) === '1';
    } catch {
      return false;
    }
  }

  private detectOfflineReady(): boolean {
    const hasServiceWorkerControl =
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      navigator.serviceWorker.controller !== null;
    return this.hasOfflineCachePrimed() && hasServiceWorkerControl;
  }
}
