import React, { useState, useEffect } from 'react';
import { Novel, Volume } from './types.ts';
import VolumeList from './components/VolumeList.tsx';
import EpubReader from './components/EpubReader.tsx';
import { SpinnerIcon } from './components/icons/SpinnerIcon.tsx';


const App: React.FC = () => {
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
  const [selectedVolume, setSelectedVolume] = useState<Volume | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNovel = async () => {
      try {
        const response = await fetch('/api/novels');
        if (!response.ok) {
          throw new Error('获取小说列表失败');
        }
        const data: Novel[] = await response.json();
        if (data && data.length > 0) {
            setSelectedNovel(data[0]);
        } else {
            setError('未找到小说。');
        }
      // FIX: The catch block syntax was incorrect. It should be `catch (err) { ... }` instead of `catch (err) => { ... }`.
      } catch (err) {
        setError(err instanceof Error ? err.message : '发生未知错误');
      } finally {
        setIsLoading(false);
      }
    };
    fetchNovel();
  }, []);


  const handleSelectVolume = (volume: Volume) => {
    setSelectedVolume(volume);
  };

  const handleBackToNovelList = () => {
    setSelectedVolume(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex justify-center items-center">
        <SpinnerIcon className="h-12 w-12 text-indigo-400" />
      </div>
    );
  }

  if (error) {
    return (
       <div className="min-h-screen bg-gray-900 flex justify-center items-center text-red-400">
        <p>加载出错: {error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white transition-all duration-500">
      {selectedVolume && selectedNovel ? (
        <EpubReader 
          readingInfo={{
            novelTitle: selectedNovel.title,
            volumeTitle: selectedVolume.title,
            epubUrl: selectedVolume.epubUrl,
          }}
          onBack={handleBackToNovelList} 
        />
      ) : selectedNovel ? (
        <VolumeList novel={selectedNovel} onSelectVolume={handleSelectVolume} />
      ) : (
        <div className="min-h-screen bg-gray-900 flex justify-center items-center">
            <SpinnerIcon className="h-12 w-12 text-indigo-400" />
        </div>
      )}
    </div>
  );
};

export default App;