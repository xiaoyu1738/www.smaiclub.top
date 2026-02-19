import { useEffect, useRef } from 'react';

export function AuthControl() {
    const containerRef = useRef<HTMLDivElement>(null);
    const initialized = useRef(false);

    useEffect(() => {
        const loadAuth = () => {
            if (!containerRef.current) return;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const commonAuth = (window as any).CommonAuth;

            // Retry only if commonAuth exists AND we haven't successfully initialized yet OR the container is empty (re-render)
            if (commonAuth && (!initialized.current || containerRef.current.innerHTML === '')) {
                // Ensure ID match for the script to find it
                containerRef.current.id = 'smai-auth-stable-container';

                // Clear potential duplicates
                containerRef.current.innerHTML = '';

                commonAuth.init('smai-auth-stable-container');
                initialized.current = true;
            }
        };

        loadAuth();

        // Polling for script load
        const timer = setInterval(() => {
            if (!initialized.current || (containerRef.current && containerRef.current.innerHTML === '')) {
                loadAuth();
            } else {
                clearInterval(timer);
            }
        }, 100);

        return () => clearInterval(timer);
    }, []);

    return (
        <div
            id="smai-auth-stable-container"
            ref={containerRef}
            className="smai-auth-container-wrapper"
            style={{
                minHeight: '40px',
                minWidth: '120px', // Reserve space to prevent layout shift
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                transition: 'opacity 0.2s'
            }}
        />
    );
}
