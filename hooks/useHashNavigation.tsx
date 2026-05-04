import { useState, useEffect, useCallback } from 'react';

export function useHashNavigation() {
  const [currentHash, setCurrentHash] = useState(
    () => window.location.hash || '#/'
  );

  useEffect(() => {
    const handler = () => setCurrentHash(window.location.hash || '#/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigateTo = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  return { currentHash, navigateTo };
}
