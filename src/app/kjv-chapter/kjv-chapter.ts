import { Component, computed, input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';

import type { KjvChapter, KjvVerse } from '../models/kjv.model';

@Component({
  selector: 'kjv-chapter',
  imports: [NgFor, NgIf],
  templateUrl: './kjv-chapter.html',
  styleUrl: './kjv-chapter.css'
})
export class KjvChapterComponent {
  readonly chapter = input.required<KjvChapter>();

  protected readonly title = computed(() => {
    const titles = this.chapter().titles;
    if (!titles?.length) {
      return null;
    }
    const first = titles[0];
    return first.short || first.text || null;
  });

  protected verseText(verse: KjvVerse): string {
    // Nodes can be granular (words/phrases). Join and normalize whitespace for display.
    const raw = (verse.nodes ?? []).map(n => n.text).join(' ');
    return raw.replace(/\s+/g, ' ').trim();
  }
}

