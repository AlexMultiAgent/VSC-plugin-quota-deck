import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { ProviderId } from '../core/types';

export interface CredentialWriter {
  configureMiniMax(providerId: 'minimax-cn' | 'minimax-global'): Promise<void>;
  configureDeepSeek(): Promise<void>;
}

interface ProviderChoice {
  readonly id: 'minimax-cn' | 'minimax-global' | 'deepseek';
  readonly label: string;
}

const CHOICES: ProviderChoice[] = [
  { id: 'minimax-cn', label: 'MiniMax CN' },
  { id: 'minimax-global', label: 'MiniMax Global' },
  { id: 'deepseek', label: 'DeepSeek' },
];

const PROVIDER_LABEL: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

async function run(command: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(command);
  } catch {
    // A fresh profile may not have registered the target command yet.
  }
}

function summaryItems(
  configured: Partial<Record<ProviderId, boolean>>,
  t: Translator,
): string[] {
  const pending = (Object.keys(PROVIDER_LABEL) as ProviderId[])
    .filter((id) => id !== 'qwen')
    .filter((id) => configured[id] !== true)
    .map((id) => `${PROVIDER_LABEL[id]} — ${t('switcher.notConfigured')}`);
  return [
    t('onboarding.configureAnother'),
    t('onboarding.refreshNow'),
    t('onboarding.openDashboard'),
    t('onboarding.finish'),
    ...pending,
  ];
}

export async function runOnboarding(
  writer: CredentialWriter,
  t: Translator,
  configured: Partial<Record<ProviderId, boolean>> = {},
): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    CHOICES.map((choice) => ({ label: choice.label, id: choice.id })),
    { title: t('onboarding.chooseProvider') },
  );
  if (picked === undefined) return;

  if (picked.id === 'deepseek') {
    await writer.configureDeepSeek();
  } else {
    await writer.configureMiniMax(picked.id);
  }

  const summary = await vscode.window.showQuickPick(summaryItems(configured, t), {
    title: t('onboarding.nextStep'),
  });
  if (summary === t('onboarding.refreshNow')) {
    await run('quotaDeck.refresh');
  } else if (summary === t('onboarding.openDashboard')) {
    await run('quotaDeck.openDashboard');
  } else if (summary === t('onboarding.configureAnother')) {
    await runOnboarding(writer, t, configured);
  }
}
