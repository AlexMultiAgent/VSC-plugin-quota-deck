import type { MiniMaxModel, MiniMaxWindow } from './shape';

export type ModelCategory =
  | 'text'
  | 'video'
  | 'image'
  | 'hailuo'
  | 'music'
  | 'speech'
  | 'other';

const CATEGORY_RULES: ReadonlyArray<{ category: ModelCategory; test: RegExp }> = [
  { category: 'hailuo', test: /hailuo/i },
  { category: 'video', test: /video/i },
  { category: 'image', test: /image|t2i|draw|paint/i },
  { category: 'music', test: /music|lyric|song/i },
  { category: 'speech', test: /speech|tts|audio|voice/i },
  { category: 'text', test: /general|text|chat|llm|model|abab|m2/i },
];

export function categorizeModel(model: string): ModelCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(model)) return rule.category;
  }
  return 'other';
}

export interface CategorizedModel extends MiniMaxModel {
  readonly category: ModelCategory;
}

export function categorizeModels(models: readonly MiniMaxModel[]): CategorizedModel[] {
  return models.map((model) => ({ ...model, category: categorizeModel(model.model) }));
}

const FILLED = '█';
const EMPTY = '░';
const CELLS = 10;

export function pickTightestRemaining(windows: readonly MiniMaxWindow[]): MiniMaxWindow | undefined {
  const candidates = windows.filter(
    (window) => !window.unlimited && window.remainingPercent !== null,
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((tightest, window) =>
    (window.remainingPercent ?? 0) < (tightest.remainingPercent ?? 0) ? window : tightest,
  );
}

export function remainingBar(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * CELLS));
  return FILLED.repeat(filled) + EMPTY.repeat(CELLS - filled);
}
