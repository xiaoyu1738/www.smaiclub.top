import { useState, useEffect, useRef, useCallback } from 'react';

export function useFaviconBadge(count: number) {
    const faviconRef = useRef<HTMLLinkElement | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [imageLoaded, setImageLoaded] = useState(false);

    const updateFavicon = useCallback((badgeCount: number) => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        const link = faviconRef.current;

        if (!canvas || !img || !link) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw original icon
        // Scale 16x16 ico to 32x32 canvas for better quality
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (badgeCount > 0) {
            const badgeText = badgeCount > 9 ? '9+' : badgeCount.toString();
            
            // Badge Background (Red Circle)
            const radius = 10;
            const x = canvas.width - radius;
            const y = radius; // Top right corner

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#ef4444'; // Tailwind red-500
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Badge Text
            ctx.font = 'bold 14px "SF Pro Display", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, x, y + 1); // Adjust y slightly for visual centering
        }

        // Set favicon
        link.href = canvas.toDataURL('image/png');
    }, []);

    useEffect(() => {
        // Find or create favicon link
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (!link) {
            link = document.createElement('link');
            link.rel = 'shortcut icon';
            document.head.appendChild(link);
        }
        faviconRef.current = link;

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        canvasRef.current = canvas;

        // Load original favicon
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/favicon.ico';
        img.onload = () => {
            imgRef.current = img;
            setImageLoaded(true);
        };
    }, []);

    useEffect(() => {
        if (imageLoaded) {
            updateFavicon(count);
        }
    }, [count, imageLoaded, updateFavicon]);
}