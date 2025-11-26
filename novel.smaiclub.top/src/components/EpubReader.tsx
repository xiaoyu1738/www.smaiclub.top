import React, { useEffect, useRef, useState } from 'react';
import { TocItem } from '../types.ts';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon.tsx';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon.tsx';
import { ChevronRightIcon } from './icons/ChevronRightIcon.tsx';
import { SpinnerIcon } from './icons/SpinnerIcon.tsx';
import ePub from 'epubjs';
import { MenuIcon } from './icons/MenuIcon.tsx';
import { XIcon } from './icons/XIcon.tsx';

interface EpubReaderProps {
    readingInfo: {
        novelTitle: string;
        volumeTitle: string;
        epubUrl: string;
    };
    onBack: () => void;
}

const EpubReader: React.FC<EpubReaderProps> = ({ readingInfo, onBack }) => {
    const [toc, setToc] = useState<TocItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [currentLocation, setCurrentLocation] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const viewerRef = useRef<HTMLDivElement>(null);
    const renditionRef = useRef<any>(null);
    const bookRef = useRef<any>(null);

    useEffect(() => {
        if (!readingInfo.epubUrl || !viewerRef.current) return;

        let isMounted = true;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!renditionRef.current) return;
            if (event.key === 'ArrowLeft') {
                renditionRef.current.prev();
            } else if (event.key === 'ArrowRight') {
                renditionRef.current.next();
            }
        };

        // Resize handler for window and initial setup
        const handleResize = () => {
            if (renditionRef.current && viewerRef.current) {
                const { width, height } = viewerRef.current.getBoundingClientRect();
                if (width > 0 && height > 0) {
                    renditionRef.current.resize(width, height);
                }
            }
        };

        const loadBook = async () => {
            try {
                if (!isMounted) return;

                setIsLoading(true);
                setError(null);
                setToc([]);
                if (viewerRef.current) viewerRef.current.innerHTML = '';

                if (!isMounted) return;

                // 1. 使用 fetch 手动获取文件
                const response = await fetch(readingInfo.epubUrl);
                if (!response.ok) {
                    // 如果 fetch 失败（例如 404），则抛出错误
                    throw new Error(`无法获取 EPUB 文件，状态码: ${response.status}`);
                }
                // 2. 将响应体转换为 ArrayBuffer
                const arrayBuffer = await response.arrayBuffer();

                if (!isMounted) return;

                // 3. 将 ArrayBuffer 传递给 ePub.js
                const epubBook = ePub(arrayBuffer);
                bookRef.current = epubBook;

                const rendition = epubBook.renderTo(viewerRef.current!, {
                    width: '100%',
                    height: '100%',
                    flow: 'paginated',
                    spread: 'auto',
                });
                renditionRef.current = rendition;

                // 为阅读器内容应用深色主题 (后面的代码保持不变)
                rendition.themes.register('dark', {
                    body: {
                        'background-color': '#111827',
                        'color': '#d1d5db',
                        'font-family': 'sans-serif',
                        'line-height': '1.6',
                        'padding': '2rem'
                    },
                    'a': { 'color': '#818cf8 !important', 'text-decoration': 'underline !important' },
                    'h1, h2, h3, h4': { 'color': '#f9fafb !important' },
                    img: { 'max-width': '100%', 'height': 'auto' }
                });
                rendition.themes.select('dark');

                document.addEventListener('keydown', handleKeyDown);
                window.addEventListener('resize', handleResize);

                rendition.on('relocated', (location: any) => {
                    const chapter = epubBook.navigation.get(location.start.href);
                    if (chapter && chapter.id) {
                        if(isMounted) setCurrentLocation(chapter.id);
                    }
                });

                // 你仍然可以保留这个超时，以防解析一个巨大的或损坏的文件时卡住
                const readyPromise = epubBook.ready;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('书籍解析超时。可能是文件损坏或格式不受支持。')), 20000)
                );

                await Promise.race([readyPromise, timeoutPromise]);

                if (isMounted) {
                    setToc(epubBook.navigation.toc);
                    await rendition.display();
                    handleResize();
                    setIsLoading(false);
                }
            } catch (err) {
                console.error("加载书籍时出错:", err);
                if (isMounted) {
                    const message = err instanceof Error ? err.message : '未知错误';
                    if (message.includes('404') || message.includes('无法获取')) {
                        setError('加载书籍失败：找不到文件。链接可能已失效。');
                    } else {
                        setError(`加载书籍失败: ${message}`);
                    }
                    setIsLoading(false);
                }
            }
        };

        loadBook();

        return () => {
            isMounted = false;
            bookRef.current?.destroy();
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', handleResize);
        };
    }, [readingInfo.epubUrl]);

    const onTocItemClick = (href: string) => {
        renditionRef.current?.display(href);
        if(window.innerWidth < 768) {
            setIsTocOpen(false);
        }
    };

    const goNext = () => renditionRef.current?.next();
    const goPrev = () => renditionRef.current?.prev();

    const renderToc = (items: TocItem[]) => (
        <ul className="space-y-2">
            {items.map((item) => (
                <li key={item.id}>
                    <button
                        onClick={() => onTocItemClick(item.href)}
                        className={`w-full text-left px-4 py-2 rounded-md text-sm transition-colors duration-200 ${currentLocation === item.id ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-gray-700'}`}
                    >
                        {item.label.trim()}
                    </button>
                    {item.subitems && item.subitems.length > 0 && (
                        <div className="pl-4 mt-2">{renderToc(item.subitems)}</div>
                    )}
                </li>
            ))}
        </ul>
    );

    if (error) {
        return (
            <div className="h-screen w-screen flex flex-col justify-center items-center bg-gray-900 text-red-400 p-4 text-center">
                <h2 className="text-2xl font-bold mb-4">发生错误</h2>
                <p>{error}</p>
                <button onClick={onBack} className="mt-8 flex items-center gap-2 p-2 px-4 rounded-md bg-gray-700 hover:bg-gray-600 text-white transition-colors">
                    <ArrowLeftIcon className="h-5 w-5" />
                    <span>返回卷列表</span>
                </button>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-gray-900 text-gray-200">
            {isLoading && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-80 flex justify-center items-center z-50">
                    <SpinnerIcon className="h-12 w-12 text-indigo-400" />
                </div>
            )}
            <header className="flex-shrink-0 bg-gray-800 shadow-md z-30">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <button onClick={onBack} className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-700 transition-colors">
                        <ArrowLeftIcon className="h-5 w-5" />
                        <span className="hidden md:inline">返回卷列表</span>
                    </button>
                    <div className="text-center truncate px-4">
                        <h1 className="font-bold text-lg truncate">{readingInfo.novelTitle}</h1>
                        <p className="text-sm text-gray-400 truncate">{readingInfo.volumeTitle}</p>
                    </div>
                    <button onClick={() => setIsTocOpen(!isTocOpen)} className="p-2 rounded-md hover:bg-gray-700 transition-colors md:hidden">
                        <MenuIcon className="h-6 w-6" />
                    </button>
                </div>
            </header>

            <div className="flex-grow flex relative overflow-hidden">
                {/* TOC Sidebar - Desktop */}
                <aside className="hidden md:block w-72 flex-shrink-0 bg-gray-800 overflow-y-auto p-4 shadow-lg">
                    <h2 className="text-xl font-bold mb-4">章节</h2>
                    {toc.length > 0 ? renderToc(toc) : <p className="text-gray-400">没有目录信息。</p>}
                </aside>

                {/* TOC Sidebar - Mobile */}
                <div className={`fixed inset-0 z-40 transition-transform duration-300 ease-in-out md:hidden ${isTocOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsTocOpen(false)}></div>
                    <aside className="relative w-4/5 max-w-sm h-full bg-gray-800 overflow-y-auto p-4 shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">章节</h2>
                            <button onClick={() => setIsTocOpen(false)} className="p-2 rounded-md hover:bg-gray-700">
                                <XIcon className="h-6 w-6"/>
                            </button>
                        </div>
                        {toc.length > 0 ? renderToc(toc) : <p className="text-gray-400">没有目录信息。</p>}
                    </aside>
                </div>

                <main className="flex-grow relative flex flex-col">
                    <div id="viewer" ref={viewerRef} className="flex-grow w-full overflow-hidden min-h-0"></div>
                    <div className="absolute inset-x-0 bottom-0 md:bottom-4 flex justify-center p-4">
                        <div className="flex items-center justify-center gap-4 bg-gray-800/80 backdrop-blur-sm p-2 rounded-full shadow-lg ring-1 ring-white/10">
                            <button onClick={goPrev} className="p-3 rounded-full hover:bg-gray-700 transition-colors">
                                <ChevronLeftIcon className="h-6 w-6" />
                            </button>
                            <button onClick={goNext} className="p-3 rounded-full hover:bg-gray-700 transition-colors">
                                <ChevronRightIcon className="h-6 w-6" />
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default EpubReader;