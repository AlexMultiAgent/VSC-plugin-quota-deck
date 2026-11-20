import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { HttpClient } from '../core/http';
import type { SecretStore } from '../core/secrets';
import type { Translator } from '../localization';
import {
  QwenDeviceLoginError,
  runQwenDeviceLogin,
} from '../providers/qwen/login';
import { serializeQwenManagementToken } from '../providers/qwen/auth';

const CLIENT_ID_KEY = 'quotaDeck.qwen.clientId';

export interface QwenAuthEndpoints {
  readonly origin: string;
  readonly codePath: string;
  readonly tokenPath: string;
}

/**
 * Walk the user through the official Qianwen device flow and store the
 * resulting management token in Secret Storage. The token never reaches the
 * webview, settings, output, or logs.
 */
export async function loginQwen(
  store: SecretStore,
  context: vscode.ExtensionContext,
  t: Translator,
  http: HttpClient,
  auth: QwenAuthEndpoints,
): Promise<boolean> {
  const stored = context.globalState.get<string>(CLIENT_ID_KEY);
  const clientId = typeof stored === 'string' && stored.length > 0 ? stored : randomUUID();
  if (clientId !== stored) await context.globalState.update(CLIENT_ID_KEY, clientId);

  const controller = new AbortController();
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('credentials.qwen.loginWaiting'),
        cancellable: true,
      },
      async (_progress, token) => {
        token.onCancellationRequested(() => controller.abort());
        const login = await runQwenDeviceLogin({
          http,
          authOrigin: auth.origin,
          codePath: auth.codePath,
          tokenPath: auth.tokenPath,
          clientId,
          signal: controller.signal,
          onVerificationUrl: (url) => {
            void vscode.env.openExternal(vscode.Uri.parse(url));
          },
        });
        await store.write('qwen', 'management-token', serializeQwenManagementToken(login));
        await store.delete('qwen', 'access-key-id');
        await store.delete('qwen', 'access-key-secret');
      },
    );
    await vscode.window.showInformationMessage(t('credentials.qwen.loginSuccess'));
    return true;
  } catch (error) {
    const message =
      error instanceof QwenDeviceLoginError &&
      (error.code === 'expired_token' || error.code === 'access_denied')
        ? t('credentials.qwen.loginExpired')
        : t('credentials.qwen.loginFailed');
    await vscode.window.showErrorMessage(message);
    return false;
  }
}
