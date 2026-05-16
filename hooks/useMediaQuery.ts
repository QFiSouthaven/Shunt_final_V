// hooks/useMediaQuery.ts
import { useState, useEffect } from 'react';

export const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(() => {
        if (typeof window.matchMedia !== 'function') {
            return false;
        }
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') {
            return;
        }
        
        const mediaQuery = window.matchMedia(query);
        const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, [query]);

    return matches;
};
