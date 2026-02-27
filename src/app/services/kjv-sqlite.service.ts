import { Injectable, signal } from '@angular/core';

import type { KjvSqliteBook, KjvSqliteVerse } from '../models/kjv-sqlite.model';

interface InitWorkerRequest {
  id: number;
  type: 'init';
}

interface GetBooksWorkerRequest {
  id: number;
  type: 'getBooks';
}

interface GetChapterWorkerRequest {
  id: number;
  type: 'getChapter';
  book: string;
  chapter: number;
}

interface SearchWorkerRequest {
  id: number;
  type: 'search';
  searchText: string;
  limit: number;
}

type WorkerRequest =
  | InitWorkerRequest
  | GetBooksWorkerRequest
  | GetChapterWorkerRequest
  | SearchWorkerRequest;

type WorkerRequestWithoutId = Omit<InitWorkerRequest, 'id'>
  | Omit<GetBooksWorkerRequest, 'id'>
  | Omit<GetChapterWorkerRequest, 'id'>
  | Omit<SearchWorkerRequest, 'id'>;

interface WorkerSuccessResponse<T> {
  id: number;
  ok: true;
  result: T;
}

interface WorkerErrorResponse {
  id: number;
  ok: false;
  error: string;
}

type WorkerResponse<T> = WorkerSuccessResponse<T> | WorkerErrorResponse;

interface PendingRequest<T> {
  reject: (reason: unknown) => void;
  resolve: (value: T) => void;
}

@Injectable({
  providedIn: 'root',
})
export class KjvSqliteService {
  private readonly isReadyState = signal(false);
  private readonly initErrorState = signal<string | null>(null);

  private initialization: Promise<void> | null = null;
  private worker: Worker | null = null;
  private requestId = 0;
  private readonly pendingRequests = new Map<number, PendingRequest<unknown>>();

  readonly isReady = this.isReadyState.asReadonly();
  readonly initError = this.initErrorState.asReadonly();

  async load(): Promise<void> {
    if (this.isReadyState()) {
      return;
    }

    if (this.initialization === null) {
      this.initialization = this.initializeWorker();
    }

    return this.initialization;
  }

  async getBooks(): Promise<readonly KjvSqliteBook[]> {
    await this.load();
    return this.request<readonly KjvSqliteBook[]>({ type: 'getBooks' });
  }

  async getChapterVerses(book: string, chapter: number): Promise<readonly KjvSqliteVerse[]> {
    await this.load();
    return this.request<readonly KjvSqliteVerse[]>({
      type: 'getChapter',
      book,
      chapter,
    });
  }

  async searchVerses(searchText: string, limit = 50): Promise<readonly KjvSqliteVerse[]> {
    const trimmedText = searchText.trim();
    if (!trimmedText) {
      return [];
    }

    const normalizedLimit = Math.max(1, Math.min(limit, 500));
    await this.load();
    return this.request<readonly KjvSqliteVerse[]>({
      type: 'search',
      searchText: trimmedText,
      limit: normalizedLimit,
    });
  }

  close(): void {
    if (this.worker !== null) {
      this.worker.terminate();
      this.worker = null;
    }

    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(new Error('SQLite worker was closed before the request completed.'));
    }
    this.pendingRequests.clear();

    this.initialization = null;
    this.isReadyState.set(false);
    this.initErrorState.set(null);
  }

  private async initializeWorker(): Promise<void> {
    try {
      await this.request<void>({ type: 'init' });
      this.initErrorState.set(null);
      this.isReadyState.set(true);
    } catch (error) {
      this.isReadyState.set(false);
      this.initErrorState.set(
        error instanceof Error ? error.message : 'Unable to initialize SQLite worker.'
      );
      throw error;
    } finally {
      this.initialization = null;
    }
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('../workers/kjv-sqlite.worker', import.meta.url));
    worker.onmessage = (event: MessageEvent<WorkerResponse<unknown>>) => {
      const message = event.data;
      const pendingRequest = this.pendingRequests.get(message.id);
      if (!pendingRequest) {
        return;
      }

      this.pendingRequests.delete(message.id);
      if (message.ok) {
        pendingRequest.resolve(message.result);
        return;
      }

      pendingRequest.reject(new Error(message.error));
    };

    worker.onerror = (event: ErrorEvent) => {
      for (const pendingRequest of this.pendingRequests.values()) {
        pendingRequest.reject(new Error(event.message));
      }
      this.pendingRequests.clear();
      this.worker = null;
      this.isReadyState.set(false);
      this.initErrorState.set(event.message || 'SQLite worker crashed.');
    };

    return worker;
  }

  private requireWorker(): Worker {
    if (this.worker !== null) {
      return this.worker;
    }

    this.worker = this.createWorker();
    return this.worker;
  }

  private request<T>(request: WorkerRequestWithoutId): Promise<T> {
    const worker = this.requireWorker();
    const id = ++this.requestId;

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      worker.postMessage({
        ...request,
        id,
      } as WorkerRequest);
    });
  }
}
