import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, SecretStorage, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { SecretStore } from '../core/secrets';
import {
  clearCredential,
  configureDeepSeek,
  configureMiniMax,
  configureQwen,
} from './credentials';

const t = translatorFor('en-US');

describe('configureMiniMax', () => {
  beforeEach(() => __reset());

  it('writes the token plan key to the secret store', async () => {
    state.inputBoxResults = ['token-key', undefined];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(await store.read('minimax-cn', 'token-plan-key')).toBe('token-key');
  });

  it('does not write a web cookie when the step is skipped', async () => {
    state.inputBoxResults = ['token-key', undefined];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(await store.read('minimax-cn', 'web-cookie')).toBeUndefined();
  });

  it('writes a web cookie when one is entered', async () => {
    state.inputBoxResults = ['token-key', 'session=abc'];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(await store.read('minimax-cn', 'web-cookie')).toBe('session=abc');
  });

  it('keeps domestic and global instances apart', async () => {
    state.inputBoxResults = ['cn-key', undefined, 'global-key', undefined];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    await configureMiniMax(store, 'minimax-global', t);
    expect(await store.read('minimax-cn', 'token-plan-key')).toBe('cn-key');
    expect(await store.read('minimax-global', 'token-plan-key')).toBe('global-key');
  });

  it('never echoes the entered value', async () => {
    state.inputBoxResults = ['token-key', undefined];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(state.output.join('\n')).not.toContain('token-key');
  });
});

describe('configureDeepSeek', () => {
  beforeEach(() => __reset());

  it('asks only for the api key', async () => {
    state.inputBoxResults = ['sk-test'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await store.read('deepseek', 'api-key')).toBe('sk-test');
    expect(state.inputBoxOptions).toHaveLength(1);
  });

  it('clears legacy session credentials instead of reading or writing them', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'session-token', 'legacy-token');
    await store.write('deepseek', 'web-cookie', 'session=legacy');
    state.inputBoxResults = ['sk-test'];

    await configureDeepSeek(store, t);

    expect(await store.read('deepseek', 'session-token')).toBeUndefined();
    expect(await store.read('deepseek', 'web-cookie')).toBeUndefined();
    expect(state.inputBoxOptions).toHaveLength(1);
  });

  it('prefills the saved api key as a masked input default', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-existing');
    state.inputBoxResults = ['sk-existing'];

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions.map((options) => options.value)).toEqual(['sk-existing']);
    expect(state.inputBoxOptions.every((options) => options.password === true)).toBe(true);
  });

  it('accepts a replacement api key while showing the saved default', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-existing');
    state.inputBoxResults = ['sk-new'];

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions.map((options) => options.value)).toEqual(['sk-existing']);
    expect(await store.read('deepseek', 'api-key')).toBe('sk-new');
  });

  it('explains where to find the DeepSeek api key', async () => {
    state.inputBoxResults = ['sk-test'];
    const store = new SecretStore(SecretStorage);

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions[0]!.prompt).toContain('platform.deepseek.com');
    expect(state.inputBoxOptions[0]!.prompt).toContain('API Keys');
  });

  it('rejects an empty required API key', async () => {
    state.inputBoxResults = [undefined];
    const store = new SecretStore(SecretStorage);

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions[0]!.validateInput?.('')).toBeDefined();
    expect(state.inputBoxOptions[0]!.validateInput?.('sk-valid')).toBeUndefined();
  });
});

describe('configureQwen', () => {
  beforeEach(() => __reset());

  it('stores the AccessKey ID and secret only in SecretStorage', async () => {
    state.quickPickResults = ['Continue with AccessKey'];
    state.inputBoxResults = ['LTAI-test-id', 'access-secret'];
    const store = new SecretStore(SecretStorage);

    await configureQwen(store, t);

    expect(await store.read('qwen', 'access-key-id')).toBe('LTAI-test-id');
    expect(await store.read('qwen', 'access-key-secret')).toBe('access-secret');
    expect(state.output.join('\n')).not.toContain('LTAI-test-id');
    expect(state.output.join('\n')).not.toContain('access-secret');
  });

  it('explains that both fields are required and names the balance RAM permission', async () => {
    state.quickPickResults = ['Continue with AccessKey'];
    state.inputBoxResults = ['LTAI-test-id', undefined];
    const store = new SecretStore(SecretStorage);

    await configureQwen(store, t);

    expect(state.inputBoxOptions[0]!.validateInput?.('')).toBeDefined();
    expect(state.inputBoxOptions[1]!.validateInput?.('')).toBeDefined();
    expect(state.inputBoxOptions[0]!.prompt).toContain('AccessKey');
    expect(state.inputBoxOptions[0]!.prompt).toContain('bss:QueryAccountBalance');
    expect(state.inputBoxOptions[0]!.prompt).toContain('SecretStorage');
  });

  it('shows setup guidance before asking for a credential', async () => {
    state.quickPickResults = ['Continue with AccessKey'];
    state.inputBoxResults = ['LTAI-test-id', 'access-secret'];
    const store = new SecretStore(SecretStorage);

    await configureQwen(store, t);

    const choices = state.quickPickOffered[0] as Array<{ label: string; detail?: string }>;
    expect(choices.map((choice) => choice.label)).toEqual([
      'Continue with AccessKey',
      'Open RAM console',
    ]);
    expect(choices[0]!.detail).toContain('bss:QueryAccountBalance');
    expect(choices[0]!.detail).toContain('local development environment');
    expect(choices[0]!.detail).toContain('not a Model Studio API Key');
  });

  it('opens the RAM console from the setup guidance', async () => {
    state.quickPickResults = ['Open RAM console', 'Continue with AccessKey'];
    state.inputBoxResults = ['LTAI-test-id', 'access-secret'];
    const store = new SecretStore(SecretStorage);

    await configureQwen(store, t);

    expect(state.openedExternal).toEqual(['https://ram.console.aliyun.com/manage/ak']);
  });
});

describe('clearCredential', () => {
  beforeEach(() => __reset());

  it('clears a credential after confirmation', async () => {
    state.inputBoxResults = ['sk-test'];
    state.quickPickResults = ['Clear'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await clearCredential(store, 'deepseek', 'api-key', t)).toBe(true);
    expect(await store.read('deepseek', 'api-key')).toBeUndefined();
  });

  it('keeps a credential when cancelled', async () => {
    state.inputBoxResults = ['sk-test'];
    state.quickPickResults = ['Cancel'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await clearCredential(store, 'deepseek', 'api-key', t)).toBe(false);
    expect(await store.read('deepseek', 'api-key')).toBe('sk-test');
  });
});
