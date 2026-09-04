import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Loan, Transaction } from '../types';
import { computeLeverageRatios, scoreDebtToAssets, scoreDebtToEquity, scoreEquityRatio, scoreROA, scoreROE, RatioScore } from '../utils/debtRatios';
import { computeCashRunway } from '../utils/cashRunway';
import { loanMonthlyPayment } from '../utils/finance';
import RadialGauge from './RadialGauge';
import Collapsible from './Collapsible';
import LoanROICalculator from './LoanROICalculator';
import BuyVsFinanceCalculator from './BuyVsFinanceCalculator';
import GrowthAffordabilityCalculator from './GrowthAffordabilityCalculator';
import LoanAffordabilityChecker from './LoanAffordabilityChecker';
import DebtStructurePlanner from './DebtStructurePlanner';
import { localDateStr } from '../utils/localDate';

interface Props {
    finance: FinanceData;
    currency: string;
    loans?: Loan[];
    transactions?: Transaction[];
    accountsReceivable?: number;
    accountsPayable?: number;
    inventoryValue?: number;
}

function healthColor(score: RatioScore) {
    if (score === 'strong') return Colors.income;
    if (score === 'stable') return Colors.warning;
    if (score === 'unscored') return Colors.textMuted;
    return Colors.expense;
}

const UNSCORED_NOTE = 'No assets recorded yet, so this ratio has nothing to compare against — add your assets in Settings or the Assets tab to unlock it.';

// What each score level actually means for day-to-day decisions — not just
// the number, but what happens to the business at that level.
const IMPACT: Record<string, Record<'strong' | 'stable' | 'concerning' | 'unscored', string>> = {
    debtToAssets: {
        strong: 'Most of what you own is yours, not the bank\'s — lenders see you as low-risk, so new financing should be easy to get if you need it.',
        stable: 'A meaningful share of your assets is debt-financed. Still manageable, but leaves less room to absorb a bad month or take on more debt.',
        concerning: 'Most of your assets are financed by debt, not equity — a downturn could leave you owing more than you own, and lenders will see you as high-risk.',
        unscored: UNSCORED_NOTE,
    },
    debtToEquity: {
        strong: 'Your own capital covers your debt several times over — you\'re financing growth with your own money, not the bank\'s.',
        stable: 'Debt and equity are roughly balanced. Fine for now, but taking on more debt from here raises risk faster than it raises capacity.',
        concerning: 'You owe more than the business is worth to you. This is the single biggest red flag lenders and investors look for — expect higher rates or rejected applications.',
        unscored: UNSCORED_NOTE,
    },
    equityRatio: {
        strong: 'The business is mostly self-funded. You keep more of the upside, and a bad quarter is less likely to threaten survival.',
        stable: 'A workable mix of your money and borrowed money. Keep an eye on it — it can tip toward risky if debt grows faster than equity.',
        concerning: 'Borrowed money funds most of the business. Profits are increasingly going toward debt service instead of back into the business or to you.',
        unscored: UNSCORED_NOTE,
    },
    interestCoverage: {
        strong: 'Profit comfortably covers your interest payments several times over — little risk of missing one even if profit dips.',
        stable: 'Interest is covered, but not by much. A slow month could make a payment tight.',
        concerning: 'Profit barely covers (or doesn\'t cover) interest payments — a real risk of missing one if income slips at all.',
        unscored: 'No liabilities recorded — there\'s no interest to cover, so this ratio doesn\'t apply yet.',
    },
    roa: {
        strong: 'Every pound tied up in the business is working hard — a strong sign you could productively deploy more capital, borrowed or not.',
        stable: 'Assets are generating a reasonable return, but there\'s room to get more out of what you already own before adding more.',
        concerning: 'Assets aren\'t earning their keep. Adding more debt to buy more assets right now would likely just repeat the problem at a larger scale.',
        unscored: UNSCORED_NOTE,
    },
    roe: {
        strong: 'Your own money is earning a strong return in this business — better than it would likely earn sitting elsewhere.',
        stable: 'A reasonable return on your capital, though not spectacular. Worth comparing against what else you could do with that money.',
        concerning: 'Your capital is earning little to nothing here. Before borrowing more, fix why the business isn\'t returning enough on what\'s already invested.',
        unscored: UNSCORED_NOTE,
    },
};

