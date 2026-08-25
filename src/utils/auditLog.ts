import { supabase } from './supabase';
import { getAuthUserId } from './storage';

export type AuditAction =
    | 'LOGIN'
    | 'LOGOUT'
    | 'ACCOUNT_SETUP'
    | 'TEAM_JOIN'
    | 'TEAM_INVITE'
    | 'TEAM_REMOVE'
    | 'PIN_CHANGE'
    | 'SETTINGS_UPDATE'
    | 'TRANSACTION_CREATE'
    | 'TRANSACTION_UPDATE'
    | 'TRANSACTION_DELETE'
    | 'INVOICE_CREATE'
    | 'INVOICE_UPDATE'
    | 'INVOICE_DELETE'
    | 'GOAL_CREATE'
    | 'GOAL_UPDATE'
    | 'GOAL_DELETE'
    | 'ASSET_CREATE'
    | 'ASSET_UPDATE'
    | 'ASSET_DELETE'
    | 'INVENTORY_CREATE'
    | 'INVENTORY_UPDATE'
    | 'INVENTORY_DELETE'
    | 'DATA_EXPORT'
    | 'DATA_IMPORT'
    | 'DATA_CLEAR'
    | 'FAILED_LOGIN'
    | 'ACCOUNT_LOCKED'
    | 'LENDER_SHARE_GRANTED'
    | 'LENDER_SHARE_REVOKED';

interface AuditLogEntry {
    action: AuditAction;
    details?: Record<string, any>;
    severity?: 'low' | 'medium' | 'high';
}

/**
 * Log an audit event to Supabase for compliance and security tracking
 * Note: This is best-effort — network issues should not block app operations
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
    try {
        const userId = await getAuthUserId();
        if (!userId) return; // Only log if user is authenticated

        const { error } = await supabase.from('audit_logs').insert({
            user_id: userId,
            action: entry.action,
            details: entry.details,
            severity: entry.severity ?? 'low',
            timestamp: new Date().toISOString(),
            // Device/IP info would go here in production
        });

        if (error) {
            console.warn('[Quad360] Audit log failed:', error);
        }
    } catch (e) {
        // Silently fail — don't block app operations for logging failures
        console.warn('[Quad360] Audit log error:', e);
    }
}

export interface AuditLogRecord {
    id: string;
    action: AuditAction;
    details: Record<string, any> | null;
    severity: 'low' | 'medium' | 'high';
    timestamp: string;
}

/**
 * This account's own recent activity — RLS restricts audit_logs to rows
 * where user_id = auth.uid(), so a team member only ever sees what they
 * themselves did, never a teammate's. That's an honest scope for now: a
 * true shared team activity log would need audit_logs to carry a
 * business/workspace id (it doesn't yet) and a matching RLS policy letting
 * the owner read across it, which is a real schema change, not a query
 * change — until then this stays "your own activity," not "the team's."
 */
export async function loadRecentAuditLogs(limit: number = 50): Promise<AuditLogRecord[]> {
    try {
        const userId = await getAuthUserId();
        if (!userId) return [];
        const { data, error } = await supabase
            .from('audit_logs')
            .select('id, action, details, severity, timestamp')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false })
            .limit(limit);
        if (error || !data) return [];
        return data as AuditLogRecord[];
    } catch {
        return [];
    }
}

const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
    LOGIN: 'Logged in',
    LOGOUT: 'Logged out',
    ACCOUNT_SETUP: 'Account created',
    TEAM_JOIN: 'Joined the team',
    TEAM_INVITE: 'Invited a team member',
    TEAM_REMOVE: 'Removed a team member',
    PIN_CHANGE: 'Changed PIN',
    SETTINGS_UPDATE: 'Updated a setting',
    TRANSACTION_CREATE: 'Recorded a transaction',
    TRANSACTION_UPDATE: 'Updated a transaction',
    TRANSACTION_DELETE: 'Deleted a transaction',
    INVOICE_CREATE: 'Created an invoice',
    INVOICE_UPDATE: 'Updated an invoice',
    INVOICE_DELETE: 'Deleted an invoice',
    GOAL_CREATE: 'Created a goal',
    GOAL_UPDATE: 'Updated a goal',
    GOAL_DELETE: 'Deleted a goal',
    ASSET_CREATE: 'Added an asset',
    ASSET_UPDATE: 'Updated an asset',
    ASSET_DELETE: 'Deleted an asset',
    INVENTORY_CREATE: 'Added an inventory item',
    INVENTORY_UPDATE: 'Updated an inventory item',
    INVENTORY_DELETE: 'Deleted an inventory item',
    DATA_EXPORT: 'Exported data',
    DATA_IMPORT: 'Imported a bank statement',
    DATA_CLEAR: 'Cleared data',
    FAILED_LOGIN: 'Failed login attempt',
    ACCOUNT_LOCKED: 'Account locked after failed attempts',
    LENDER_SHARE_GRANTED: 'Shared loan status with a lender',
    LENDER_SHARE_REVOKED: 'Revoked a lender\'s access to loan status',
};

