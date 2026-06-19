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
    queuedAt:  string;         // ISO timestamp when originally enqueued
    updatedAt: string;         // ISO timestamp set/updated each time the op is enqueued
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

export async function enqueue(op: Omit<SyncOperation, 'id' | 'queuedAt' | 'updatedAt' | 'attempts'>): Promise<void> {
    const q = await getQueue();
    const now = new Date().toISOString();
    // De-duplicate: if a upsert for the same table+userId already queued,
    // replace it — no point sending stale data when we have a newer full set.
    if (op.op === 'upsert') {
        const idx = q.findIndex(e => e.table === op.table && e.userId === op.userId && e.op === 'upsert');
        if (idx !== -1) {
            q[idx] = { ...q[idx], rows: op.rows, updatedAt: now, attempts: 0 };
            await saveQueue(q);
            return;
        }
    }
    q.push({
        ...op,
        id:        `${op.table}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        queuedAt:  now,
        updatedAt: now,
        attempts:  0,
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
                // Conflict resolution: skip rows whose remote updated_at is newer than
                // the local updatedAt timestamp (remote wins — local data is stale).
                const localUpdatedAt = op.updatedAt ?? op.queuedAt;
                const rowIds: string[] = op.rows.map((r: any) => r.id).filter(Boolean);
                let rowsToUpsert = op.rows;
                if (rowIds.length > 0) {
                    const { data: remoteRows } = await supabase
                        .from(op.table)
                        .select('id, updated_at')
                        .in('id', rowIds);
                    if (remoteRows && remoteRows.length > 0) {
                        const remoteMap = new Map<string, string>(
                            remoteRows.map((r: { id: string; updated_at: string }) => [r.id, r.updated_at])
                        );
                        rowsToUpsert = op.rows.filter((r: any) => {
                            const remoteUpdatedAt = remoteMap.get(r.id);
                            // No remote row exists → always upsert
                            if (!remoteUpdatedAt) return true;
                            // Local is newer or equal → upsert; remote is newer → skip
                            return localUpdatedAt >= remoteUpdatedAt;
                        });
                    }
                }
                if (rowsToUpsert.length === 0) {
                    // All rows were superseded by newer remote data — dequeue without upserting
                    await dequeue(op.id);
                    synced++;
                    onProgress?.(synced, q.length);
                    continue;
                }
                const { error } = await supabase
                    .from(op.table)
                    .upsert(rowsToUpsert, { onConflict: 'id' });
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
            onProgress?.(synced, q.length);
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
    }

    return { synced, failed };
}

export async function queueSize(): Promise<number> {
    const q = await getQueue();
    return q.length;
}
