/**
 * Offline Sync Queue
 *
 * When Supabase writes fail (no internet), operations are queued here.
 * When connectivity is restored, the queue is flushed in order.
 *
 * Each entry stores the table name + full payload so the flush can
 * reconstruct the exact upsert without needing the original caller.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@quad360/sync_queue';

export type SyncOperation = {
    id:        string;         // unique op id
    table:     string;         // supabase table name
    op:        'upsert' | 'delete';
    rows:      any[];          // rows to upsert, or ids to delete
    userId:    string;
    queuedAt:  string;         // ISO timestamp
    attempts:  number;
};

// ─── Read / write queue ───────────────────────────────────────────────────────

export async function getQueue(): Promise<SyncOperation[]> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveQueue(q: SyncOperation[]): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

// ─── Enqueue a failed operation ───────────────────────────────────────────────

export async function enqueue(op: Omit<SyncOperation, 'id' | 'queuedAt' | 'attempts'>): Promise<void> {
    const q = await getQueue();
    // De-duplicate: if a upsert for the same table+userId already queued,
    // replace it — no point sending stale data when we have a newer full set.
    if (op.op === 'upsert') {
        const idx = q.findIndex(e => e.table === op.table && e.userId === op.userId && e.op === 'upsert');
        if (idx !== -1) {
            q[idx] = { ...q[idx], rows: op.rows, queuedAt: new Date().toISOString(), attempts: 0 };
            await saveQueue(q);
            return;
        }
    }
    q.push({
        ...op,
        id:       `${op.table}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        queuedAt: new Date().toISOString(),
        attempts: 0,
    });
    await saveQueue(q);
}

// ─── Remove successfully synced operation ─────────────────────────────────────

export async function dequeue(opId: string): Promise<void> {
    const q = await getQueue();
    await saveQueue(q.filter(e => e.id !== opId));
}

// ─── Flush queue — call when internet is restored ─────────────────────────────

export async function flushQueue(
    supabase: any,
    onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
    const q = await getQueue();
    if (q.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < q.length; i++) {
        const op = q[i];
        try {
            if (op.op === 'upsert') {
                const { error } = await supabase
                    .from(op.table)
                    .upsert(op.rows, { onConflict: 'id' });
                if (error) throw new Error(error.message);
            } else if (op.op === 'delete') {
                const { error } = await supabase
                    .from(op.table)
                    .delete()
                    .in('id', op.rows);
                if (error) throw new Error(error.message);
            }
            await dequeue(op.id);
            synced++;
        } catch {
            // Increment attempt count — drop after 10 failures
            const updated = { ...op, attempts: op.attempts + 1 };
            if (updated.attempts >= 10) {
                await dequeue(op.id); // give up after 10 tries
            } else {
                const q2 = await getQueue();
                const idx = q2.findIndex(e => e.id === op.id);
                if (idx !== -1) { q2[idx] = updated; await saveQueue(q2); }
            }
            failed++;
        }
        onProgress?.(synced, q.length);
    }

    return { synced, failed };
}

export async function queueSize(): Promise<number> {
    const q = await getQueue();
    return q.length;
}
