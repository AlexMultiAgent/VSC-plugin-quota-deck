import { state } from '../__mocks__/vscode';

export function seedConfiguration(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    state.configuration.set(`quotaDeck.${key}`, value);
  }
}
