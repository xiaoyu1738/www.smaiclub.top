import { useEffect, useRef } from 'react';

export function AuthControl() {
    const containerRef = useRef<HTMLDivElement>(null);
    const initialized = useRef(false);

    useEffect(() => {
        const loadAuth = () => {
            if (!containerRef.current) return;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((window as any).CommonAuth) {
                // Already loaded
                if (!initialized.current || containerRef.current.innerHTML === '') {
                    // Update ID for script to find
                    containerRef.current.id = 'smai-auth-stable-container';
                    containerRef.current.innerHTML = '';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (window as any).CommonAuth.init('smai-auth-stable-container');
                    initialized.current = true;
                }
                return;
            }

            // Load Script if not present
            if (!document.getElementById('smai-auth-script')) {
                const script = document.createElement('script');
                script.id = 'smai-auth-script';
                script.src = "https://login.smaiclub.top/common-auth.js";
                script.async = true;
                script.onload = () => {
                    if (containerRef.current) {
                        containerRef.current.id = 'smai-auth-stable-container';
                        containerRef.current.innerHTML = '';
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (window as any).CommonAuth.init('smai-auth-stable-container');
                        initialized.current = true;
                    }
                };
                document.body.appendChild(script);
            }
        };

        loadAuth();
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
