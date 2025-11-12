import React from 'react';
import { Novel } from '../types.ts';

interface BookListProps {
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
}

const BookList: React.FC<BookListProps> = ({ novels, onSelectNovel }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8">
      {novels.map((novel) => (
        <div
          key={novel.id}
          className="group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg"
          onClick={() => onSelectNovel(novel)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectNovel(novel);
            }
          }}
        >
          <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-800 shadow-lg">
            <img
              src={novel.coverUrl}
              alt={`Cover of ${novel.title}`}
              className="w-full h-full object-cover object-center transform group-hover:scale-105 transition-transform duration-300"
            />
          </div>
          <div className="mt-4">
            <h3 className="text-md font-semibold text-white group-hover:text-indigo-400 transition-colors duration-200 truncate">{novel.title}</h3>
            <p className="mt-1 text-sm text-gray-400">{novel.author}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BookList;