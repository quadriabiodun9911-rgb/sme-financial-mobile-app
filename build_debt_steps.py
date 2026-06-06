#!/usr/bin/env python3
"""Add Steps 3-6 to the Debt Management Strategies section."""

filepath = "/Users/abiodunquadri/kivy/new work foler /sme-financial-mobile-app/App.tsx"

with open(filepath, 'r') as f:
    content = f.read()

# 1. Replace the strategy sub-tab row to include all 7 tabs
old_subtabs = """                                        {/* Strategy sub-tabs */}
                                        <View style={{ flexDirection: 'row', marginBottom: 12, backgroundColor: '#0f172a', borderRadius: 8, padding: 4 }}>
                                            {(['optimize', 'restructure', 'recover'] as const).map((strategy) => (
                                                <TouchableOpacity
                                                    key={strategy}
                                                    style={{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: debtStrategyType === strategy ? '#2563eb' : 'transparent', alignItems: 'center' }}
                                                    onPress={() => setDebtStrategyType(strategy)}
                                                >
                                                    <Text style={{ fontSize: 11, fontWeight: '600', color: debtStrategyType === strategy ? '#fff' : '#94a3b8' }}>
                                                        {strategy === 'optimize' ? '🟢 Optimize' : strategy === 'restructure' ? '🟡 Restructure' : '🔴 Recover'}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>"""

new_subtabs = """                                        {/* Strategy sub-tabs */}
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                                            <View style={{ flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 8, padding: 4 }}>
                                                {(['optimize', 'restructure', 'recover', 'repayment', 'negotiate', 'cashflow', 'monitor'] as const).map((strategy) => (
                                                    <TouchableOpacity
                                                        key={strategy}
                                                        style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, marginHorizontal: 2, backgroundColor: debtStrategyType === strategy ? '#2563eb' : 'transparent', alignItems: 'center' }}
                                                        onPress={() => setDebtStrategyType(strategy)}
                                                    >
                                                        <Text style={{ fontSize: 10, fontWeight: '600', color: debtStrategyType === strategy ? '#fff' : '#94a3b8' }}>
                                                            {strategy === 'optimize' ? '🟢 Optimize' : strategy === 'restructure' ? '🟡 Restructure' : strategy === 'recover' ? '🔴 Recover' : strategy === 'repayment' ? '📊 Repayment' : strategy === 'negotiate' ? '🤝 Negotiate' : strategy === 'cashflow' ? '💰 Cash Flow' : '📈 Monitor'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </ScrollView>"""

if old_subtabs in content:
    content = content.replace(old_subtabs, new_subtabs)
    print("Strategy sub-tabs replaced successfully!")
else:
    print("ERROR: Could not find old sub-tabs!")

# 2. Add Steps 3-6 content after the Recover section closing
# Find the closing of the Recover section and the strategies section
old_closing = """                                                </View>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        )}

                        {/* TAB 6: FINANCIAL PLANNING & ANALYSIS (FP&A) */}"""

