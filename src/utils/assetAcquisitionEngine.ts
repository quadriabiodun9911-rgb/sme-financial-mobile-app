/**
 * Asset Acquisition Strategy Engine
 *
 * Compares the three ways to acquire an asset — pay cash, buy on credit
 * (installments, you own it), or lease (you rent it) — and evaluates each on
 * effect on PROFIT, CASH FLOW, and CASH BALANCE, plus whether the business's
 * cash reserve can cover it. Helps a user who might otherwise record a
 * credit/lease acquisition as a simple cash "purchase" understand the real
 * trade-offs.
 */

import { monthlyPayment } from './loanMath';

export type AcquisitionMethod = 'cash' | 'credit' | 'lease';

export interface AcquisitionInputs {
  cost: number;              // sticker price of the asset
  usefulLifeYears: number;   // for depreciation
  residualValue: number;     // salvage value at end of life
  termMonths: number;        // financing / lease term
  aprPercent: number;        // annual interest rate for credit
  cashBalance: number;       // current cash on hand
  monthlyProfit: number;     // current monthly profit
  minReserve: number;        // minimum cash reserve the business wants to keep
}

export interface AcquisitionOption {
  method: AcquisitionMethod;
  label: string;
  upfront: number;               // cash out today
  monthly: number;               // cash out each month
  termMonths: number;
  totalCashPaid: number;         // total paid over the term (+ upfront)
  extraVsCash: number;           // interest / lease premium over sticker price
  ownsAsset: boolean;
  monthlyProfitImpact: number;   // how much monthly profit is reduced
  cashAfterUpfront: number;      // cash balance immediately after any upfront
  affordableNow: boolean;        // can cover the upfront without going negative
  keepsReserve: boolean;         // cash after upfront stays >= min reserve
  serviceable: boolean;          // monthly outflow <= monthly profit
  note: string;
}

export interface AcquisitionAnalysis {
  options: AcquisitionOption[];
  recommended: AcquisitionMethod;
  rationale: string;
}

export function analyzeAcquisition(input: AcquisitionInputs): AcquisitionAnalysis {
  const { cost, usefulLifeYears, residualValue, termMonths, aprPercent, cashBalance, monthlyProfit, minReserve } = input;

  const life = usefulLifeYears > 0 ? usefulLifeYears : 5;
  const annualDepreciation = Math.max(0, (cost - residualValue)) / life;
  const monthlyDepreciation = annualDepreciation / 12;

  // ---- CASH ----
  const cashAfter = cashBalance - cost;
  const cash: AcquisitionOption = {
    method: 'cash',
    label: 'Pay Cash',
    upfront: cost,
    monthly: 0,
    termMonths: 0,
    totalCashPaid: cost,
    extraVsCash: 0,
    ownsAsset: true,
    // Non-cash: only depreciation hits profit, spread over the asset's life.
    monthlyProfitImpact: monthlyDepreciation,
    cashAfterUpfront: cashAfter,
    affordableNow: cashBalance >= cost,
    keepsReserve: cashAfter >= minReserve,
    serviceable: true,
    note: cashBalance >= cost
      ? 'No interest — cheapest overall. Ties up cash now.'
      : 'Not enough cash on hand to pay in full.',
  };

  // ---- CREDIT (installments; you own it) ----
  const creditMonthly = monthlyPayment(cost, aprPercent, termMonths);
  const creditTotal = creditMonthly * termMonths;
  const creditInterest = Math.max(0, creditTotal - cost);
  const credit: AcquisitionOption = {
    method: 'credit',
    label: 'Buy on Credit',
    upfront: 0,
    monthly: creditMonthly,
    termMonths,
    totalCashPaid: creditTotal,
    extraVsCash: creditInterest,
    ownsAsset: true,
    // You own it, so depreciation applies; interest is an extra expense.
    monthlyProfitImpact: monthlyDepreciation + (termMonths > 0 ? creditInterest / termMonths : 0),
    cashAfterUpfront: cashBalance,
    affordableNow: true,
    keepsReserve: true,
    serviceable: monthlyProfit >= creditMonthly,
    note: `Keeps cash now; costs ${creditInterest > 0 ? 'extra interest' : 'no interest'} over ${termMonths} months. You own the asset.`,
  };

  // ---- LEASE (you rent it; ~higher implicit rate, no ownership) ----
  const leaseRate = aprPercent + 6; // leases typically carry a higher implicit rate
  const leaseMonthly = monthlyPayment(cost, leaseRate, termMonths);
  const leaseTotal = leaseMonthly * termMonths;
  const lease: AcquisitionOption = {
    method: 'lease',
    label: 'Lease',
    upfront: 0,
    monthly: leaseMonthly,
    termMonths,
    totalCashPaid: leaseTotal,
    extraVsCash: Math.max(0, leaseTotal - cost),
    ownsAsset: false,
    // Lease payments are fully expensed each month; no asset, no depreciation.
    monthlyProfitImpact: leaseMonthly,
    cashAfterUpfront: cashBalance,
    affordableNow: true,
    keepsReserve: true,
    serviceable: monthlyProfit >= leaseMonthly,
    note: 'Preserves cash and is fully tax-deductible, but you never own the asset and it usually costs the most.',
  };

  const options = [cash, credit, lease];

  // ---- Recommendation ----
  let recommended: AcquisitionMethod;
  let rationale: string;

  if (cash.affordableNow && cash.keepsReserve) {
    recommended = 'cash';
    rationale = `You can pay cash and still keep your minimum reserve — this avoids all interest and is the cheapest option. After paying, cash drops to ${fmtShort(cashAfter)} and profit is only reduced by depreciation (~${fmtShort(monthlyDepreciation)}/mo).`;
  } else if (!cash.affordableNow || !cash.keepsReserve) {
    // Cash would break the reserve or isn't available — preserve cash instead.
    if (credit.serviceable) {
      recommended = 'credit';
      rationale = `Paying cash would ${cash.affordableNow ? 'drop you below your minimum reserve' : 'exceed your available cash'}. Buying on credit preserves cash; the ${fmtShort(creditMonthly)}/mo payment is covered by your ${fmtShort(monthlyProfit)}/mo profit. You still own the asset, at ${fmtShort(creditInterest)} extra interest.`;
    } else if (lease.serviceable) {
      recommended = 'lease';
      rationale = `Cash would break your reserve and the credit payment (${fmtShort(creditMonthly)}/mo) is more than your monthly profit. Leasing has the lowest commitment your profit can service (${fmtShort(leaseMonthly)}/mo) and keeps cash free — though you won't own the asset.`;
    } else {
      recommended = 'lease';
      rationale = `⚠ This asset looks unaffordable right now: paying cash breaks your reserve, and neither the credit (${fmtShort(creditMonthly)}/mo) nor lease (${fmtShort(leaseMonthly)}/mo) payment is covered by your ${fmtShort(monthlyProfit)}/mo profit. Consider a cheaper asset, a longer term, or growing revenue first.`;
    }
  } else {
    recommended = 'cash';
    rationale = 'Cash is the cheapest route here.';
  }

  return { options, recommended, rationale };
}

function fmtShort(n: number): string {
  const v = Math.round(n);
  return v.toLocaleString();
}
