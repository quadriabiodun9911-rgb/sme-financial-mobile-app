/**
 * Security Center -- the "🔐 Your Financial Data" trust panel. Turns the
 * app's real security posture into something a non-technical SME owner
 * can read at a glance, instead of it living only in code comments and
 * migration files nobody outside the team ever sees.
 *
 * Every line here maps to something that actually exists and is checked
 * live where the state is dynamic (2FA, active data shares) -- nothing is
 * asserted as 'on' just because the infrastructure for it exists. A
 * feature that's built but not yet active (certificate pinning has no
 * real pins generated yet) is reported 'partial', with the honest reason,
 * never claimed as fully on.
 */

import { TwoFactorStatus } from './twoFactorAuth';
import { getCertificatePinningStatus } from './certificatePinning';

export type PostureStatus = 'on' | 'partial' | 'off';

export interface SecurityPostureItem {
    key: string;
    label: string;
    status: PostureStatus;
    detail: string;
    actionLabel?: string;
    actionScreen?: 'audit-log' | '2fa' | 'loans' | 'financing-marketplace';
}

export interface SecurityPosture {
    items: SecurityPostureItem[];
    strongCount: number;
    attentionCount: number; // 'off' items that are genuinely actionable by the user
}

export function computeSecurityPosture(
    twoFactorStatus: TwoFactorStatus,
    activeLoanMonitoringShares: number,
    currency: string = '₦',
): SecurityPosture {
    const items: SecurityPostureItem[] = [];

    // Data isolation is server-enforced Postgres RLS, not app-level
    // filtering -- genuinely on, always.
    items.push({
        key: 'isolation',
        label: 'Data Isolation',
        status: 'on',
        detail: "Your business's records are walled off at the database level — enforced by the server, not just by this app.",
    });

    items.push({
        key: 'encryption',
        label: 'Sensitive Field Encryption',
        status: 'on',
        detail: 'Amounts, descriptions and other sensitive fields are encrypted before they leave your device.',
    });

    items.push({
        key: 'transport',
        label: 'Secure Connection',
        status: 'on',
        detail: 'All traffic between this app and Quad360\'s servers is encrypted in transit (HTTPS).',
    });

    const pinning = getCertificatePinningStatus();
    items.push({
        key: 'pinning',
        label: 'Certificate Pinning',
        status: pinning.enabled ? 'on' : 'partial',
        detail: pinning.enabled
            ? `An extra layer that stops even a compromised network from intercepting your data — active for ${pinning.pinnedHosts.join(', ')}.`
            : 'An extra layer planned on top of your already-encrypted connection — not yet active on this build.',
    });

    const twoFactorOn = twoFactorStatus === 'enabled';
    items.push({
        key: 'twoFactor',
        label: 'Two-Factor Authentication',
        status: twoFactorOn ? 'on' : twoFactorStatus === 'pending_verification' ? 'partial' : 'off',
        detail: twoFactorOn
            ? 'A second code is required to log in — much harder for anyone else to get into your account.'
            : twoFactorStatus === 'pending_verification'
                ? 'Setup was started but not finished — finish it to require a second code at login.'
                : "Not turned on yet. This is the single biggest step you can take to protect your account.",
        actionLabel: twoFactorOn ? undefined : 'Set up two-factor authentication',
        actionScreen: twoFactorOn ? undefined : '2fa',
    });

    items.push({
        key: 'auditLog',
        label: 'Activity Log',
        status: 'on',
        detail: 'Every login, PIN change, team change and data export or import is recorded — visible only to you.',
        actionLabel: 'View your activity log',
        actionScreen: 'audit-log',
    });

    items.push({
        key: 'dataSharing',
        label: 'Data Sharing With Lenders',
        status: activeLoanMonitoringShares > 0 ? 'partial' : 'on',
        detail: activeLoanMonitoringShares > 0
            ? `You're currently sharing ongoing loan-status updates with ${activeLoanMonitoringShares} lender${activeLoanMonitoringShares === 1 ? '' : 's'} — never your raw transactions, only a summarized status. You can revoke this anytime.`
            : 'Nothing is being shared with any lender right now. Sharing only ever happens with your explicit consent, loan by loan.',
        actionLabel: 'Review your loans & shares',
        actionScreen: 'loans',
    });

    const strongCount = items.filter(i => i.status === 'on').length;
    const attentionCount = items.filter(i => i.status === 'off').length;

    return { items, strongCount, attentionCount };
}
