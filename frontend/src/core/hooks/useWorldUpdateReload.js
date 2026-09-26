import { useEffect } from 'react';

export function useWorldUpdateReload(setReloadKey) {
  useEffect(() => {
    const handleWorldUpdate = () => setReloadKey((key) => key + 1);
    window.addEventListener('we:world-updated', handleWorldUpdate);
    return () => window.removeEventListener('we:world-updated', handleWorldUpdate);
  }, [setReloadKey]);
}
