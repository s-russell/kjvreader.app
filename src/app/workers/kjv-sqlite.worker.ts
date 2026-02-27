import initSqlJs from 'sql.js';
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

let database: SqlDatabase | null = null;
let sqlModulePromise: Promise<SqlModule> | null = null;
let databaseInitialization: Promise<void> | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
};

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    switch (request.type) {
      case 'init':
        await initializeDatabase();
        return postSuccess(request.id, undefined);
      case 'getBooks':
        await initializeDatabase();
        return postSuccess(request.id, getBooks());
      case 'getChapter':
        await initializeDatabase();
        return postSuccess(request.id, getChapter(request.book, request.chapter));
      case 'search':
        await initializeDatabase();
        return postSuccess(request.id, search(request.searchText, request.limit));
      default:
        return postError(
          (request as { id: number }).id,
          `Unsupported request type: ${(request as { type: string }).type}`
        );
    }
  } catch (error) {
    return postError(request.id, error instanceof Error ? error.message : 'Unknown worker error.');
  }
}

function postSuccess<T>(id: number, result: T): void {
  self.postMessage({
    id,
    ok: true,
    result,
  } satisfies WorkerSuccessResponse<T>);
}

function postError(id: number, error: string): void {
  self.postMessage({
    id,
    ok: false,
    error,
  } satisfies WorkerErrorResponse);
}

async function initializeDatabase(): Promise<void> {
  if (database !== null) {
    return;
  }
  if (databaseInitialization !== null) {
    return databaseInitialization;
  }

  databaseInitialization = (async () => {
    const sqlModule = await loadSqlModule();
    const response = await fetch('/kjv.sqlite');
    if (!response.ok) {
      throw new Error(`Unable to fetch /kjv.sqlite (HTTP ${response.status}).`);
    }

    const databaseBytes = new Uint8Array(await response.arrayBuffer());
    database = new sqlModule.Database(databaseBytes);
  })().finally(() => {
    databaseInitialization = null;
  });

  return databaseInitialization;
}

async function loadSqlModule(): Promise<SqlModule> {
  if (sqlModulePromise !== null) {
    return sqlModulePromise;
  }

  sqlModulePromise = (async (): Promise<SqlModule> => {
    const wasmUrl = new URL('/assets/sql.js/sql-wasm.wasm', self.location.origin).toString();
    const wasmBinary = await fetchWasmBinary(wasmUrl);

    const module = await initSqlJs({
      locateFile: () => wasmUrl,
      wasmBinary,
    });
    return module as unknown as SqlModule;
  })();

  return sqlModulePromise;
}

async function fetchWasmBinary(wasmUrl: string): Promise<Uint8Array> {
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch SQLite wasm at ${wasmUrl} (HTTP ${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isWasmBinary(bytes)) {
    const preview = bytes
      .slice(0, 16)
      .reduce((text, byte) => text + String.fromCharCode(byte), '')
      .replace(/\s+/g, ' ')
      .trim();
    throw new Error(
      `SQLite wasm fetch returned non-binary content at ${wasmUrl}. Response starts with: "${preview}".`
    );
  }

  return bytes;
}

function isWasmBinary(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d
  );
}

function getBooks(): readonly KjvSqliteBook[] {
  return query(
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
      bookIndex: asNumber(row['book_index'], 'book_index'),
      osisId: asString(row['osis_id'], 'osis_id'),
      ordinal: asNullableNumber(row['ordinal'], 'ordinal'),
      bookName: asString(row['book_name'], 'book_name'),
      displayName: asString(row['display_name'], 'display_name'),
    })
  );
}

function getChapter(book: string, chapter: number): readonly KjvSqliteVerse[] {
  return query(
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
      book: asString(row['book'], 'book'),
      chapter: asNumber(row['chapter'], 'chapter'),
      paragraphId: asNumber(row['paragraph_id'], 'paragraph_id'),
      verseNumber: asString(row['verse_number'], 'verse_number'),
      verseText: asNullableString(row['verse_text'], 'verse_text'),
      title: asNullableString(row['title'], 'title'),
    })
  );
}

function search(searchText: string, limit: number): readonly KjvSqliteVerse[] {
  return query(
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
    [`%${searchText}%`, limit],
    (row) => ({
      book: asString(row['book'], 'book'),
      chapter: asNumber(row['chapter'], 'chapter'),
      paragraphId: asNumber(row['paragraph_id'], 'paragraph_id'),
      verseNumber: asString(row['verse_number'], 'verse_number'),
      verseText: asNullableString(row['verse_text'], 'verse_text'),
      title: asNullableString(row['title'], 'title'),
    })
  );
}

function query<T>(
  sql: string,
  params: readonly SqlValue[],
  mapRow: (row: SqlRow) => T
): readonly T[] {
  const statement = requireDatabase().prepare(sql);
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

function requireDatabase(): SqlDatabase {
  if (database === null) {
    throw new Error('SQLite database is not initialized in worker.');
  }

  return database;
}

function asString(value: SqlValue, columnName: string): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }

  throw new Error(
    `Expected ${columnName} to be a string, got ${value === null ? 'null' : 'binary'}.`
  );
}

function asNullableString(value: SqlValue, columnName: string): string | null {
  if (value === null) {
    return null;
  }

  return asString(value, columnName);
}

function asNumber(value: SqlValue, columnName: string): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  throw new Error(`Expected ${columnName} to be numeric, got ${value === null ? 'null' : typeof value}.`);
}

function asNullableNumber(value: SqlValue, columnName: string): number | null {
  if (value === null) {
    return null;
  }

  return asNumber(value, columnName);
}
