import { useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { computeFinance } from '../utils/finance';

export function useFinance() {
    const { transactions, settings } = useApp();
    return useMemo(
        () => computeFinance(transactions, settings),
        [transactions, settings]
    );
}
