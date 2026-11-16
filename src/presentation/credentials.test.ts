import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, SecretStorage, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { SecretStore } from '../core/secrets';
import { clearCredential, configureDeepSeek, configureMiniMax } from './credentials';

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

  it('writes the api key', async () => {
    state.inputBoxResults = ['sk-test', undefined, undefined];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await store.read('deepseek', 'api-key')).toBe('sk-test');
  });

  it('writes optional session credentials', async () => {
    state.inputBoxResults = ['sk-test', 'session-token', 'session=abc'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await store.read('deepseek', 'session-token')).toBe('session-token');
    expect(await store.read('deepseek', 'web-cookie')).toBe('session=abc');
  });
});

describe('clearCredential', () => {
  beforeEach(() => __reset());

  it('clears a credential after confirmation', async () => {
    state.inputBoxResults = ['sk-test', undefined, undefined];
    state.quickPickResults = ['Clear'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await clearCredential(store, 'deepseek', 'api-key', t)).toBe(true);
    expect(await store.read('deepseek', 'api-key')).toBeUndefined();
  });

  it('keeps a credential when cancelled', async () => {
    state.inputBoxResults = ['sk-test', undefined, undefined];
    state.quickPickResults = ['Cancel'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await clearCredential(store, 'deepseek', 'api-key', t)).toBe(false);
    expect(await store.read('deepseek', 'api-key')).toBe('sk-test');
  });
});