new_steps = """                                                </View>
                                            </View>
                                        )}

                                        {/* ===== STEP 3: REPAYMENT PLAN ===== */}
                                        {debtStrategyType === 'repayment' && (
                                            <View>
                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#38bdf8', marginBottom: 4 }}>Step 3: Create a Repayment Plan</Text>
                                                    <Text style={{ fontSize: 9, color: '#94a3b8', marginBottom: 10 }}>Choose your method and calculate your capacity to repay</Text>

                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>Choose Your Method</Text>
                                                    <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Method</Text>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Approach</Text>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Best For</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Debt Avalanche</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Pay highest interest first</Text>
                                                        <Text style={[styles.tdCell, { flex: 1 }]}>Saving the most money</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Debt Snowball</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Pay smallest balances first</Text>
                                                        <Text style={[styles.tdCell, { flex: 1 }]}>Building momentum, confidence</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 8, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
                                                        The avalanche method saves more on interest. The snowball method provides psychological wins that keep you motivated.
                                                    </Text>
                                                </View>

                                                {/* Debt Service Coverage */}
                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>📐 Debt Service Coverage Ratio</Text>
                                                    <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                                                        <Text style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center' }}>
                                                            Debt Service Coverage = Monthly Net Profit ÷ Total Monthly Payments
                                                        </Text>
                                                        <View style={{ flexDirection: 'row', marginTop: 8 }}>
                                                            <View style={{ flex: 1, alignItems: 'center' }}>
                                                                <Text style={{ fontSize: 8, color: '#64748b' }}>Monthly Net Profit</Text>
                                                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#f8fafc' }}>{currency}{Math.round(finance.profit / 12).toLocaleString()}</Text>
                                                            </View>
                                                            <View style={{ justifyContent: 'center', paddingHorizontal: 8 }}>
                                                                <Text style={{ fontSize: 16, color: '#64748b' }}>÷</Text>
                                                            </View>
                                                            <View style={{ flex: 1, alignItems: 'center' }}>
                                                                <Text style={{ fontSize: 8, color: '#64748b' }}>Monthly Payments</Text>
                                                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#f59e0b' }}>{currency}{totalMonthlyPayments.toLocaleString()}</Text>
                                                            </View>
                                                            <View style={{ justifyContent: 'center', paddingHorizontal: 8 }}>
                                                                <Text style={{ fontSize: 16, color: '#64748b' }}>=</Text>
                                                            </View>
                                                            <View style={{ flex: 1, alignItems: 'center' }}>
                                                                <Text style={{ fontSize: 8, color: '#64748b' }}>DSCR</Text>
                                                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: debtServiceRatio > 0 ? (finance.profit / 12 / Math.max(totalMonthlyPayments, 1) > 1.25 ? '#10b981' : finance.profit / 12 / Math.max(totalMonthlyPayments, 1) > 1.0 ? '#f59e0b' : '#ef4444') : '#94a3b8' }}>
                                                                    {totalMonthlyPayments > 0 ? (finance.profit / 12 / totalMonthlyPayments).toFixed(2) + 'x' : 'N/A'}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                    <View style={{ flexDirection: 'row' }}>
                                                        <View style={{ flex: 1, backgroundColor: '#064e3b20', padding: 6, borderRadius: 4, marginRight: 4, borderWidth: 1, borderColor: '#10b981' }}>
                                                            <Text style={{ fontSize: 7, color: '#10b981', fontWeight: 'bold' }}>&gt; 1.25x</Text>
                                                            <Text style={{ fontSize: 7, color: '#6ee7b7' }}>Healthy</Text>
                                                        </View>
                                                        <View style={{ flex: 1, backgroundColor: '#78350f20', padding: 6, borderRadius: 4, marginHorizontal: 4, borderWidth: 1, borderColor: '#f59e0b' }}>
                                                            <Text style={{ fontSize: 7, color: '#f59e0b', fontWeight: 'bold' }}>1.0x - 1.25x</Text>
                                                            <Text style={{ fontSize: 7, color: '#fcd34d' }}>Warning zone</Text>
                                                        </View>
                                                        <View style={{ flex: 1, backgroundColor: '#7f1d1d20', padding: 6, borderRadius: 4, marginLeft: 4, borderWidth: 1, borderColor: '#ef4444' }}>
                                                            <Text style={{ fontSize: 7, color: '#ef4444', fontWeight: 'bold' }}>&lt; 1.0x</Text>
                                                            <Text style={{ fontSize: 7, color: '#fca5a5' }}>Crisis — restructure</Text>
                                                        </View>
                                                    </View>
                                                </View>

                                                {/* Payment Priorities */}
                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12 }}>
                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>🎯 Payment Priorities</Text>
                                                    <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                        <Text style={[styles.thCell, { width: 25 }]}>#</Text>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Debt Type</Text>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Action</Text>
                                                    </View>
                                                    <View style={[styles.tableRow, { backgroundColor: '#7f1d1d10' }]}>
                                                        <Text style={[styles.tdCell, { width: 25, fontWeight: 'bold', color: '#ef4444' }]}>1</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Payroll, taxes, critical suppliers</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#ef4444', fontWeight: '600' }]}>Pay immediately</Text>
                                                    </View>
                                                    <View style={[styles.tableRow, { backgroundColor: '#78350f10' }]}>
                                                        <Text style={[styles.tdCell, { width: 25, fontWeight: 'bold', color: '#f59e0b' }]}>2</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Secured debt (asset at risk)</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#f59e0b', fontWeight: '600' }]}>Pay on schedule</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { width: 25, fontWeight: 'bold', color: '#f59e0b' }]}>3</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>High-interest debt (&gt;12%)</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#f59e0b', fontWeight: '600' }]}>Accelerate payments</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { width: 25, fontWeight: 'bold', color: '#10b981' }]}>4</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Low-interest term loans</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#10b981', fontWeight: '600' }]}>Pay as agreed</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { width: 25, fontWeight: 'bold', color: '#64748b' }]}>5</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Owner loans</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#64748b', fontWeight: '600' }]}>Pay last</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        )}

                                        {/* ===== STEP 4: NEGOTIATE WITH CREDITORS ===== */}
                                        {debtStrategyType === 'negotiate' && (
                                            <View>
                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#a78bfa', marginBottom: 4 }}>Step 4: Negotiate With Creditors</Text>
                                                    <Text style={{ fontSize: 9, color: '#94a3b8', marginBottom: 10 }}>When to negotiate, what to request, and how to prepare</Text>

                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>⏰ When to Negotiate</Text>
                                                    <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Situation</Text>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Timing</Text>
                                                        <Text style={[styles.thCell, { flex: 0.8 }]}>Success</Text>
                                                    </View>
                                                    <View style={[styles.tableRow, { backgroundColor: '#064e3b10' }]}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Cash flow temporarily tight</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#10b981' }]}>Before missing payment</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981', fontWeight: '600' }]}>High</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Permanent business change</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#f59e0b' }]}>As soon as you know</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#f59e0b', fontWeight: '600' }]}>Medium</Text>
                                                    </View>
                                                    <View style={[styles.tableRow, { backgroundColor: '#78350f10' }]}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Already missed payment</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#f59e0b' }]}>Immediately</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#f59e0b', fontWeight: '600' }]}>Lower but possible</Text>
                                                    </View>
                                                    <View style={[styles.tableRow, { backgroundColor: '#7f1d1d10' }]}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Legal action started</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#ef4444' }]}>Urgently — with attorney</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#ef4444', fontWeight: '600' }]}>Low</Text>
                                                    </View>
                                                </View>

                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>📋 What You Can Request</Text>
                                                    <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Request</Text>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Typical Outcome</Text>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Impact</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Lower interest rate</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Often granted for good customers</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#10b981' }]}>Lower payments</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Extended term</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Commonly approved</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#f59e0b' }]}>Lower payments, more total interest</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Payment holiday (1-3 mo)</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Possible for temporary issues</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#10b981' }]}>Breathing room</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Principal reduction</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Rare, requires severe distress</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#10b981' }]}>Significant relief</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 8, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
                                                        Many creditors are willing to work with borrowers, especially those facing temporary financial challenges.
                                                    </Text>
                                                </View>

                                                <View style={{ backgroundColor: '#2d1b69', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#7c3aed' }}>
                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#c4b5fd', marginBottom: 6 }}>🗣️ The Negotiation Script</Text>
                                                    <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 10 }}>
                                                        <Text style={{ fontSize: 8, color: '#cbd5e1', lineHeight: 14, fontStyle: 'italic' }}>
                                                            "Hello [Name], this is [You] from [Business]. We value our relationship with you.{'\\n\\n'}
                                                            Our revenue is currently [X%] below normal due to [specific reason]. We want to pay you in full, but we need temporary relief.{'\\n\\n'}
                                                            We are requesting [specific request]. We can provide financial statements to verify our situation.{'\\n\\n'}
                                                            Can we make this work?"
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12 }}>
                                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>📄 Documentation to Prepare Before Calling</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                        <Text style={{ fontSize: 12, color: '#38bdf8', marginRight: 6 }}>📊</Text>
                                                        <Text style={{ fontSize: 9, color: '#cbd5e1' }}>Current P&L (last 3 months)</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                        <Text style={{ fontSize: 12, color: '#38bdf8', marginRight: 6 }}>📈</Text>
                                                        <Text style={{ fontSize: 9, color: '#cbd5e1' }}>Cash flow forecast (next 13 weeks)</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                        <Text style={{ fontSize: 12, color: '#38bdf8', marginRight: 6 }}>📒</Text>
                                                        <Text style={{ fontSize: 9, color: '#cbd5e1' }}>Debt inventory (full picture)</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                        <Text style={{ fontSize: 12, color: '#38bdf8', marginRight: 6 }}>💡</Text>
                                                        <Text style={{ fontSize: 9, color: '#cbd5e1' }}>Specific payment proposal</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        )}

                                        {/* ===== STEP 5: IMPROVE CASH FLOW ===== */}
                                        {debtStrategyType === 'cashflow' && (
                                            <View>
                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#10b981', marginBottom: 4 }}>Step 5: Improve Cash Flow to Accelerate Repayment</Text>
                                                    <Text style={{ fontSize: 9, color: '#94a3b8', marginBottom: 10 }}>Immediate cash actions and cost reduction opportunities</Text>

                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>⚡ Immediate Cash Actions</Text>
                                                    <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Tactic</Text>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Expected Impact</Text>
                                                        <Text style={[styles.thCell, { flex: 0.6 }]}>Difficulty</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Invoice factoring</Text>
                                                        <Text style={[styles.tdCell, { flex: 1 }]}>Get cash in 24-48 hours</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.6, color: '#10b981' }]}>Low</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Early payment discounts (2%/10, net 30)</Text>
                                                        <Text style={[styles.tdCell, { flex: 1 }]}>Accelerate by 15-20 days</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.6, color: '#10b981' }]}>Low</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Require deposits on large orders</Text>
                                                        <Text style={[styles.tdCell, { flex: 1 }]}>Reduce working capital needs</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.6, color: '#f59e0b' }]}>Medium</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Renegotiate supplier (net 30 → net 60)</Text>
                                                        <Text style={[styles.tdCell, { flex: 1 }]}>Free 30 days of cash flow</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.6, color: '#f59e0b' }]}>Medium</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Clearance on slow inventory</Text>
                                                        <Text style={[styles.tdCell, { flex: 1 }]}>Convert stock to cash</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.6, color: '#10b981' }]}>Low</Text>
                                                    </View>
                                                </View>

                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12 }}>
                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>✂️ Cost Reduction Opportunities</Text>
                                                    <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Category</Text>
                                                        <Text style={[styles.thCell, { flex: 0.8 }]}>Monthly Savings</Text>
                                                        <Text style={[styles.thCell, { flex: 0.8 }]}>Time to Implement</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Software subscriptions</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981' }]}>$500-2,000</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981' }]}>2 hours</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Renegotiate rent</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981' }]}>$1,000-5,000</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#f59e0b' }]}>2-4 weeks</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Pause low-ROI marketing</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981' }]}>$1,000-10,000</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981' }]}>1 day</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Shop insurance rates</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981' }]}>$500-2,000</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#f59e0b' }]}>2 weeks</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        )}

                                        {/* ===== STEP 6: MONITOR AND MAINTAIN ===== */}
                                        {debtStrategyType === 'monitor' && (
                                            <View>
                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#f59e0b', marginBottom: 4 }}>Step 6: Monitor and Maintain</Text>
                                                    <Text style={{ fontSize: 9, color: '#94a3b8', marginBottom: 10 }}>Monthly debt health check and building financial resilience</Text>

                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>🩺 Monthly Debt Health Check</Text>
                                                    <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Metric</Text>
                                                        <Text style={[styles.thCell, { flex: 0.8 }]}>Target</Text>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Action if Below Target</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Debt Service Coverage</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981', fontWeight: '600' }]}>&gt; 1.25x</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Restructure or increase cash flow</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Debt-to-Equity Ratio</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981', fontWeight: '600' }]}>&lt; 3x</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Reduce debt or add equity</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>Cash Runway</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981', fontWeight: '600' }]}>&gt; 4 weeks</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Cut expenses or accelerate collections</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1, fontWeight: '600', color: '#f8fafc' }]}>High-Interest Debt</Text>
                                                        <Text style={[styles.tdCell, { flex: 0.8, color: '#10b981', fontWeight: '600' }]}>&lt; 12% APR</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Refinance or pay down</Text>
                                                    </View>
                                                </View>

                                                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 }}>🛡️ Build Financial Resilience</Text>
                                                    <View style={[styles.tableRow, styles.bgSlateDark]}>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Practice</Text>
                                                        <Text style={[styles.thCell, { flex: 1 }]}>Target</Text>
                                                        <Text style={[styles.thCell, { flex: 1.2 }]}>Why It Matters</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Cash reserve</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#38bdf8' }]}>3-6 months of expenses</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Weather unexpected shocks</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Revenue diversification</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#38bdf8' }]}>No customer &gt; 30%</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Reduce concentration risk</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Regular reviews</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#38bdf8' }]}>Monthly, not annual</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Catch problems early</Text>
                                                    </View>
                                                    <View style={styles.tableRow}>
                                                        <Text style={[styles.tdCell, { flex: 1.2, fontWeight: '600', color: '#f8fafc' }]}>Expert advice</Text>
                                                        <Text style={[styles.tdCell, { flex: 1, color: '#38bdf8' }]}>At first sign of trouble</Text>
                                                        <Text style={[styles.tdCell, { flex: 1.2 }]}>Professional guidance</Text>
                                                    </View>
                                                </View>

                                                <View style={{ backgroundColor: '#7f1d1d20', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#ef4444' }}>
                                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#fca5a5', marginBottom: 4 }}>⚠️ Remember</Text>
                                                    <Text style={{ fontSize: 9, color: '#fca5a5', lineHeight: 14 }}>
                                                        Financial red flags are early warnings — don't ignore them. Monitor your finances closely and act quickly when you spot issues.
                                                    </Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        )}

                        {/* TAB 6: FINANCIAL PLANNING & ANALYSIS (FP&A) */}"""

if old_closing in content:
    content = content.replace(old_closing, new_steps)
    print("Steps 3-6 added successfully!")
else:
    print("ERROR: Could not find closing section!")
    # Try to find it
    idx = content.find("TAB 6: FINANCIAL PLANNING")
    if idx >= 0:
        print(f"Found at position {idx}")
        print(content[idx-50:idx+50])
    else:
        print("TAB 6 marker not found at all")

with open(filepath, 'w') as f:
    f.write(content)

print("File updated successfully!")