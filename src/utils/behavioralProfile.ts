/**
 * Business Behavioral Profile — the spine that chains Quad360's real,
 * already-computed pattern/diagnosis/prediction/prescription engines into
 * one coherent evolution: "here's what's happening" -> "here's what's
 * likely to happen" -> "here's what you should do" -> "here's the type of
 * capital that fits your business."
 *
 * Every dimension composed here already exists as its own self-contained
 * engine elsewhere in the app (seasonality.ts, qualityOfGrowth.ts,
 * costExposureForecast.ts, businessFinancialDNA.ts's deviation detector,
 * customerPaymentBehavior.ts's per-customer payment history,
 * financingRecommendation.ts). This file is deliberately thin: it never
 * computes a new number or invents a verdict, it only pulls each engine's
 * own real output into one narrative — so nothing here can drift out of
 * sync with the screen that already shows each piece on its own, and a
 * business only sees a stage once the underlying engine says it has enough
 * real history to speak (seasonality needs 12 months, growth quality needs
 * two full years, etc.) rather than a stage being fabricated to fill a slot.
 */

import { Transaction, Invoice, Loan, InventoryItem, Asset, BusinessSettings, User } from '../types';
import { computeSeasonalityPattern } from './seasonality';
import { computeQualityOfGrowth } from './qualityOfGrowth';
import { computeCostExposureForecast } from './costExposureForecast';
import { detectDNADeviations } from './businessFinancialDNA';
import { computeCustomerPaymentHistory, describePaymentPersonality } from './customerPaymentBehavior';
import { buildFinancingFitInput } from './financingFit';
import { recommendFinancingTypes, FinancingRecommendation } from './financingRecommendation';
import { ReadinessTrend } from './readinessHistory';

export interface BehavioralProfileInput {
    transactions: Transaction[];
    invoices: Invoice[];
    assets: Asset[];
    loans: Loan[];
    inventory: InventoryItem[];
    settings: BusinessSettings;
    user: Pick<User, 'daysActive'> | null | undefined;
    // Null when the caller has no persisted readiness history to compute a
    // trend from (e.g. demo mode) — recommendFinancingTypes already treats
    // that as "no basis for this one signal" rather than guessing.
    readinessTrend?: ReadinessTrend | null;
    // The caller's own already-computed top action (e.g.
    // diagnosis.topOpportunities[0]) — this file never re-runs a full
    // diagnosis just to produce one prescriptive line.
    topActionSummary?: string | null;
}

export interface BehavioralProfile {
    // True once at least one dimension had enough real history to say
    // something — never forced true just to avoid an empty section.
    available: boolean;
    whatsHappening: string[];
    whatsLikely: string[];
    whatToDo: string[];
    capitalFit: FinancingRecommendation[];
    // One connected paragraph chaining whichever stages are populated, for
    // a single place (Business Passport, AI Advisor) to quote directly.
    narrative: string;
}

