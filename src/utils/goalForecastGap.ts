/**
 * Goal vs Forecast — "Separate 'Goal' from 'Forecast'... Quad360 should
 * distinguish Target ('I want ₦30m revenue this year') from Forecast
 * ('Based on current performance, we currently expect approximately
 * ₦24m').
 *
 * goalAlignment.ts's computeRevenueMarginForecastAlignment already answers
 * a RELATED but different question for revenue_growth goals: "is your
 * near-term monthly RATE fast enough to hit the goal" (a pace check). This
 * answers the question the product-vision example is actually asking:
 * "what TOTAL will you actually reach by the deadline if that rate holds."
 * Same inputs, different framing -- reuses that exact same near-term
 * monthly figure (revenueForecast[0].projected) as this file's rate,
 * rather than a second, independently-tuned projection.
 *
 * Deliberately does NOT sum computeRevenueForecast's compounding multi
 * -month points to get a cumulative total -- that engine's own doc
 * comment already flags exactly why: "a sparse or volatile trailing-6
 * -month history can make later months balloon into numbers nothing here
 * should be built on." This extrapolates the same trusted near-term rate
 * LINEARLY across the remaining months instead, the same simplification
 * computeRevenueMarginForecastAlignment relies on -- honest about being an
 * approximation, not a claim that growth will actually compound that far
 * out.
 *
 * The existing Goal Bridge (goalBridgeEngine.ts) computes a different gap
 * again -- Target minus CURRENT, a snapshot of where the business is right
 * now, with no forecast involved at all. All three coexist because they
 * answer three different questions on the same underlying numbers.
 */

import { FinancialGoal, Transaction } from '../types';
import { computeRevenueForecast, latestTransactionDate } from './finance';

export interface GoalForecastGap {
    available: boolean;
    reason?: string;
    targetValue: number;
    currentValue: number;
    forecastValue: number;   // currentValue + (near-term monthly rate x monthsRemaining)
    nearTermMonthlyRate: number;
    gap: number;              // targetValue - forecastValue; negative means on pace to exceed the target
    monthsRemaining: number;
    headline: string;         // "Your target is ₦30m, but your current forecast is ₦24m."
    prompt: string;           // "What needs to change to close the ₦6m gap?"
}

const UNAVAILABLE = (targetValue: number, currentValue: number, reason: string): GoalForecastGap => ({
    available: false, reason, targetValue, currentValue, forecastValue: currentValue,
    nearTermMonthlyRate: 0, gap: targetValue - currentValue, monthsRemaining: 0, headline: '', prompt: '',
});

export function computeGoalForecastGap(goal: FinancialGoal, transactions: Transaction[], currency: string = '₦'): GoalForecastGap {
    if (goal.type !== 'revenue_growth') {
        return UNAVAILABLE(goal.targetValue, goal.currentValue, `Forecast-based gaps aren't available yet for ${goal.type.replace(/_/g, ' ')} goals.`);
    }

    const deadlineMs = new Date(goal.deadline).getTime();
    if (isNaN(deadlineMs)) {
        return UNAVAILABLE(goal.targetValue, goal.currentValue, 'This goal has no valid deadline to forecast against.');
    }

    const anchor = latestTransactionDate(transactions) ?? new Date();
    const msPerMonth = 30 * 24 * 60 * 60 * 1000;
    const monthsRemaining = Math.max(0, Math.round((deadlineMs - anchor.getTime()) / msPerMonth));

    if (monthsRemaining === 0) {
        // Deadline has arrived (or passed) -- the current value IS the
        // final value, nothing left to project.
        const gap = goal.targetValue - goal.currentValue;
        return {
            available: true, targetValue: goal.targetValue, currentValue: goal.currentValue,
            forecastValue: goal.currentValue, nearTermMonthlyRate: 0, gap, monthsRemaining: 0,
            headline: gap > 0
                ? `Your deadline has arrived at ${formatCurrency(goal.currentValue, currency)}, short of your ${formatCurrency(goal.targetValue, currency)} target.`
                : `Your deadline has arrived at ${formatCurrency(goal.currentValue, currency)}, meeting or exceeding your ${formatCurrency(goal.targetValue, currency)} target.`,
            prompt: '',
        };
    }

    // Same 3-month near-term forecast computeRevenueMarginForecastAlignment
    // reads (revenueForecast[0].projected) -- the nearest month is the one
    // meant to represent "current rate", not a longer, compounding horizon.
    const points = computeRevenueForecast(transactions, 3, anchor);
    if (points.length === 0) {
        return UNAVAILABLE(goal.targetValue, goal.currentValue, 'Not enough revenue history yet to forecast toward this goal.');
    }
    const nearTermMonthlyRate = points[0].projected;

    const forecastValue = goal.currentValue + nearTermMonthlyRate * monthsRemaining;
    const gap = goal.targetValue - forecastValue;

    const headline = gap > 0
        ? `Your target is ${formatCurrency(goal.targetValue, currency)}, but your current forecast is ${formatCurrency(forecastValue, currency)}.`
        : `Your target is ${formatCurrency(goal.targetValue, currency)}, and your current forecast is ${formatCurrency(forecastValue, currency)} -- on pace to meet or exceed it.`;
    const prompt = gap > 0
        ? `What needs to change to close the ${formatCurrency(gap, currency)} gap?`
        : '';

    return { available: true, targetValue: goal.targetValue, currentValue: goal.currentValue, forecastValue, nearTermMonthlyRate, gap, monthsRemaining, headline, prompt };
}

function formatCurrency(n: number, currency: string): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}
