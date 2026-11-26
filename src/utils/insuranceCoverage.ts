/**
 * Insurance Coverage Tracking -- whether the business's own insurance would
 * actually replace what's at risk (stock on hand + owned equipment/property)
 * if lost, not just whether a policy exists. A lapsed policy counts for
 * nothing here: coverage is only as good as whether it's still in force.
 *
 * Insurable value reuses the same cost-basis stock valuation already
 * trusted elsewhere (computeInventoryValue) and the same depreciated asset
 * value already shown on AssetsScreen (computeAssetCurrentValue) -- nothing
 * new is calculated, just compared against what the owner has logged here.
 */
import { Asset, InsurancePolicy, InventoryItem } from '../types';
import { computeInventoryValue } from './stockVelocity';
import { computeAssetCurrentValue } from './finance';

export interface InsuranceCoverageAssessment {
    totalInsurableValue: number;
    totalActiveCoverage: number;
    coverageRatio: number | null; // null when there's nothing insurable to measure against
    underinsured: boolean;
    uninsuredGap: number;
    expiringPolicies: { policy: InsurancePolicy; daysUntilRenewal: number }[];
    expiredPolicies: { policy: InsurancePolicy; daysOverdue: number }[];
    warning: string | null;
}

const UNDERINSURANCE_THRESHOLD = 0.8;
const EXPIRY_WARNING_DAYS = 30;

export function computeInsuranceCoverageAssessment(
    policies: InsurancePolicy[],
    inventory: InventoryItem[],
    assets: Asset[],
    now: Date = new Date(),
): InsuranceCoverageAssessment {
    const inventoryValue = computeInventoryValue(inventory);
    const assetsValue = assets
        .filter(a => a.status === 'active')
        .reduce((sum, a) => sum + computeAssetCurrentValue(a), 0);
    const totalInsurableValue = inventoryValue + assetsValue;

    const expiringPolicies: { policy: InsurancePolicy; daysUntilRenewal: number }[] = [];
    const expiredPolicies: { policy: InsurancePolicy; daysOverdue: number }[] = [];
    let totalActiveCoverage = 0;

    for (const policy of policies) {
        const renewal = new Date(policy.renewalDate);
        const daysUntil = Math.round((renewal.getTime() - now.getTime()) / (24 * 3600 * 1000));
        if (daysUntil < 0) {
            expiredPolicies.push({ policy, daysOverdue: -daysUntil });
            continue; // lapsed -- doesn't count toward active protection
        }
        totalActiveCoverage += policy.coverageAmount;
        if (daysUntil <= EXPIRY_WARNING_DAYS) {
            expiringPolicies.push({ policy, daysUntilRenewal: daysUntil });
        }
    }

    const coverageRatio = totalInsurableValue > 0 ? totalActiveCoverage / totalInsurableValue : null;
    const underinsured = totalInsurableValue > 0 && (coverageRatio ?? 0) < UNDERINSURANCE_THRESHOLD;
    const uninsuredGap = Math.max(0, totalInsurableValue - totalActiveCoverage);

    let warning: string | null = null;
    if (expiredPolicies.length > 0) {
        warning = `${expiredPolicies.length} ${expiredPolicies.length > 1 ? 'policies have' : 'policy has'} lapsed — that coverage no longer protects the business.`;
    } else if (underinsured) {
        warning = `Active coverage protects only ${Math.round((coverageRatio ?? 0) * 100)}% of insurable stock and equipment value — a loss beyond that would come straight out of the business's own cash.`;
    } else if (expiringPolicies.length > 0) {
        warning = `${expiringPolicies.length} ${expiringPolicies.length > 1 ? 'policies renew' : 'policy renews'} within ${EXPIRY_WARNING_DAYS} days — renew on time to avoid a coverage gap.`;
    }

    return { totalInsurableValue, totalActiveCoverage, coverageRatio, underinsured, uninsuredGap, expiringPolicies, expiredPolicies, warning };
}
