// Security: Input validation for financial data

const MAX_AMOUNT = 999999999;
const MIN_AMOUNT = 0.01;

export interface ValidationError {
    field: string;
    message: string;
}

export function validateAmount(amount: number, fieldName: string = 'Amount'): ValidationError | null {
    if (isNaN(amount)) {
        return { field: 'amount', message: `${fieldName} must be a number` };
    }
    if (amount < MIN_AMOUNT) {
        return { field: 'amount', message: `${fieldName} must be at least ${MIN_AMOUNT}` };
    }
    if (amount > MAX_AMOUNT) {
        return { field: 'amount', message: `${fieldName} cannot exceed ${MAX_AMOUNT.toLocaleString()}` };
    }
    return null;
}

export function validateDescription(desc: string, maxLength: number = 200): ValidationError | null {
    if (!desc || desc.trim().length === 0) {
        return { field: 'description', message: 'Description is required' };
    }
    if (desc.length > maxLength) {
        return { field: 'description', message: `Description cannot exceed ${maxLength} characters` };
    }
    return null;
}

