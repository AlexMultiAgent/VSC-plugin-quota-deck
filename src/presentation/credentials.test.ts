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

  it('prefills saved credentials as masked input defaults', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-existing');
    await store.write('deepseek', 'session-token', 'existing-token');
    await store.write('deepseek', 'web-cookie', 'session=existing');
    state.inputBoxResults = ['sk-existing', 'existing-token', 'session=existing'];

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions.map((options) => options.value)).toEqual([
      'sk-existing',
      'existing-token',
      'session=existing',
    ]);
    expect(state.inputBoxOptions.every((options) => options.password === true)).toBe(true);
  });

  it('accepts replacement values while showing the saved defaults', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-existing');
    await store.write('deepseek', 'session-token', 'existing-token');
    await store.write('deepseek', 'web-cookie', 'session=existing');
    state.inputBoxResults = ['sk-new', 'new-token', 'session=new'];

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions.map((options) => options.value)).toEqual([
      'sk-existing',
      'existing-token',
      'session=existing',
    ]);
    expect(await store.read('deepseek', 'api-key')).toBe('sk-new');
    expect(await store.read('deepseek', 'session-token')).toBe('new-token');
    expect(await store.read('deepseek', 'web-cookie')).toBe('session=new');
  });

  it('explains where to find each DeepSeek credential', async () => {
    state.inputBoxResults = ['sk-test', undefined, undefined];
    const store = new SecretStore(SecretStorage);

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions[0]!.prompt).toContain('platform.deepseek.com');
    expect(state.inputBoxOptions[0]!.prompt).toContain('API Keys');
    expect(state.inputBoxOptions[1]!.prompt).toContain('F12');
    expect(state.inputBoxOptions[1]!.prompt).toContain('Authorization: Bearer');
    expect(state.inputBoxOptions[2]!.prompt).toContain('Cookie');
  });

  it('rejects an empty required API key', async () => {
    state.inputBoxResults = [undefined, undefined, undefined];
    const store = new SecretStore(SecretStorage);

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions[0]!.validateInput?.('')).toBeDefined();
    expect(state.inputBoxOptions[0]!.validateInput?.('sk-valid')).toBeUndefined();
  });

  it('requires a complete cookie header instead of a bare cookie value', async () => {
    state.inputBoxResults = ['sk-test', 'session-token', 'complete-header'];
    const store = new SecretStore(SecretStorage);

    await configureDeepSeek(store, t);

    expect(state.inputBoxOptions[2]!.validateInput?.('bare-cookie-value')).toBeDefined();
    expect(state.inputBoxOptions[2]!.validateInput?.('sessionId=abc; acw_tc=def')).toBeUndefined();
  });
});

describe('configureQwen', () => {
  beforeEach(() => __reset());

  it('stores the AccessKey ID and secret only in SecretStorage', async () => {
    state.inputBoxResults = ['LTAI-test-id', 'access-secret'];
    const store = new SecretStore(SecretStorage);

    await configureQwen(store, t);

    expect(await store.read('qwen', 'access-key-id')).toBe('LTAI-test-id');
    expect(await store.read('qwen', 'access-key-secret')).toBe('access-secret');
    expect(state.output.join('\n')).not.toContain('LTAI-test-id');
    expect(state.output.join('\n')).not.toContain('access-secret');
  });

  it('explains that both fields are required and names the BSS RAM permission', async () => {
    state.inputBoxResults = ['LTAI-test-id', undefined];
    const store = new SecretStore(SecretStorage);

    await configureQwen(store, t);

    expect(state.inputBoxOptions[0]!.validateInput?.('')).toBeDefined();
    expect(state.inputBoxOptions[1]!.validateInput?.('')).toBeDefined();
    expect(state.inputBoxOptions[0]!.prompt).toContain('AccessKey');
    expect(state.inputBoxOptions[0]!.prompt).toContain('bss:DescribeAcccount');
    expect(state.inputBoxOptions[0]!.prompt).toContain('SecretStorage');
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
