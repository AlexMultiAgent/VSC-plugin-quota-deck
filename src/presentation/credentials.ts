import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { SecretStore } from '../core/secrets';
import type { CredentialKind, ProviderId } from '../core/types';

interface SecretInput {
  readonly title: string;
  readonly placeHolder: string;
  readonly prompt: string;
  readonly existing?: string;
  readonly validateInput?: (value: string) => string | undefined;
}

function isCompleteCookieHeader(value: string): boolean {
  return value.split(';').some((part) => {
    const entry = part.trim();
    const separator = entry.indexOf('=');
    return separator > 0 && separator < entry.length - 1;
  });
}

async function askSecret(input: SecretInput): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: input.title,
    password: true,
    ignoreFocusOut: true,
    placeHolder: input.placeHolder,
    prompt: input.prompt,
    ...(input.existing !== undefined ? { value: input.existing } : {}),
    ...(input.validateInput !== undefined ? { validateInput: input.validateInput } : {}),
  });
}

export async function configureMiniMax(
  store: SecretStore,
  providerId: Extract<ProviderId, 'minimax-cn' | 'minimax-global'>,
  t: Translator,
): Promise<void> {
  const region = providerId === 'minimax-cn' ? 'cn' : 'global';
  const existingTokenPlan = await store.read(providerId, 'token-plan-key');
  const existingCookie = await store.read(providerId, 'web-cookie');
  const tokenPlan = await askSecret({
    title: region === 'cn'
      ? t('credentials.minimax.cn.tokenPlan')
      : t('credentials.minimax.global.tokenPlan'),
    placeHolder: t('credentials.minimax.optionalPlaceholder'),
    prompt: t('credentials.minimax.optionalPlaceholder'),
    ...(existingTokenPlan !== undefined ? { existing: existingTokenPlan } : {}),
  });
  if (tokenPlan !== undefined && tokenPlan.length > 0) {
    await store.write(providerId, 'token-plan-key', tokenPlan);
  }
  const cookie = await askSecret({
    title: region === 'cn'
      ? t('credentials.minimax.cn.cookie')
      : t('credentials.minimax.global.cookie'),
    placeHolder: t('credentials.minimax.optionalPlaceholder'),
    prompt: t('credentials.minimax.optionalPlaceholder'),
    ...(existingCookie !== undefined ? { existing: existingCookie } : {}),
  });
  if (cookie !== undefined && cookie.length > 0) {
    await store.write(providerId, 'web-cookie', cookie);
  }
}

export async function configureDeepSeek(store: SecretStore, t: Translator): Promise<void> {
  const existingApiKey = await store.read('deepseek', 'api-key');
  const existingSessionToken = await store.read('deepseek', 'session-token');
  const existingCookie = await store.read('deepseek', 'web-cookie');
  const apiKey = await askSecret({
    title: t('credentials.deepseek.apiKey'),
    placeHolder: t('credentials.deepseek.apiKeyPlaceholder'),
    prompt: t('credentials.deepseek.apiKeyPrompt'),
    ...(existingApiKey !== undefined ? { existing: existingApiKey } : {}),
    validateInput: (value) =>
      value.trim().length === 0 ? t('credentials.deepseek.apiKeyRequired') : undefined,
  });
  if (apiKey !== undefined && apiKey.length > 0) {
    await store.write('deepseek', 'api-key', apiKey);
  }
  const sessionToken = await askSecret({
    title: t('credentials.deepseek.sessionToken'),
    placeHolder: t('credentials.deepseek.sessionTokenPlaceholder'),
    prompt: t('credentials.deepseek.sessionTokenPrompt'),
    ...(existingSessionToken !== undefined ? { existing: existingSessionToken } : {}),
  });
  if (sessionToken !== undefined && sessionToken.length > 0) {
    await store.write('deepseek', 'session-token', sessionToken);
  }
  const cookie = await askSecret({
    title: t('credentials.deepseek.cookie'),
    placeHolder: t('credentials.deepseek.cookiePlaceholder'),
    prompt: t('credentials.deepseek.cookiePrompt'),
    ...(existingCookie !== undefined ? { existing: existingCookie } : {}),
    validateInput: (value) =>
      isCompleteCookieHeader(value) ? undefined : t('credentials.deepseek.cookieRequiredFormat'),
  });
  if (cookie !== undefined && cookie.length > 0) {
    await store.write('deepseek', 'web-cookie', cookie);
  }
}

export async function configureQwen(store: SecretStore, t: Translator): Promise<void> {
  const existingAccessKeyId = await store.read('qwen', 'access-key-id');
  const existingAccessKeySecret = await store.read('qwen', 'access-key-secret');
  const accessKeyId = await askSecret({
    title: t('credentials.qwen.accessKeyId'),
    placeHolder: t('credentials.qwen.accessKeyIdPlaceholder'),
    prompt: t('credentials.qwen.accessKeyIdPrompt'),
    ...(existingAccessKeyId !== undefined ? { existing: existingAccessKeyId } : {}),
    validateInput: (value) =>
      value.trim().length === 0 ? t('credentials.qwen.required') : undefined,
  });
  if (accessKeyId === undefined) return;
  const accessKeySecret = await askSecret({
    title: t('credentials.qwen.accessKeySecret'),
    placeHolder: t('credentials.qwen.accessKeySecretPlaceholder'),
    prompt: t('credentials.qwen.accessKeySecretPrompt'),
    ...(existingAccessKeySecret !== undefined ? { existing: existingAccessKeySecret } : {}),
    validateInput: (value) =>
      value.trim().length === 0 ? t('credentials.qwen.required') : undefined,
  });
  if (accessKeySecret === undefined) return;

  await store.write('qwen', 'access-key-id', accessKeyId.trim());
  await store.write('qwen', 'access-key-secret', accessKeySecret.trim());
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
