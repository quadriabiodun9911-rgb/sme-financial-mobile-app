import { generateId } from '../src/utils/uuid';

describe('generateId', () => {
    it('returns a non-empty string', () => {
        expect(typeof generateId()).toBe('string');
        expect(generateId().length).toBeGreaterThan(0);
    });

    it('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
        expect(ids.size).toBe(1000);
    });
});
