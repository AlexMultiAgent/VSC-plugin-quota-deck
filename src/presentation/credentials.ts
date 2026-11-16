import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { SecretStore } from '../core/secrets';
import type { CredentialKind, ProviderId } from '../core/types';

async function askSecret(label: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: label,
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'Leave empty to skip',
  });
}

export async function configureMiniMax(
  store: SecretStore,
  providerId: Extract<ProviderId, 'minimax-cn' | 'minimax-global'>,
  t: Translator,
): Promise<void> {
  const region = providerId === 'minimax-cn' ? 'cn' : 'global';
  const tokenPlan = await askSecret(
    region === 'cn'
      ? t('credentials.minimax.cn.tokenPlan')
      : t('credentials.minimax.global.tokenPlan'),
  );
  if (tokenPlan !== undefined && tokenPlan.length > 0) {
    await store.write(providerId, 'token-plan-key', tokenPlan);
  }
  const cookie = await askSecret(
    region === 'cn'
      ? t('credentials.minimax.cn.cookie')
      : t('credentials.minimax.global.cookie'),
  );
  if (cookie !== undefined && cookie.length > 0) {
    await store.write(providerId, 'web-cookie', cookie);
  }
}

export async function configureDeepSeek(store: SecretStore, t: Translator): Promise<void> {
  const apiKey = await askSecret(t('credentials.deepseek.apiKey'));
  if (apiKey !== undefined && apiKey.length > 0) {
    await store.write('deepseek', 'api-key', apiKey);
  }
  const sessionToken = await askSecret(t('credentials.deepseek.sessionToken'));
  if (sessionToken !== undefined && sessionToken.length > 0) {
    await store.write('deepseek', 'session-token', sessionToken);
  }
  const cookie = await askSecret(t('credentials.deepseek.cookie'));
  if (cookie !== undefined && cookie.length > 0) {
    await store.write('deepseek', 'web-cookie', cookie);
  }
}

export async function clearCredential(
  store: SecretStore,
  providerId: ProviderId,
  credential: CredentialKind,
  t: Translator,
): Promise<boolean> {
  const confirmation = await vscode.window.showQuickPick(
    [t('credentials.clear.confirm'), t('credentials.clear.cancel')],
    { title: t('credentials.clear.title') },
  );
  if (confirmation !== t('credentials.clear.confirm')) return false;
  await store.delete(providerId, credential);
  return true;
}