function scoreInterestCoverage(interestCoverage: number, hasDebt: boolean): RatioScore {
    if (!hasDebt) return 'unscored';
    if (interestCoverage >= 2.5) return 'strong';
    if (interestCoverage >= 1.5) return 'stable';
    return 'concerning';
}

// Merges what used to be two stacked components on the same "Loans & Debt"
// tab -- EnhancedDebtManagement (a composite Debt Health Score, its own
// duplicate debt-to-assets/debt-to-equity card, and four loan calculators)
// and DebtAnalysis (the same ratios again, plus equity ratio/ROA/ROE, with
// richer per-ratio "what this means" text) -- both pulling from the same
// computeLeverageRatios so their numbers always agreed, but a user scrolling
// the tab saw debt-to-assets and debt-to-equity presented twice in a row in
// two different visual styles. One flow now: your debt position (one set of
// ratios, shown once), what it means, then the manual loan calculators.
export default function LoansAndDebt({
    finance, currency, loans = [], transactions = [],
    accountsReceivable = 0, accountsPayable = 0, inventoryValue = 0,
}: Props) {
    // Same trailing-30-day paid-expense burn rate CashFlowScreen's Runway
    // tab and the Weekly Dashboard use — one canonical "how much do we
    // spend a month" source, not a separate estimate invented here.
    const { dailyBurn } = computeCashRunway(transactions, finance.cashBalance);
    const monthlyBurn = dailyBurn * 30;

    // Same trailing-30-day window as monthlyBurn, mirrored for paid income,
    // so monthlyProfit is on the same clock as everything else here rather
    // than a cumulative, all-time figure.
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const last30Str = last30.toISOString().split('T')[0];
    const todayStr = localDateStr();
    const income30 = transactions
        .filter(t => t.type === 'income' && t.status === 'paid' && t.date >= last30Str && t.date <= todayStr)
        .reduce((s, t) => s + (t.amount ?? 0), 0);
    const monthlyProfit = income30 - monthlyBurn;

    // Structural monthly debt service from the Loan Register itself (same
    // amortization formula DSCR uses) — independent of whether repayments
    // happen to be logged as expense transactions, so it's never double
    // counted against monthlyBurn.
    const existingMonthlyDebtService = loans
        .filter(l => l.status === 'active')
        .reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);

    // The one place these ratios get computed for this tab — everything
    // below reads from this single result, so nothing can disagree with
    // itself the way the two separate cards used to.
    const { liabilities, assets, equity, debtToAssets, debtToEquity, equityRatio, returnOnAssets, returnOnEquity, hasAssetData, profit } =
        computeLeverageRatios(finance, loans, accountsReceivable, accountsPayable, inventoryValue);
    const income = finance.income;

    const interestCoverage = profit > 0 ? profit / Math.max(1, liabilities * 0.05) : 0; // Assume 5% interest rate

    const debtToAssetsScore = scoreDebtToAssets(debtToAssets, hasAssetData);
    const debtToEquityScore = scoreDebtToEquity(debtToEquity);
    const equityRatioScore = scoreEquityRatio(equityRatio, hasAssetData);
    const interestCoverageScore = scoreInterestCoverage(interestCoverage, liabilities > 0);
    const roaScore = scoreROA(returnOnAssets);
    const roeScore = scoreROE(returnOnEquity);

    // Debt health score — a composite of the same three tiers scored above
    // for debt-to-assets/debt-to-equity (so a ratio scored "concerning"
    // below always costs this score the same deduction), plus interest
    // coverage. "unscored" costs nothing (neither a bonus nor a penalty)
    // rather than being silently read as "strong".
    const getDebtHealthScore = (): { score: number; status: 'healthy' | 'moderate' | 'concerning'; color: string } => {
        let score = 100;
        score -= debtToAssetsScore === 'concerning' ? 30 : debtToAssetsScore === 'stable' ? 15 : 0;
        score -= debtToEquityScore === 'concerning' ? 25 : debtToEquityScore === 'stable' ? 10 : 0;
        if (interestCoverage < 1.5) score -= 20;
        else if (interestCoverage < 2.5) score -= 10;
        const status = score >= 70 ? 'healthy' : score >= 50 ? 'moderate' : 'concerning';
        const color = status === 'healthy' ? Colors.income : status === 'moderate' ? Colors.warning : Colors.expense;
        return { score: Math.max(0, Math.min(100, score)), status, color };
    };
    const health = getDebtHealthScore();

    // Consolidated "what this means" action items — combines both
    // components' original trigger conditions, dropping the ones that were
    // near-duplicates of each other (e.g. "debt-to-assets concerning" and
    // "debt-to-assets > 50%" are the same threshold) in favor of whichever
    // wording is more specific and number-anchored.
    const actionItems: { color: string; text: string }[] = [];
    if (liabilities === 0) {
        actionItems.push({ color: Colors.income, text: 'No recorded liabilities. Update Opening Liabilities in Settings to reflect real debt obligations.' });
    }
    if (!hasAssetData) {
        actionItems.push({ color: Colors.textMuted, text: 'No assets recorded yet — debt-to-assets and equity ratio can\'t be calculated until you add assets in Settings or the Assets tab.' });
    }
    if (hasAssetData && debtToAssets > 50) {
        actionItems.push({ color: Colors.expense, text: `Debt-to-assets of ${debtToAssets.toFixed(1)}% means more than half your assets are financed by debt. Focus on reducing liabilities or growing retained earnings.` });
    }
    if (debtToEquity > 1 && debtToEquity !== Infinity) {
        actionItems.push({ color: Colors.warning, text: `Debt-to-equity of ${debtToEquity.toFixed(2)}× means your debt exceeds your equity. Consider equity financing over debt for future growth.` });
    }
    if (liabilities > 0 && income === 0) {
        actionItems.push({ color: Colors.expense, text: 'No recorded income: start generating revenue to service debt.' });
    }
    if (profit > 0 && liabilities > 0) {
        actionItems.push({ color: Colors.income, text: `Positive cash flow (${currency}${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })} profit): allocate some of it to debt reduction for faster payoff.` });
    }
    if (returnOnEquity >= 15) {
        actionItems.push({ color: Colors.income, text: `Strong ROE of ${returnOnEquity.toFixed(1)}% — your equity is generating healthy returns.` });
    }
    if (returnOnAssets < 5 && assets > 0) {
        actionItems.push({ color: Colors.warning, text: `Low ROA of ${returnOnAssets.toFixed(1)}%. Consider improving profit margins or reducing asset base.` });
    }
    if (debtToAssetsScore === 'strong' && equity > 0 && liabilities > 0) {
        actionItems.push({ color: Colors.income, text: 'Strong debt position: you can safely increase borrowing for growth if needed.' });
    }

    return (
        <View>
            {/* ── 1. YOUR DEBT POSITION ─────────────────────────────────── */}
            <Text style={s.sectionLabel}>YOUR DEBT POSITION</Text>
            <Text style={s.sectionSub}>Built from your Loan Register, opening balances, and recorded assets.</Text>

            <View style={[s.healthCard, { borderColor: health.color }]}>
                <RadialGauge displayValue={health.score.toFixed(0)} label="/ 100" progress={health.score / 100} color={health.color} size={84} />
                <View style={{ flex: 1 }}>
                    <Text style={s.healthLabel}>Debt Health Score</Text>
                    <Text style={[s.healthStatus, { color: health.color }]}>Status: {health.status.charAt(0).toUpperCase() + health.status.slice(1)}</Text>
                </View>
            </View>

            <View style={s.summaryRow}>
                <SummaryCard label="Total Assets" value={`${currency}${assets.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.asset} />
                <SummaryCard label="Total Liabilities" value={`${currency}${liabilities.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.liability} />
                <SummaryCard label="Owner's Equity" value={`${currency}${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.equity} />
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Solvency & Leverage</Text>
                <RatioRow label="Debt-to-Assets" value={hasAssetData ? `${debtToAssets.toFixed(1)}%` : 'N/A'} score={debtToAssetsScore} desc="% of assets financed by debt. Below 30% is strong." impact={IMPACT.debtToAssets[debtToAssetsScore]} />
                <RatioRow label="Debt-to-Equity" value={debtToEquity === Infinity ? 'N/A' : debtToEquity.toFixed(2)} score={debtToEquityScore} desc="Leverage ratio. Below 0.5× is strong, above 1× is high." impact={IMPACT.debtToEquity[debtToEquityScore]} />
                <RatioRow label="Equity Ratio" value={hasAssetData ? `${equityRatio.toFixed(1)}%` : 'N/A'} score={equityRatioScore} desc="% of assets financed by equity. Higher is safer." impact={IMPACT.equityRatio[equityRatioScore]} />
                <RatioRow label="Interest Coverage" value={liabilities > 0 ? `${interestCoverage.toFixed(2)}×` : 'N/A'} score={interestCoverageScore} desc="Ability to pay interest from profit. Above 2.5× is strong." impact={IMPACT.interestCoverage[interestCoverageScore]} last />
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Return on Capital</Text>
                <RatioRow label="Return on Assets (ROA)" value={`${returnOnAssets.toFixed(1)}%`} score={roaScore} desc="Profit as % of assets. Above 10% is strong." impact={IMPACT.roa[roaScore]} />
                <RatioRow label="Return on Equity (ROE)" value={`${returnOnEquity.toFixed(1)}%`} score={roeScore} desc="Profit as % of owner equity. Above 15% is strong." impact={IMPACT.roe[roeScore]} last />
            </View>

            {/* ── 2. WHAT THIS MEANS ───────────────────────────────────── */}
            <Text style={s.sectionLabel}>WHAT THIS MEANS</Text>

            {health.score < 50 && (
                <View style={[s.warningCard]}>
                    <Text style={s.warningTitle}>Poor Debt Management Risks</Text>
                    <Text style={s.warningText}>
                        • Difficulty obtaining future financing{'\n'}
                        • Reduced cash flow available for operations{'\n'}
                        • Higher stress on business relationships{'\n'}
                        • Limited ability to invest in growth{'\n'}
                        • Risk of financial distress
                    </Text>
                </View>
            )}

            {actionItems.length > 0 && (
                <View style={s.card}>
                    {actionItems.map((item, i) => (
                        <ActionItem key={i} color={item.color} text={item.text} />
                    ))}
                    <Text style={s.disclaimer}>
                        Ratios are based on opening balances set in Settings and cumulative transaction data. Update opening balances for accurate results.
                    </Text>
                </View>
            )}

            {/* ── 3. MANUAL TOOLS ──────────────────────────────────────── */}
            <Text style={s.sectionLabel}>MANUAL TOOLS</Text>
            <Text style={s.sectionSub}>Check a specific loan or purchase against your own numbers before committing to it.</Text>

            <Collapsible title="Loan ROI Check">
                <LoanROICalculator currency={currency} />
            </Collapsible>

            <Collapsible title="Buy vs. Finance">
                <BuyVsFinanceCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} />
            </Collapsible>

            <Collapsible title="Growth Affordability">
                <GrowthAffordabilityCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} />
            </Collapsible>

            <Collapsible title="Debt Structure Planner">
                <DebtStructurePlanner currency={currency} currentCashBalance={finance.cashBalance} baselineMonthlyNetCashFlow={monthlyProfit} />
            </Collapsible>

            <Collapsible title="Loan Affordability Check">
                <LoanAffordabilityChecker
                    currency={currency}
                    currentCashBalance={finance.cashBalance}
                    monthlyProfit={monthlyProfit}
                    existingMonthlyDebtService={existingMonthlyDebtService}
                    monthlyOperatingBurn={monthlyBurn}
                    transactions={transactions}
                />
            </Collapsible>

            {/* ── 4. REFERENCE ─────────────────────────────────────────── */}
            <Text style={s.sectionLabel}>REFERENCE</Text>
            <Collapsible title="Debt Management Playbook">
                <View style={s.card}>
                    <Text style={s.cardTitle}>Recommended Action Plan</Text>
                    <View style={{ gap: 10 }}>
                        <ActionStep num={1} title="Track Debt" desc="Monitor all liabilities monthly" />
                        <ActionStep num={2} title="Improve Profitability" desc="Increase margins to generate cash for debt repayment" />
                        <ActionStep num={3} title="Create Repayment Plan" desc="Prioritize high-interest debt first" />
                        <ActionStep num={4} title="Reduce Leverage" desc="Lower debt-to-equity ratio gradually" />
                        <ActionStep num={5} title="Review & Adjust" desc="Quarterly review of debt metrics and progress" />
                    </View>
                </View>
                <View style={s.card}>
                    <Text style={s.cardTitle}>Understanding Debt Management</Text>
                    <Text style={s.educationalText}>
                        <Text style={{ fontWeight: 'bold' }}>Good Debt:</Text> Investment in growth, equipment, or assets that generate revenue{'\n\n'}
                        <Text style={{ fontWeight: 'bold' }}>Bad Debt:</Text> Borrowing for operating expenses or consumption{'\n\n'}
                        <Text style={{ fontWeight: 'bold' }}>Key Principle:</Text> Only borrow if the return on investment exceeds the cost of borrowing
                    </Text>
                </View>
            </Collapsible>
        </View>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={summaryStyles.card}>
            <Text style={summaryStyles.label}>{label}</Text>
            <Text style={[summaryStyles.value, { color }]}>{value}</Text>
        </View>
    );
}

function RatioRow({ label, value, score, desc, impact, last }: {
    label: string; value: string; score: RatioScore; desc: string; impact?: string; last?: boolean;
}) {
    const color = healthColor(score);
    return (
        <View style={[ratioStyles.row, last && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }, { borderLeftColor: color }]}>
            <View style={ratioStyles.headRow}>
                <View style={ratioStyles.left}>
                    <Text style={ratioStyles.label}>{label}</Text>
                    <Text style={ratioStyles.desc}>{desc}</Text>
                </View>
                <View style={ratioStyles.right}>
                    <Text style={[ratioStyles.value, { color }]}>{value}</Text>
                    <View style={[ratioStyles.badge, { backgroundColor: color }]}>
                        <Text style={ratioStyles.badgeText}>{score === 'unscored' ? 'no data' : score}</Text>
                    </View>
                </View>
            </View>
            {impact && (
                <Text style={ratioStyles.impact}>
                    <Text style={{ fontWeight: '700', color }}>What this means: </Text>
                    {impact}
                </Text>
            )}
        </View>
    );
}

function ActionItem({ color, text }: { color: string; text: string }) {
    return (
        <View style={[actionStyles.item, { borderLeftColor: color }]}>
            <Text style={actionStyles.text}>{text}</Text>
        </View>
    );
}

function ActionStep({ num, title, desc }: { num: number; title: string; desc: string }) {
    return (
        <View style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{num}</Text></View>
            <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>{title}</Text>
                <Text style={s.stepDesc}>{desc}</Text>
            </View>
        </View>
    );
}

const summaryStyles = StyleSheet.create({
    card: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' },
    label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginBottom: 4 },
    value: { fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
});

const ratioStyles = StyleSheet.create({
    row: { borderLeftWidth: 4, paddingLeft: 12, paddingVertical: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headRow: { flexDirection: 'row', justifyContent: 'space-between' },
    left: { flex: 1, marginRight: 12 },
    label: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    desc: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
    right: { alignItems: 'flex-end', gap: 6 },
    value: { fontSize: 19, fontWeight: '800' },
    badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: '#fff', letterSpacing: 0.3 },
    impact: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 10 },
});

const actionStyles = StyleSheet.create({
    item: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10 },
    text: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});

const s = StyleSheet.create({
    sectionLabel: { fontSize: 11.5, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.6, marginTop: 6, marginBottom: 3 },
    sectionSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12, lineHeight: 17 },

    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    disclaimer: { fontSize: 10, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic', lineHeight: 15 },

    healthCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 16 },
    healthLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    healthStatus: { fontSize: 13, fontWeight: '600' },

    warningCard: { borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: Colors.expense, backgroundColor: Colors.expense + '15' },
    warningTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: Colors.expense },
    warningText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

    step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
    stepNumText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    stepTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
    stepDesc: { fontSize: 11, color: Colors.textMuted },

    educationalText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 20 },
});
