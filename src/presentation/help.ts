import * as vscode from 'vscode';
import type { Translator } from '../localization';

export const REPOSITORY_URL = 'https://github.com/AlexMultiAgent/VSC-plugin-quota-deck';

export async function showHelp(t: Translator): Promise<void> {
  const star = t('command.showHelp.star');
  const picked = await vscode.window.showInformationMessage(
    t('command.showHelp.message'),
    star,
  );
  if (picked === star) {
    await vscode.env.openExternal(vscode.Uri.parse(REPOSITORY_URL));
  }
}
