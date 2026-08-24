import { describeAuditLog, AuditLogRecord } from '../src/utils/auditLog';

const makeEntry = (overrides: Partial<AuditLogRecord> = {}): AuditLogRecord => ({
    id: '1',
    action: 'LOGIN',
    details: null,
    severity: 'low',
    timestamp: '2026-08-24T14:32:00Z',
    ...overrides,
});

describe('describeAuditLog', () => {
    it('describes a plain action with no details', () => {
        expect(describeAuditLog(makeEntry({ action: 'LOGIN' }))).toBe('Logged in');
        expect(describeAuditLog(makeEntry({ action: 'PIN_CHANGE' }))).toBe('Changed PIN');
    });

    it('folds in the invitee email and role for a team invite', () => {
        const entry = makeEntry({ action: 'TEAM_INVITE', details: { email: 'james@example.com', role: 'staff' } });
        expect(describeAuditLog(entry)).toBe('Invited a team member (james@example.com, staff)');
    });

    it('folds in the email for a team removal', () => {
        const entry = makeEntry({ action: 'TEAM_REMOVE', details: { email: 'david@example.com' } });
        expect(describeAuditLog(entry)).toBe('Removed a team member (david@example.com)');
    });

    it('folds in the setting key for a settings update', () => {
        const entry = makeEntry({ action: 'SETTINGS_UPDATE', details: { key: 'currency' } });
        expect(describeAuditLog(entry)).toBe('Updated a setting (currency)');
    });

    it('falls back to the base label when details are present but not recognised for that action', () => {
        const entry = makeEntry({ action: 'DATA_EXPORT', details: { unrelated: true } });
        expect(describeAuditLog(entry)).toBe('Exported data');
    });
});
