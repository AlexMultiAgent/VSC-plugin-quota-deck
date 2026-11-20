import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, SecretStorage, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { SecretStore } from '../core/secrets';
import {
  clearCredential,
  configureDeepSeek,
  configureMiniMax,
  pickStoredCredential,
} from './credentials';

const t = translatorFor('en-US');

describe('configureMiniMax', () => {
  beforeEach(() => __reset());

  it('asks only for the Token Plan key', async () => {
    state.inputBoxResults = ['token-key'];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(await store.read('minimax-cn', 'token-plan-key')).toBe('token-key');
    expect(state.inputBoxOptions).toHaveLength(1);
  });

  it('keeps domestic and global instances apart', async () => {
    state.inputBoxResults = ['cn-key', 'global-key'];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    await configureMiniMax(store, 'minimax-global', t);
    expect(await store.read('minimax-cn', 'token-plan-key')).toBe('cn-key');
    expect(await store.read('minimax-global', 'token-plan-key')).toBe('global-key');
    expect(state.inputBoxOptions).toHaveLength(2);
  });

  it('never echoes the entered value', async () => {
    state.inputBoxResults = ['token-key'];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(state.output.join('\n')).not.toContain('token-key');
  });

  it('clears the retired MiniMax web cookie without asking for it', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('minimax-cn', 'web-cookie', 'session=legacy');
    state.inputBoxResults = ['token-key'];

    await configureMiniMax(store, 'minimax-cn', t);

    expect(await store.read('minimax-cn', 'web-cookie')).toBeUndefined();
    expect(state.inputBoxOptions).toHaveLength(1);
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

describe('pickStoredCredential', () => {
  beforeEach(() => __reset());

  it('offers only the credentials that are actually stored', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-test');
    state.quickPickResults = ['DeepSeek — API Key'];

    const picked = await pickStoredCredential(store, t);

    const offered = state.quickPickOffered[0] as Array<{ label: string }>;
    expect(offered.map((item) => item.label)).toEqual(['DeepSeek — API Key']);
    expect(picked).toEqual({ providerId: 'deepseek', credential: 'api-key' });
  });

  it('reports when no credential is stored', async () => {
    const store = new SecretStore(SecretStorage);

    expect(await pickStoredCredential(store, t)).toBeUndefined();
    expect(state.output.join('\n')).toContain('No credential is currently stored.');
  });

  it('returns nothing when the picker is dismissed', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('minimax-cn', 'token-plan-key', 'token-key');
    state.quickPickResults = [undefined];

    expect(await pickStoredCredential(store, t)).toBeUndefined();
  });
});
