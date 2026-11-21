import { describe, expect, it } from 'vitest';
import { quotaTone } from './quotaTone';

describe('quotaTone', () => {
  it('uses three remaining-quota stages driven by the configured threshold', () => {
    expect(quotaTone(100, 20)).toBe('positive');
    expect(quotaTone(50, 20)).toBe('positive');
    expect(quotaTone(21, 20)).toBe('positive');
    expect(quotaTone(20, 20)).toBe('positive');
    expect(quotaTone(19, 20)).toBe('warning');
    expect(quotaTone(6, 20)).toBe('warning');
    expect(quotaTone(5, 20)).toBe('critical');
    expect(quotaTone(0, 20)).toBe('critical');
  });

  it('follows a raised threshold instead of a hard-coded 50% stage', () => {
    expect(quotaTone(60, 60)).toBe('positive');
    expect(quotaTone(55, 60)).toBe('warning');
    expect(quotaTone(49, 90)).toBe('warning');
  });

  it('keeps the critical stage below a low threshold', () => {
    expect(quotaTone(5, 11)).toBe('critical');
    expect(quotaTone(6, 11)).toBe('warning');
  });
});
