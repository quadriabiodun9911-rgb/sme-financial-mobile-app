import { useApp } from '../contexts/AppContext';

export function useSyncStatus() {
    const { pendingSyncCount } = useApp();
    return { pendingSyncCount, isSyncing: pendingSyncCount > 0 };
}