export function buildBehavioralProfile(input: BehavioralProfileInput): BehavioralProfile {
    const { transactions, invoices, assets, loans, inventory, settings, user, readinessTrend = null, topActionSummary = null } = input;
    const currency = settings.currency;

    const whatsHappening: string[] = [];
    const whatsLikely: string[] = [];
    const whatToDo: string[] = [];

    // ---- Revenue pattern: does this business have a real seasonal shape? ----
    const seasonality = computeSeasonalityPattern(transactions);
    if (seasonality.available && (seasonality.peakMonths.length > 0 || seasonality.troughMonths.length > 0)) {
        const parts: string[] = [];
        if (seasonality.peakMonths[0]) parts.push(`peaks around ${seasonality.peakMonths[0].monthName} (+${Math.round((seasonality.peakMonths[0].index - 1) * 100)}%)`);
        if (seasonality.troughMonths[0]) parts.push(`dips around ${seasonality.troughMonths[0].monthName} (${Math.round((seasonality.troughMonths[0].index - 1) * 100)}%)`);
        whatsHappening.push(`Revenue ${parts.join(' and ')} most years.`);
    }

    // ---- Growth quality: is revenue growth actually healthy? ----
    const growthQuality = computeQualityOfGrowth(transactions, assets, loans);
    if (growthQuality.available) {
        whatsHappening.push(growthQuality.verdict);
        if ((growthQuality.band === 'Weak' || growthQuality.band === 'Critical') && growthQuality.flags[0]) {
            whatsLikely.push(`If this continues: ${growthQuality.flags[0]}`);
        }
    }

    // ---- Structural deviation from the business's own baseline ----
    const notableDeviation = detectDNADeviations(transactions, currency).find(d => d.severity !== 'info');
    if (notableDeviation) {
        whatsHappening.push(`${notableDeviation.metric}: ${notableDeviation.changeDescription}`);
    }

    // ---- Expense trajectory: is a rising category on track to erode profit? ----
    const costForecast = computeCostExposureForecast(transactions, settings.macroAssumptions ?? []);
    if (costForecast.available && costForecast.drivers.length > 0) {
        const driverList = costForecast.drivers.map(d => d.category).join(', ');
        whatsHappening.push(`${driverList} ${costForecast.drivers.length === 1 ? 'is' : 'are'} rising faster than revenue right now.`);
        if (costForecast.totalProfitErosion > 0) whatsLikely.push(costForecast.verdict);
    }

    // ---- Customer payment behavior: has any customer shown a real pattern? ----
    // Gated inside computeCustomerPaymentHistory on real Invoice.paidDate
    // history (see customerPaymentBehavior.ts) -- a customer only earns a
    // personality label once they have enough dated paid invoices behind
    // them, so this says nothing for a business too new to have that yet.
    const worstPayer = computeCustomerPaymentHistory(invoices)
        .find(h => h.personality === 'serial_late_payer' || h.personality === 'inconsistent');
    if (worstPayer) {
        whatsHappening.push(`${worstPayer.customerName}: ${describePaymentPersonality(worstPayer)}`);
        if (worstPayer.trend === 'worsening') {
            whatsLikely.push(`${worstPayer.customerName}'s payment timing is trending worse — expect more cash tied up waiting on them if it continues.`);
        }
    }

    // ---- Prescription: the caller's own real top action, never re-derived here ----
    if (topActionSummary) whatToDo.push(topActionSummary);

    // ---- Capital that fits: reuse the financing-fit engine verbatim ----
    const fitInput = buildFinancingFitInput(transactions, loans, settings, user);
    const capitalFit = recommendFinancingTypes({ fitInput, invoices, assets, readinessTrend, transactions, inventory }, currency);

    const available = whatsHappening.length > 0 || whatsLikely.length > 0 || whatToDo.length > 0 || capitalFit.length > 0;

    // Each source string (a diagnosis verdict, a caller-supplied action, a
    // financing reason) already ends its own sentence without necessarily
    // ending in punctuation -- add a period before joining so two stages
    // never run together as one unpunctuated sentence.
    const asSentence = (s: string) => /[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;

    const narrativeParts: string[] = [];
    if (whatsHappening.length > 0) narrativeParts.push(asSentence(`Here's what's happening: ${whatsHappening[0]}`));
    if (whatsLikely.length > 0) narrativeParts.push(asSentence(`Here's what's likely: ${whatsLikely[0]}`));
    if (whatToDo.length > 0) narrativeParts.push(asSentence(`Here's what to do: ${whatToDo[0]}`));
    if (capitalFit.length > 0) narrativeParts.push(asSentence(`Here's the capital that fits: ${capitalFit[0].label} — ${capitalFit[0].reasons[0]}`));

    const narrative = narrativeParts.length > 0
        ? narrativeParts.join(' ')
        : 'Not enough recorded history yet to build a behavioral profile — keep logging transactions and this will fill in.';

    return { available, whatsHappening, whatsLikely, whatToDo, capitalFit, narrative };
}
