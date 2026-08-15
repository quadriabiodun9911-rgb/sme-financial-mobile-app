/**
 * Shared listing-editor fields for a FinancingProduct — used by both
 * FinancingAdminScreen.tsx (Quad360-staff-entered listings) and the "My
 * Listings" tab in LenderPipelineScreen.tsx (a signed-in lender org
 * managing its own listings, see migration 011). Pulled out once the same
 * ~15-field form needed to exist in both places, instead of forking it.
 */

import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { ChipGroup } from './ui/ChipGroup';
import { FinancingProduct, FinancingProductType, LenderType, Industry } from '../types';

export const LENDER_TYPES: { value: LenderType; label: string }[] = [
    { value: 'bank', label: 'Bank' },
    { value: 'fintech', label: 'Fintech' },
    { value: 'dfi', label: 'DFI' },
    { value: 'microfinance', label: 'Microfinance' },
];

export const PRODUCT_TYPES: { value: FinancingProductType; label: string }[] = [
    { value: 'asset_financing', label: 'Asset Financing' },
    { value: 'working_capital', label: 'Working Capital' },
    { value: 'invoice_financing', label: 'Invoice Financing' },
    { value: 'trade_finance', label: 'Trade Finance' },
    { value: 'term_loan', label: 'Term Loan' },
    { value: 'overdraft', label: 'Overdraft' },
];

export const INDUSTRIES: { value: Industry; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'retail', label: 'Retail' },
    { value: 'food-service', label: 'Food Service' },
    { value: 'manufacturing', label: 'Manufacturing' },
    { value: 'professional-services', label: 'Professional Services' },
];

export function emptyFinancingProduct(): FinancingProduct {
    return {
        id: '',
        lenderName: '',
        lenderType: 'bank',
        productType: 'working_capital',
        productName: '',
        description: '',
        minAmount: 0,
        maxAmount: 0,
        minTermMonths: 0,
        maxTermMonths: 0,
        interestRateMinPct: 0,
        interestRateMaxPct: 0,
        eligibility: {},
        status: 'active',
    };
}

// Parses a form text field to a number, treating blank as undefined so
// optional eligibility criteria genuinely stay unset rather than becoming 0
// (a 0 minimum would silently mean "no requirement" in most of these
// fields, which is a real, different meaning from "not specified").
export function parseFormNumber(text: string): number | undefined {
    const v = parseFloat(text.replace(/[^0-9.]/g, ''));
    return isNaN(v) ? undefined : v;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={fs.fieldLabel}>{label}</Text>
            {children}
        </View>
    );
}

export function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number | undefined) => void }) {
    return (
        <View style={{ flex: 1 }}>
            <Text style={fs.numFieldLabel}>{label}</Text>
            <TextInput
                style={fs.input}
                keyboardType="numeric"
                value={value ? value.toString() : ''}
                onChangeText={t => onChange(parseFormNumber(t))}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
            />
        </View>
    );
}

interface FinancingProductFormProps {
    form: FinancingProduct;
    setForm: React.Dispatch<React.SetStateAction<FinancingProduct>>;
    // Hides the Status chip (Active/Inactive) — used by the lender
    // self-service tab, where new listings should just start active rather
    // than exposing a "publish now or hold back" toggle non-admins don't
    // need on day one. Editing an existing listing still shows it.
    hideStatusForNew?: boolean;
}

