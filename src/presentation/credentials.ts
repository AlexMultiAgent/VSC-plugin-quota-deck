import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { MessageKey } from '../localization/messages';
import type { SecretStore } from '../core/secrets';
import type { CredentialKind, ProviderId } from '../core/types';

interface SecretInput {
  readonly title: string;
  readonly placeHolder: string;
  readonly prompt: string;
  readonly existing?: string;
  readonly validateInput?: (value: string) => string | undefined;
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
  await store.delete(providerId, 'web-cookie');
}

export async function configureDeepSeek(store: SecretStore, t: Translator): Promise<void> {
  const existingApiKey = await store.read('deepseek', 'api-key');
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
  await store.delete('deepseek', 'session-token');
  await store.delete('deepseek', 'web-cookie');
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

export interface StoredCredential {
  readonly providerId: ProviderId;
  readonly credential: CredentialKind;
}

const CLEARABLE_CREDENTIALS: readonly (StoredCredential & { readonly labelKey: MessageKey })[] = [
  {
    providerId: 'minimax-cn',
    credential: 'token-plan-key',
    labelKey: 'credentials.minimax.cn.tokenPlan',
  },
  {
    providerId: 'minimax-global',
    credential: 'token-plan-key',
    labelKey: 'credentials.minimax.global.tokenPlan',
  },
  { providerId: 'deepseek', credential: 'api-key', labelKey: 'credentials.deepseek.apiKey' },
  { providerId: 'qwen', credential: 'access-key-id', labelKey: 'credentials.qwen.accessKeyId' },
  {
    providerId: 'qwen',
    credential: 'access-key-secret',
    labelKey: 'credentials.qwen.accessKeySecret',
  },
  {
    providerId: 'qwen',
    credential: 'management-token',
    labelKey: 'credentials.qwen.managementToken',
  },
];

export async function pickStoredCredential(
  store: SecretStore,
  t: Translator,
): Promise<StoredCredential | undefined> {
  const items: (StoredCredential & { readonly label: string })[] = [];
  for (const candidate of CLEARABLE_CREDENTIALS) {
    const stored = await store.read(candidate.providerId, candidate.credential);
    if (stored === undefined) continue;
    items.push({
      providerId: candidate.providerId,
      credential: candidate.credential,
      label: t(candidate.labelKey),
    });
  }
  if (items.length === 0) {
    void vscode.window.showInformationMessage(t('credentials.clear.noneStored'));
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(items, {
    title: t('credentials.clear.pickTitle'),
  });
  if (picked === undefined) return undefined;
  return { providerId: picked.providerId, credential: picked.credential };
}
