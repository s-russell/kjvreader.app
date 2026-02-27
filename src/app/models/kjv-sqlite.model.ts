export interface KjvSqliteBook {
  bookIndex: number;
  osisId: string;
  ordinal: number | null;
  bookName: string;
  displayName: string;
}

export interface KjvSqliteVerse {
  book: string;
  chapter: number;
  paragraphId: number;
  verseNumber: string;
  verseText: string | null;
  title: string | null;
}
