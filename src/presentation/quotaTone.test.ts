import { describe, expect, it } from 'vitest';
import { quotaTone } from './quotaTone';

describe('quotaTone', () => {
  it('uses four remaining-quota stages with actionable early warnings', () => {
    expect(quotaTone(100, 20)).toBe('positive');
    expect(quotaTone(50, 20)).toBe('positive');
    expect(quotaTone(49, 20)).toBe('caution');
    expect(quotaTone(20, 20)).toBe('caution');
    expect(quotaTone(19, 20)).toBe('warning');
    expect(quotaTone(6, 20)).toBe('warning');
    expect(quotaTone(5, 20)).toBe('critical');
    expect(quotaTone(0, 20)).toBe('critical');
  });
});
