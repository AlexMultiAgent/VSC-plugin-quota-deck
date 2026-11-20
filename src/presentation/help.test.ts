import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { REPOSITORY_URL, showHelp } from './help';

const t = translatorFor('en-US');

describe('showHelp', () => {
  beforeEach(() => __reset());

  it('offers a GitHub star button', async () => {
    state.informationMessageResults = [undefined];
    await showHelp(t);
    expect(state.informationMessageOffered[0]).toEqual(['Star on GitHub']);
  });

  it('opens the repository when the star button is chosen', async () => {
    state.informationMessageResults = ['Star on GitHub'];
    await showHelp(t);
    expect(state.openedExternal).toEqual([REPOSITORY_URL]);
  });

  it('does nothing when the notification is dismissed', async () => {
    state.informationMessageResults = [undefined];
    await showHelp(t);
    expect(state.openedExternal).toEqual([]);
  });
});