export function FinancingProductForm({ form, setForm, hideStatusForNew }: FinancingProductFormProps) {
    const n = parseFormNumber;
    return (
        <>
            <Field label="Lender Name">
                <TextInput style={fs.input} value={form.lenderName} onChangeText={t => setForm(f => ({ ...f, lenderName: t }))} placeholder="e.g. First City Bank" placeholderTextColor={Colors.textMuted} />
            </Field>

            <ChipGroup
                label="Lender Type"
                style={fs.fieldSpacing}
                options={LENDER_TYPES}
                value={form.lenderType}
                onChange={v => setForm(f => ({ ...f, lenderType: v ?? f.lenderType }))}
                allowDeselect={false}
            />

            <ChipGroup
                label="Product Type"
                style={fs.fieldSpacing}
                options={PRODUCT_TYPES}
                value={form.productType}
                onChange={v => setForm(f => ({ ...f, productType: v ?? f.productType }))}
                allowDeselect={false}
            />

            <Field label="Product Name">
                <TextInput style={fs.input} value={form.productName} onChangeText={t => setForm(f => ({ ...f, productName: t }))} placeholder="e.g. Equipment Financing" placeholderTextColor={Colors.textMuted} />
            </Field>

            <Field label="Description">
                <TextInput style={[fs.input, { height: 70 }]} value={form.description} onChangeText={t => setForm(f => ({ ...f, description: t }))} multiline placeholder="What this product is for, in one or two sentences" placeholderTextColor={Colors.textMuted} />
            </Field>

            <Text style={fs.sectionLabel}>Amount range</Text>
            <View style={fs.row}>
                <NumField label="Min" value={form.minAmount} onChange={v => setForm(f => ({ ...f, minAmount: v ?? 0 }))} />
                <NumField label="Max" value={form.maxAmount} onChange={v => setForm(f => ({ ...f, maxAmount: v ?? 0 }))} />
            </View>

            <Text style={fs.sectionLabel}>Term (months)</Text>
            <View style={fs.row}>
                <NumField label="Min" value={form.minTermMonths} onChange={v => setForm(f => ({ ...f, minTermMonths: v ?? 0 }))} />
                <NumField label="Max" value={form.maxTermMonths} onChange={v => setForm(f => ({ ...f, maxTermMonths: v ?? 0 }))} />
            </View>

            <Text style={fs.sectionLabel}>Interest rate (% p.a.)</Text>
            <View style={fs.row}>
                <NumField label="Min" value={form.interestRateMinPct} onChange={v => setForm(f => ({ ...f, interestRateMinPct: v ?? 0 }))} />
                <NumField label="Max" value={form.interestRateMaxPct} onChange={v => setForm(f => ({ ...f, interestRateMaxPct: v ?? 0 }))} />
            </View>

            <Text style={fs.sectionTitle}>Eligibility (all optional — leave blank for "no requirement")</Text>

            <Field label="Min monthly revenue">
                <TextInput style={fs.input} keyboardType="numeric" value={form.eligibility.minMonthlyRevenue?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minMonthlyRevenue: n(t) } }))} placeholderTextColor={Colors.textMuted} />
            </Field>
            <Field label="Min business age (months)">
                <TextInput style={fs.input} keyboardType="numeric" value={form.eligibility.minBusinessAgeMonths?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minBusinessAgeMonths: n(t) } }))} placeholderTextColor={Colors.textMuted} />
            </Field>
            <Field label="Min DSCR (e.g. 1.25)">
                <TextInput style={fs.input} keyboardType="numeric" value={form.eligibility.minDSCR?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minDSCR: n(t) } }))} placeholderTextColor={Colors.textMuted} />
            </Field>
            <Field label="Min equity contribution %">
                <TextInput style={fs.input} keyboardType="numeric" value={form.eligibility.minEquityContributionPct?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minEquityContributionPct: n(t) } }))} placeholderTextColor={Colors.textMuted} />
            </Field>
            <Field label="Max debt-to-revenue ratio (e.g. 0.5)">
                <TextInput style={fs.input} keyboardType="numeric" value={form.eligibility.maxDebtToRevenueRatio?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, maxDebtToRevenueRatio: n(t) } }))} placeholderTextColor={Colors.textMuted} />
            </Field>
            <Field label="Min transaction history (months)">
                <TextInput style={fs.input} keyboardType="numeric" value={form.eligibility.minTransactionHistoryMonths?.toString() ?? ''} onChangeText={t => setForm(f => ({ ...f, eligibility: { ...f.eligibility, minTransactionHistoryMonths: n(t) } }))} placeholderTextColor={Colors.textMuted} />
            </Field>

            <ChipGroup<Industry>
                multiple
                label="Eligible industries (none selected = open to all)"
                style={fs.fieldSpacing}
                options={INDUSTRIES}
                value={form.eligibility.eligibleIndustries ?? []}
                onChange={next => setForm(f => ({ ...f, eligibility: { ...f.eligibility, eligibleIndustries: next } }))}
            />

            {!(hideStatusForNew && !form.id) && (
                <ChipGroup
                    label="Status"
                    style={fs.fieldSpacing}
                    options={[{ value: 'active' as const, label: 'Active' }, { value: 'inactive' as const, label: 'Inactive' }]}
                    value={form.status ?? 'active'}
                    onChange={v => setForm(f => ({ ...f, status: v ?? 'active' }))}
                    allowDeselect={false}
                />
            )}
        </>
    );
}

const fs = StyleSheet.create({
    fieldLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    numFieldLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 6, marginBottom: 12 },
    fieldSpacing: { marginBottom: 14 },
});
