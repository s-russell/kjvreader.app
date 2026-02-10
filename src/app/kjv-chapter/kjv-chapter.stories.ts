import type { Meta, StoryObj } from '@storybook/angular';

import { KjvChapterComponent } from './kjv-chapter';
import type { KjvChapter } from '../models/kjv.model';

const sampleChapter: KjvChapter = {
  osis_ref: 'Gen.1',
  n: '1',
  sid: 'Gen.1',
  titles: [{ text: 'Genesis', type: null, short: 'Gen' }],
  paragraphs: [
    {
      verses: [
        {
          osis_id: 'Gen.1.1',
          n: '1',
          sid: 'Gen.1.1',
          titles: [],
          nodes: [{ text: 'In the beginning God created the heaven and the earth.' }]
        },
        {
          osis_id: 'Gen.1.2',
          n: '2',
          sid: 'Gen.1.2',
          titles: [],
          nodes: [
            { text: 'And the earth was without form, and void;' },
            { text: 'and darkness was upon the face of the deep.' }
          ]
        }
      ]
    },
    {
      verses: [
        {
          osis_id: 'Gen.1.3',
          n: '3',
          sid: 'Gen.1.3',
          titles: [],
          nodes: [{ text: 'And God said, Let there be light: and there was light.' }]
        }
      ]
    }
  ]
};

const meta: Meta<KjvChapterComponent> = {
  title: 'KJV/KjvChapter',
  component: KjvChapterComponent,
  args: {
    chapter: sampleChapter
  }
};

export default meta;
type Story = StoryObj<KjvChapterComponent>;

export const Default: Story = {};