/**
 * Plain-language description for one entry -- e.g. "Invited a team member
 * (james@example.com, staff)" -- folding in the few detail fields that are
 * actually meaningful to read back, without dumping the raw JSON.
 */
export function describeAuditLog(entry: AuditLogRecord): string {
    const base = AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
    const d = entry.details;
    if (!d) return base;
    if (entry.action === 'TEAM_INVITE' && d.email) return `${base} (${d.email}${d.role ? `, ${d.role}` : ''})`;
    if (entry.action === 'TEAM_REMOVE' && d.email) return `${base} (${d.email})`;
    if (entry.action === 'TEAM_JOIN' && d.email) return `${base} (${d.email})`;
    if (entry.action === 'ACCOUNT_SETUP' && d.email) return `${base} (${d.email})`;
    if (entry.action === 'SETTINGS_UPDATE' && d.key) return `${base} (${d.key})`;
    if (entry.action === 'FAILED_LOGIN' && d.reason) return `${base} (${d.reason})`;
    if ((entry.action === 'LENDER_SHARE_GRANTED' || entry.action === 'LENDER_SHARE_REVOKED') && d.lenderOrgId) return `${base} (loan ${d.loanId ?? ''})`;
    return base;
}

/**
 * Security events that should always be logged
 */
export const auditEvents = {
    login: () => logAudit({ action: 'LOGIN', severity: 'low' }),
    loginFailed: (reason: string) => logAudit({ action: 'FAILED_LOGIN', details: { reason }, severity: 'medium' }),
    accountLocked: () => logAudit({ action: 'ACCOUNT_LOCKED', severity: 'high' }),
    logout: () => logAudit({ action: 'LOGOUT', severity: 'low' }),
    accountSetup: (email: string) => logAudit({ action: 'ACCOUNT_SETUP', details: { email }, severity: 'high' }),
    teamJoin: (email: string) => logAudit({ action: 'TEAM_JOIN', details: { email }, severity: 'medium' }),
    teamInvite: (email: string, role: string) => logAudit({ action: 'TEAM_INVITE', details: { email, role }, severity: 'medium' }),
    teamRemove: (email: string) => logAudit({ action: 'TEAM_REMOVE', details: { email }, severity: 'medium' }),
    pinChange: () => logAudit({ action: 'PIN_CHANGE', severity: 'high' }),
    settingsUpdate: (key: string) => logAudit({ action: 'SETTINGS_UPDATE', details: { key }, severity: 'low' }),
    transactionCreate: (amount: number, type: string) => logAudit({ action: 'TRANSACTION_CREATE', details: { amount, type }, severity: 'low' }),
    transactionUpdate: (id: string) => logAudit({ action: 'TRANSACTION_UPDATE', details: { id }, severity: 'low' }),
    transactionDelete: (id: string) => logAudit({ action: 'TRANSACTION_DELETE', details: { id }, severity: 'medium' }),
    invoiceCreate: (amount: number) => logAudit({ action: 'INVOICE_CREATE', details: { amount }, severity: 'low' }),
    invoiceDelete: (id: string) => logAudit({ action: 'INVOICE_DELETE', details: { id }, severity: 'medium' }),
    dataExport: () => logAudit({ action: 'DATA_EXPORT', severity: 'medium' }),
    dataImport: () => logAudit({ action: 'DATA_IMPORT', severity: 'high' }),
    dataClear: () => logAudit({ action: 'DATA_CLEAR', severity: 'high' }),
    lenderShareGranted: (loanId: string, lenderOrgId: string) => logAudit({ action: 'LENDER_SHARE_GRANTED', details: { loanId, lenderOrgId }, severity: 'high' }),
    lenderShareRevoked: (loanId: string) => logAudit({ action: 'LENDER_SHARE_REVOKED', details: { loanId }, severity: 'medium' }),
};
