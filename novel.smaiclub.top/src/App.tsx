import React, { useState, lazy } from 'react';
import { Novel, Volume } from './types.ts';
import { BOOKS } from './constants.ts';
import BookList from './components/BookList.tsx';
import VolumeList from './components/VolumeList.tsx';

const EpubReader = lazy(() => import('./components/EpubReader.tsx'));

const App: React.FC = () => {
    const [novels] = useState<Novel[]>(BOOKS);
    const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
    const [selectedVolume, setSelectedVolume] = useState<Volume | null>(null);

    const handleSelectNovel = (novel: Novel) => {
        setSelectedNovel(novel);
    };

    const handleSelectVolume = (volume: Volume) => {
        setSelectedVolume(volume);
    };

    const handleBackToNovelList = () => {
        setSelectedVolume(null);
    };

    const handleBackToBookList = () => {
        setSelectedNovel(null);
        setSelectedVolume(null);
    };

    if (selectedVolume && selectedNovel) {
        return (
            <React.Suspense fallback={<div className="h-screen w-screen flex justify-center items-center bg-gray-900 text-white">正在加载阅读器...</div>}>
                <EpubReader
                    readingInfo={{
                        novelTitle: selectedNovel.title,
                        volumeTitle: selectedVolume.title,
                        epubUrl: selectedVolume.epubUrl,
                    }}
                    onBack={handleBackToNovelList}
                />
            </React.Suspense>
        );
    }

    if (selectedNovel) {
        return (
            <VolumeList
                novel={selectedNovel}
                onSelectVolume={handleSelectVolume}
                onBack={handleBackToBookList}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <header className="mb-8 text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Epub 轻小说阅读器</h1>
                    <p className="mt-4 text-lg text-gray-400">从您的书架选择一本书开始阅读</p>
                </header>
                <main>
                    <BookList novels={novels} onSelectNovel={handleSelectNovel} />
                </main>
            </div>
        </div>
    );
};

export default App;