
import { Novel } from './types.ts';

export const BOOKS: Novel[] = [
  {
    id: '1',
    title: 'Moby Dick',
    author: 'Herman Melville',
    coverUrl: 'https://picsum.photos/seed/moby-dick/400/600',
    volumes: [{
      id: '1-1',
      title: 'Moby Dick',
      epubUrl: 'https://s3.amazonaws.com/moby-dick/moby-dick.epub',
    }]
  },
  {
    id: '2',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    coverUrl: 'https://picsum.photos/seed/alice/400/600',
    volumes: [{
      id: '2-1',
      title: "Alice's Adventures in Wonderland",
      epubUrl: 'https://s3.amazonaws.com/epubjs/books/alice.epub'
    }]
  },
  {
    id: '3',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    coverUrl: 'https://picsum.photos/seed/gatsby/400/600',
    volumes: [{
      id: '3-1',
      title: 'The Great Gatsby',
      epubUrl: 'https://s3.amazonaws.com/epubjs/books/gatsby.epub'
    }]
  },
    {
    id: '4',
    title: 'A Princess of Mars',
    author: 'Edgar Rice Burroughs',
    coverUrl: 'https://picsum.photos/seed/mars/400/600',
    volumes: [{
      id: '4-1',
      title: 'A Princess of Mars',
      epubUrl: 'https://s3.amazonaws.com/epubjs/books/pride-and-prejudice.epub'
    }]
  },
  {
    id: '5',
    title: 'Metamorphosis',
    author: 'Franz Kafka',
    coverUrl: 'https://picsum.photos/seed/metamorphosis/400/600',
    volumes: [{
      id: '5-1',
      title: 'Metamorphosis',
      epubUrl: 'https://s3.amazonaws.com/epubjs/books/metamorphosis.epub'
    }]
  }
];