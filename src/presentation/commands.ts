import * as vscode from 'vscode';

export interface CommandHandlers {
  refresh(): Promise<void>;
  openDashboard(): Promise<void>;
  switchProvider(): Promise<void>;
  configureMiniMax(): Promise<void>;
  configureDeepSeek(): Promise<void>;
  configureProviders(): Promise<void>;
  showHelp(): Promise<void>;
}

export function registerCommands(handlers: CommandHandlers): vscode.Disposable[] {
  const refresh = vscode.commands.registerCommand('quotaDeck.refresh', () => handlers.refresh());
  const openDashboard = vscode.commands.registerCommand('quotaDeck.openDashboard', () =>
    handlers.openDashboard(),
  );
  const switchProvider = vscode.commands.registerCommand('quotaDeck.switchProvider', () =>
    handlers.switchProvider(),
  );
  const configureMiniMax = vscode.commands.registerCommand('quotaDeck.configureMiniMax', () =>
    handlers.configureMiniMax(),
  );
  const configureDeepSeek = vscode.commands.registerCommand('quotaDeck.configureDeepSeek', () =>
    handlers.configureDeepSeek(),
  );
  const configureProviders = vscode.commands.registerCommand('quotaDeck.configureProviders', () =>
    handlers.configureProviders(),
  );
  const showHelp = vscode.commands.registerCommand('quotaDeck.showHelp', () => handlers.showHelp());

  return [
    refresh,
    openDashboard,
    switchProvider,
    configureMiniMax,
    configureDeepSeek,
    configureProviders,
    showHelp,
  ];
}
