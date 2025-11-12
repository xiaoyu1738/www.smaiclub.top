import React from 'react';
import { Novel, Volume } from '../types';
import { BookOpenIcon } from './icons/BookOpenIcon';

interface VolumeListProps {
  novel: Novel;
  onSelectVolume: (volume: Volume) => void;
}

const VolumeList: React.FC<VolumeListProps> = ({ novel, onSelectVolume }) => {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 pt-4">
          <div className="flex flex-col sm:flex-row items-start gap-8">
            <div className="w-48 sm:w-56 flex-shrink-0">
              <img
                src={novel.coverUrl}
                alt={`Cover of ${novel.title}`}
                className="w-full aspect-[2/3] object-cover rounded-lg shadow-2xl"
              />
            </div>
            <div className="flex-grow pt-4">
              <h1 className="text-3xl md:text-4xl font-bold">{novel.title}</h1>
              <p className="text-lg text-gray-400 mt-2">{novel.author}</p>
              <p className="text-md text-gray-300 mt-4">{novel.volumes.length} 卷</p>
            </div>
          </div>
        </header>

        <main>
          <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2 mb-6">卷</h2>
          <div className="space-y-4">
            {novel.volumes.map((volume, index) => (
              <div
                key={volume.id}
                className="bg-gray-800 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-gray-700 hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                onClick={() => onSelectVolume(volume)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectVolume(volume);
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  <BookOpenIcon className="h-6 w-6 text-indigo-400 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-lg">{volume.title}</h3>
                  </div>
                </div>
                <span className="text-sm text-gray-400 hover:text-white">立即阅读</span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

export default VolumeList;