import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import type { KjvSqliteBook, KjvSqliteVerse } from '../models/kjv-sqlite.model';

type SqlValue = number | string | Uint8Array | null;
type SqlRow = Record<string, SqlValue>;

interface SqlStatement {
  bind(values: readonly SqlValue[]): void;
  step(): boolean;
  getAsObject(params?: readonly SqlValue[]): SqlRow;
  free(): void;
}

interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  close(): void;
}

interface SqlModule {
  Database: new (data?: Uint8Array) => SqlDatabase;
}

interface SqlJsWindow extends Window {
  initSqlJs?: (config: { locateFile: (filename: string) => string }) => Promise<SqlModule>;
}

@Injectable({
  providedIn: 'root',
})
export class KjvSqliteService {
  private readonly http = inject(HttpClient);

  private readonly isReadyState = signal(false);
  private readonly initErrorState = signal<string | null>(null);

  private initialization: Promise<void> | null = null;
  private sqlModuleLoading: Promise<SqlModule> | null = null;
  private sqlScriptLoading: Promise<void> | null = null;
  private database: SqlDatabase | null = null;

  readonly isReady = this.isReadyState.asReadonly();
  readonly initError = this.initErrorState.asReadonly();

  async load(): Promise<void> {
    if (this.database !== null) {
      return;
    }

    if (this.initialization === null) {
      this.initialization = this.initializeDatabase();
    }

    return this.initialization;
  }

  async getBooks(): Promise<readonly KjvSqliteBook[]> {
    await this.load();

    return this.query(
      `
      SELECT
        book_index,
        osis_id,
        ordinal,
        book_name,
        TRIM(COALESCE(CAST(ordinal AS TEXT) || ' ', '') || book_name) AS display_name
      FROM books
      ORDER BY book_index
      `,
      [],
      (row) => ({
        bookIndex: this.asNumber(row['book_index'], 'book_index'),
        osisId: this.asString(row['osis_id'], 'osis_id'),
        ordinal: this.asNullableNumber(row['ordinal'], 'ordinal'),
        bookName: this.asString(row['book_name'], 'book_name'),
        displayName: this.asString(row['display_name'], 'display_name'),
      })
    );
  }

  async getChapterVerses(book: string, chapter: number): Promise<readonly KjvSqliteVerse[]> {
    await this.load();

    return this.query(
      `
      SELECT
        book,
        CAST(chapter AS INTEGER) AS chapter,
        paragraph_id,
        verse_number,
        verse_text,
        title
      FROM kjv_vw
      WHERE book = ? AND CAST(chapter AS INTEGER) = ?
      ORDER BY paragraph_id, CAST(verse_number AS INTEGER), verse_number
      `,
      [book, chapter],
      (row) => ({
        book: this.asString(row['book'], 'book'),
        chapter: this.asNumber(row['chapter'], 'chapter'),
        paragraphId: this.asNumber(row['paragraph_id'], 'paragraph_id'),
        verseNumber: this.asString(row['verse_number'], 'verse_number'),
        verseText: this.asNullableString(row['verse_text'], 'verse_text'),
        title: this.asNullableString(row['title'], 'title'),
      })
    );
  }

  async searchVerses(searchText: string, limit = 50): Promise<readonly KjvSqliteVerse[]> {
    const trimmedText = searchText.trim();
    if (!trimmedText) {
      return [];
    }

    await this.load();
    const normalizedLimit = Math.max(1, Math.min(limit, 500));

    return this.query(
      `
      SELECT
        book,
        CAST(chapter AS INTEGER) AS chapter,
        paragraph_id,
        verse_number,
        verse_text,
        title
      FROM kjv_vw
      WHERE verse_text LIKE ?
      ORDER BY book, CAST(chapter AS INTEGER), paragraph_id, CAST(verse_number AS INTEGER)
      LIMIT ?
      `,
      [`%${trimmedText}%`, normalizedLimit],
      (row) => ({
        book: this.asString(row['book'], 'book'),
        chapter: this.asNumber(row['chapter'], 'chapter'),
        paragraphId: this.asNumber(row['paragraph_id'], 'paragraph_id'),
        verseNumber: this.asString(row['verse_number'], 'verse_number'),
        verseText: this.asNullableString(row['verse_text'], 'verse_text'),
        title: this.asNullableString(row['title'], 'title'),
      })
    );
  }

