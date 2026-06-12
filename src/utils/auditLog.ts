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
    | 'ACCOUNT_LOCKED';

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
            console.warn('[FinanceBook] Audit log failed:', error);
        }
    } catch (e) {
        // Silently fail — don't block app operations for logging failures
        console.warn('[FinanceBook] Audit log error:', e);
    }
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
};
