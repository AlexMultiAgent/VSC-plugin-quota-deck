import { describe, expect, it } from 'vitest';
import { translatorFor } from '../localization';
import { buildSwitcherItems } from './switcher';

const t = translatorFor('en-US');

describe('buildSwitcherItems', () => {
  it('lists every provider id', () => {
    expect(buildSwitcherItems({}, t).map((item) => item.id)).toEqual([
      'minimax-cn',
      'minimax-global',
      'deepseek',
      'qwen',
    ]);
  });

  it('marks the current primary provider', () => {
    const items = buildSwitcherItems({}, t, 'deepseek');
    expect(items.find((item) => item.id === 'deepseek')?.picked).toBe(true);
    expect(items.find((item) => item.id === 'qwen')?.picked).toBe(false);
  });

  it('shows configured state', () => {
    const items = buildSwitcherItems({ 'minimax-cn': true, deepseek: false }, t);
    expect(items.find((item) => item.id === 'minimax-cn')?.configured).toBe(true);
    expect(items.find((item) => item.id === 'deepseek')?.configured).toBe(false);
  });

  it('treats absent entries as not configured', () => {
    expect(buildSwitcherItems({}, t).every((item) => item.configured === false)).toBe(true);
  });

  it('limits choices to the visible provider order', () => {
    expect(
      buildSwitcherItems({}, t, 'deepseek', ['minimax-cn', 'deepseek']).map((item) => item.id),
    ).toEqual(['minimax-cn', 'deepseek']);
  });
});
