/**
 * Watches connectivity and drains syncQueue.ts's offline write queue as
 * soon as the device comes back online.
 *
 * Before this file existed, storage.ts's enqueue() correctly queued every
 * write that failed while offline (transactions, invoices, goals, etc.),
 * and flushQueue() correctly knew how to replay that queue -- but nothing
 * in the app ever called flushQueue(). @react-native-community/netinfo was
 * already an installed dependency, unused until now. Writes made offline
 * were safe (queued locally) but would just sit there indefinitely once
 * the device reconnected, with no automatic retry and no UI signal.
 */
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { flushQueue, queueSize } from './syncQueue';

export type OfflineSyncStatus =
    | { phase: 'idle' }
    | { phase: 'syncing'; total: number }
    | { phase: 'synced'; count: number }
    | { phase: 'error'; failed: number };

const IDLE: OfflineSyncStatus = { phase: 'idle' };

let listeners: Array<(status: OfflineSyncStatus) => void> = [];
let currentStatus: OfflineSyncStatus = IDLE;

function setStatus(status: OfflineSyncStatus): void {
    currentStatus = status;
    listeners.forEach(l => l(status));
}

// Same module-singleton-with-subscribers shape as AlertHost's
// pushWebAlert/setRequest — SyncStatusBanner is the one subscriber today,
// but any screen could show sync state without another flush codepath.
export function subscribeOfflineSyncStatus(listener: (status: OfflineSyncStatus) => void): () => void {
    listeners.push(listener);
    listener(currentStatus);
    return () => { listeners = listeners.filter(l => l !== listener); };
}

let flushInFlight = false;

async function attemptFlush(): Promise<void> {
    // Set synchronously, before any await -- startOfflineSyncWatcher() can
    // trigger two calls back-to-back (NetInfo's own initial-state fire,
    // plus the explicit call right after registering the listener). Both
    // would otherwise pass this guard before either reached an `await`,
    // racing two concurrent flushes of the same queue.
    if (flushInFlight) return;
    flushInFlight = true;
    try {
        // Flushing with no session would just fail every queued row on
        // RLS and burn through each op's limited 10-attempt retry budget
        // for nothing — a local check, no network round trip.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const pending = await queueSize();
        if (pending === 0) return;

        setStatus({ phase: 'syncing', total: pending });
        const { synced, failed } = await flushQueue(supabase, (_done, total) => {
            setStatus({ phase: 'syncing', total });
        });
        if (failed > 0) {
            setStatus({ phase: 'error', failed });
        } else if (synced > 0) {
            setStatus({ phase: 'synced', count: synced });
            setTimeout(() => setStatus(IDLE), 3000);
        } else {
            setStatus(IDLE);
        }
    } finally {
        flushInFlight = false;
    }
}

let watcherStarted = false;
let lastConnected: boolean | null = null;

/**
 * Starts the connectivity listener (once, for the app's lifetime) and
 * attempts an immediate flush. Safe to call on every sign-in — the
 * NetInfo subscription itself is only ever created once; each call just
 * re-attempts a flush, which is what's needed right after a sign-in that
 * happened while offline writes were already queued.
 */
export function startOfflineSyncWatcher(): void {
    if (!watcherStarted) {
        watcherStarted = true;
        NetInfo.addEventListener(state => {
            const connected = !!state.isConnected && state.isInternetReachable !== false;
            // Only on a genuine offline->online transition (or the very
            // first event, covering "already online at launch with a
            // stale queue from a previous offline session") — avoids
            // re-attempting on every duplicate "still connected" event
            // NetInfo can fire on a flaky connection.
            const justConnected = connected && lastConnected !== true;
            lastConnected = connected;
            if (justConnected) attemptFlush();
        });
    }
    attemptFlush();
}
