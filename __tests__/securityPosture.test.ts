import { computeSecurityPosture } from '../src/utils/securityPosture';

describe('computeSecurityPosture', () => {
    it('marks two-factor as off with an action when never set up', () => {
        const posture = computeSecurityPosture('disabled', 0);
        const twoFactor = posture.items.find(i => i.key === 'twoFactor')!;
        expect(twoFactor.status).toBe('off');
        expect(twoFactor.actionScreen).toBe('2fa');
    });

    it('marks two-factor as on with no action when enabled', () => {
        const posture = computeSecurityPosture('enabled', 0);
        const twoFactor = posture.items.find(i => i.key === 'twoFactor')!;
        expect(twoFactor.status).toBe('on');
        expect(twoFactor.actionScreen).toBeUndefined();
    });

    it('marks two-factor as partial when setup was started but not finished', () => {
        const posture = computeSecurityPosture('pending_verification', 0);
        const twoFactor = posture.items.find(i => i.key === 'twoFactor')!;
        expect(twoFactor.status).toBe('partial');
    });

    it('reports data sharing as on (nothing shared) when there are no active shares', () => {
        const posture = computeSecurityPosture('disabled', 0);
        const sharing = posture.items.find(i => i.key === 'dataSharing')!;
        expect(sharing.status).toBe('on');
        expect(sharing.detail).toContain('Nothing is being shared');
    });

    it('flags data sharing as partial and names the lender count when shares are active', () => {
        const posture = computeSecurityPosture('disabled', 2);
        const sharing = posture.items.find(i => i.key === 'dataSharing')!;
        expect(sharing.status).toBe('partial');
        expect(sharing.detail).toContain('2 lenders');
    });

    it('always reports data isolation, encryption and transport as on', () => {
        const posture = computeSecurityPosture('disabled', 0);
        expect(posture.items.find(i => i.key === 'isolation')!.status).toBe('on');
        expect(posture.items.find(i => i.key === 'encryption')!.status).toBe('on');
        expect(posture.items.find(i => i.key === 'transport')!.status).toBe('on');
    });

    it('counts strong (on) items correctly', () => {
        const posture = computeSecurityPosture('enabled', 0);
        // isolation, encryption, transport, backups, twoFactor, auditLog, dataSharing = 7 on;
        // pinning and retention are partial (no real pins in test env; no formal retention schedule)
        expect(posture.strongCount).toBe(7);
    });

    it('counts attention (off) items correctly when 2FA is disabled', () => {
        const posture = computeSecurityPosture('disabled', 0);
        expect(posture.attentionCount).toBe(1);
    });

    it('always reports backups as on and retention as partial', () => {
        const posture = computeSecurityPosture('disabled', 0);
        expect(posture.items.find(i => i.key === 'backups')!.status).toBe('on');
        const retention = posture.items.find(i => i.key === 'retention')!;
        expect(retention.status).toBe('partial');
        expect(retention.actionScreen).toBe('privacy-policy');
    });
});