  close(): void {
    if (this.database === null) {
      return;
    }

    this.database.close();
    this.database = null;
    this.isReadyState.set(false);
  }

  private async initializeDatabase(): Promise<void> {
    try {
      const [sqlModule, databaseBuffer] = await Promise.all([
        this.loadSqlModule(),
        firstValueFrom(this.http.get('/kjv.sqlite', { responseType: 'arraybuffer' })),
      ]);

      const databaseBytes = new Uint8Array(databaseBuffer);
      this.database = new sqlModule.Database(databaseBytes);
      this.initErrorState.set(null);
      this.isReadyState.set(true);
    } catch (error) {
      this.database = null;
      this.isReadyState.set(false);
      this.initErrorState.set(
        error instanceof Error ? error.message : 'Unable to initialize SQLite database.'
      );
      throw error;
    } finally {
      this.initialization = null;
    }
  }

  private async loadSqlModule(): Promise<SqlModule> {
    if (this.sqlModuleLoading !== null) {
      return this.sqlModuleLoading;
    }

    this.sqlModuleLoading = this.initializeSqlModule().catch((error) => {
      this.sqlModuleLoading = null;
      throw error;
    });
    return this.sqlModuleLoading;
  }

  private async initializeSqlModule(): Promise<SqlModule> {
    await this.ensureSqlScriptLoaded();

    const sqlWindow = window as SqlJsWindow;
    if (!sqlWindow.initSqlJs) {
      throw new Error('sql.js did not expose initSqlJs on window.');
    }

    return sqlWindow.initSqlJs({
      locateFile: (filename: string) => `/assets/sql.js/${filename}`,
    });
  }

  private async ensureSqlScriptLoaded(): Promise<void> {
    const sqlWindow = window as SqlJsWindow;
    if (sqlWindow.initSqlJs) {
      return;
    }

    if (this.sqlScriptLoading !== null) {
      return this.sqlScriptLoading;
    }

    this.sqlScriptLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/assets/sql.js/sql-wasm.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load /assets/sql.js/sql-wasm.js.'));
      document.head.appendChild(script);
    }).catch((error) => {
      this.sqlScriptLoading = null;
      throw error;
    });

    return this.sqlScriptLoading;
  }

  private query<T>(
    sql: string,
    params: readonly SqlValue[],
    mapRow: (row: SqlRow) => T
  ): readonly T[] {
    const statement = this.requireDatabase().prepare(sql);
    const results: T[] = [];

    try {
      statement.bind(params);
      while (statement.step()) {
        results.push(mapRow(statement.getAsObject()));
      }
    } finally {
      statement.free();
    }

    return results;
  }

  private requireDatabase(): SqlDatabase {
    if (this.database === null) {
      throw new Error('SQLite database has not been loaded. Call load() first.');
    }

    return this.database;
  }

  private asString(value: SqlValue, columnName: string): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }

    throw new Error(`Expected ${columnName} to be a string, got ${value === null ? 'null' : 'binary'}.`);
  }

  private asNullableString(value: SqlValue, columnName: string): string | null {
    if (value === null) {
      return null;
    }

    return this.asString(value, columnName);
  }

  private asNumber(value: SqlValue, columnName: string): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsedValue = Number(value);
      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }

    throw new Error(
      `Expected ${columnName} to be numeric, got ${value === null ? 'null' : typeof value}.`
    );
  }

  private asNullableNumber(value: SqlValue, columnName: string): number | null {
    if (value === null) {
      return null;
    }

    return this.asNumber(value, columnName);
  }
}
