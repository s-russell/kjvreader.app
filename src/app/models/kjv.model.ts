export interface KjvTitle {
  text: string;
  type: string | null;
  short: string | null;
}

export interface KjvNode {
  text: string;
  change_type?: string;
}

export interface KjvVerse {
  osis_id: string;
  n: string;
  sid: string;
  titles: KjvTitle[];
  nodes: KjvNode[];
}

export interface KjvParagraph {
  verses: KjvVerse[];
}

export interface KjvChapter {
  osis_ref: string;
  n: string;
  sid: string;
  titles: KjvTitle[];
  paragraphs: KjvParagraph[];
}

export interface KjvBook {
  osis_id: string;
  name: string;
  titles: KjvTitle[];
  chapters: KjvChapter[];
}

export type KjvData = KjvBook[];
