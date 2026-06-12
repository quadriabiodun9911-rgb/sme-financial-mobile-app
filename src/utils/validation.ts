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

export function validateEmail(email: string): ValidationError | null {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { field: 'email', message: 'Please enter a valid email address' };
    }
    return null;
}

export function validatePin(pin: string): ValidationError | null {
    if (!/^\d{4}$/.test(pin)) {
        return { field: 'pin', message: 'PIN must be exactly 4 digits' };
    }
    return null;
}

export function validateBusinessName(name: string): ValidationError | null {
    if (!name || name.trim().length === 0) {
        return { field: 'businessName', message: 'Business name is required' };
    }
    if (name.length > 100) {
        return { field: 'businessName', message: 'Business name cannot exceed 100 characters' };
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

export function validateInventoryItem(item: {
    name: string;
    quantity: number;
    costPrice: number;
    sellingPrice: number;
}): ValidationError | null {
    if (!item.name || item.name.trim().length === 0) {
        return { field: 'name', message: 'Item name is required' };
    }

    const qtyError = validateAmount(item.quantity, 'Quantity');
    if (qtyError) return qtyError;

    const costError = validateAmount(item.costPrice, 'Cost price');
    if (costError) return costError;

    const priceError = validateAmount(item.sellingPrice, 'Selling price');
    if (priceError) return priceError;

    if (item.sellingPrice < item.costPrice) {
        return { field: 'sellingPrice', message: 'Selling price must be greater than cost price' };
    }

    return null;
}

export function validateInvoice(invoice: {
    description: string;
    amount: number;
}): ValidationError | null {
    const descError = validateDescription(invoice.description);
    if (descError) return descError;

    const amountError = validateAmount(invoice.amount, 'Invoice amount');
    if (amountError) return amountError;

    return null;
}
