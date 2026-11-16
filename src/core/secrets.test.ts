import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, SecretStorage, state } from '../test/__mocks__/vscode';
import { SecretStore } from './secrets';

describe('SecretStore', () => {
  beforeEach(() => __reset());

  it('stores and reads a credential by provider and kind', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-test');
    expect(await store.read('deepseek', 'api-key')).toBe('sk-test');
  });

  it('returns undefined for a credential that was never written', async () => {
    const store = new SecretStore(SecretStorage);
    expect(await store.read('deepseek', 'api-key')).toBeUndefined();
  });

  it('keeps provider instances isolated', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('minimax-cn', 'token-plan-key', 'cn-key');
    await store.write('minimax-global', 'token-plan-key', 'global-key');
    expect(await store.read('minimax-cn', 'token-plan-key')).toBe('cn-key');
    expect(await store.read('minimax-global', 'token-plan-key')).toBe('global-key');
  });

  it('deletes a credential', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-test');
    await store.delete('deepseek', 'api-key');
    expect(await store.read('deepseek', 'api-key')).toBeUndefined();
  });

  it('uses the documented secret key names', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('minimax-cn', 'web-cookie', 'c=1');
    await store.write('minimax-global', 'web-cookie', 'c=2');
    expect([...state.secrets.keys()]).toEqual([
      'quotaDeck.minimax.cn.webCookie',
      'quotaDeck.minimax.global.webCookie',
    ]);
  });
});
