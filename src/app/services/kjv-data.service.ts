import { Injectable, inject } from '@angular/core';

import { KjvBook } from '../models/kjv.model';
import { KjvSqliteService } from './kjv-sqlite.service';

@Injectable({
  providedIn: 'root',
})
export class KjvDataService {
  private readonly sqlite = inject(KjvSqliteService);

  private books: readonly KjvBook[] = [];

  async load(): Promise<void> {
    if (this.books.length > 0) {
      return;
    }

    const sqliteBooks = await this.sqlite.getBooks();
    this.books = sqliteBooks.map((book) => ({
      osis_id: book.osisId,
      name: book.displayName,
      titles: [],
      chapters: [],
    }));
  }

  get kjvBooks(): readonly KjvBook[] {
    return this.books;
  }
}
