import { computeForecastRiskAlert } from '../src/utils/forecastRiskAlert';
import { ActionTactic } from '../src/utils/actionRecommendationEngine';
import { FinanceData } from '../src/types';

jest.mock('../src/utils/forecastSummary', () => ({
    computeForecastSummary: jest.fn(() => ({ __fake: 'forecast' })),
}));
jest.mock('../src/utils/forecastRiskRecommendations', () => ({
    generateForecastRiskActions: jest.fn(),
}));

const { computeForecastSummary } = require('../src/utils/forecastSummary');
const { generateForecastRiskActions } = require('../src/utils/forecastRiskRecommendations');

const finance: FinanceData = { cashBalance: 100000 } as FinanceData;

const makeAction = (overrides: Partial<ActionTactic> = {}): ActionTactic => ({
    id: 'forecast-cashflow-inventory-pressure',
    title: 'Review Inventory Purchasing Before October',
    description: 'Projected inventory purchases push cash low.',
    category: 'operations',
    priority: 8,
    timeframe: 'immediate',
    timelineWeeks: 2,
    expectedImpact: 150000,
    impactType: 'cash_improvement',
    difficulty: 'easy',
    successProbability: 0.7,
    rationale: 'Delaying a planned stock buy is the fastest lever available.',
    steps: ['Review the planned purchase', 'Split the order into batches'],
    metrics: ['Projected ending cash'],
    ...overrides,
});

describe('computeForecastRiskAlert', () => {
    afterEach(() => jest.clearAllMocks());

    it('returns null when the forecast has no risk actions', () => {
        (generateForecastRiskActions as jest.Mock).mockReturnValue([]);
        const result = computeForecastRiskAlert([], [], finance, [], [], [], [], [], '₦');
        expect(result).toBeNull();
    });

    it('maps the top action into a ForecastAlert', () => {
        (generateForecastRiskActions as jest.Mock).mockReturnValue([makeAction()]);
        const result = computeForecastRiskAlert([], [], finance, [], [], [], [], [], '₦');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('forecast-risk-forecast-cashflow-inventory-pressure');
        expect(result!.type).toBe('negative_forecast');
        expect(result!.priority).toBe('high');
        expect(result!.title).toBe('Review Inventory Purchasing Before October');
        expect(result!.amount).toBe(150000);
        expect(result!.recommendations).toEqual(['Review the planned purchase', 'Split the order into batches']);
    });

    it('buckets priority into medium and low', () => {
        (generateForecastRiskActions as jest.Mock).mockReturnValue([makeAction({ priority: 6 })]);
        expect(computeForecastRiskAlert([], [], finance, [], [], [], [], [], '₦')!.priority).toBe('medium');

        (generateForecastRiskActions as jest.Mock).mockReturnValue([makeAction({ priority: 3 })]);
        expect(computeForecastRiskAlert([], [], finance, [], [], [], [], [], '₦')!.priority).toBe('low');
    });

    it('omits amount when expectedImpact is not positive', () => {
        (generateForecastRiskActions as jest.Mock).mockReturnValue([makeAction({ expectedImpact: 0 })]);
        const result = computeForecastRiskAlert([], [], finance, [], [], [], [], [], '₦');
        expect(result!.amount).toBeUndefined();
    });

    it('returns null when the alert id is already dismissed', () => {
        (generateForecastRiskActions as jest.Mock).mockReturnValue([makeAction()]);
        const result = computeForecastRiskAlert([], [], finance, [], [], [], [], [], '₦', ['forecast-risk-forecast-cashflow-inventory-pressure']);
        expect(result).toBeNull();
    });

    it('passes finance, staff, macroAssumptions, inventory and futureEvents through to computeForecastSummary', () => {
        (generateForecastRiskActions as jest.Mock).mockReturnValue([]);
        const staff: any = [{ id: 's1' }];
        const macroAssumptions: any = [{ id: 'm1' }];
        const inventory: any = [{ id: 'i1' }];
        const futureEvents: any = [{ id: 'f1' }];
        computeForecastRiskAlert([], [], finance, staff, macroAssumptions, inventory, futureEvents, [], '₦');
        expect(computeForecastSummary).toHaveBeenCalledWith([], [], finance, '90d', staff, macroAssumptions, expect.anything(), inventory, futureEvents);
    });
});
