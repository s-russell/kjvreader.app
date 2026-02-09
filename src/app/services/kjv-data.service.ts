import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { KjvBook } from '../models/kjv.model';

@Injectable({
  providedIn: 'root'
})
export class KjvDataService {
  private books: readonly KjvBook[] = [];

  constructor(private readonly http: HttpClient) {}

  async load(): Promise<void> {
    if (this.books.length > 0) {
      return;
    }

    const data = await firstValueFrom(this.http.get<KjvBook[]>('/kjv.json'));
    this.books = data;
  }

  get kjvBooks(): readonly KjvBook[] {
    return this.books;
  }
}
