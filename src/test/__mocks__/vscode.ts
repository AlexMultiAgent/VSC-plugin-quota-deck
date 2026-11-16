export type Disposable = { dispose(): void };

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void): Disposable => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
  };
  fire(value: T): void { for (const l of [...this.listeners]) l(value); }
  dispose(): void { this.listeners = []; }
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const ViewColumn = { Active: -1, Beside: -2, One: 1 } as const;

export class MarkdownString {
  value: string;
  isTrusted = false;
  supportHtml = false;
  supportThemeIcons = false;
  constructor(value = '') { this.value = value; }
  appendMarkdown(value: string): MarkdownString { this.value += value; return this; }
  appendText(value: string): MarkdownString { this.value += value; return this; }
}

export interface StatusBarItem {
  text: string;
  tooltip: string | MarkdownString | { value: string };
  command: string | { command: string; title: string };
  backgroundColor: unknown;
  show(): void;
  hide(): void;
  dispose(): void;
  visible: boolean;
}

export interface Uri {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;
  readonly fsPath: string;
  with(change: { path?: string; query?: string; fragment?: string }): Uri;
  toString(skipEncoding?: boolean): string;
  toJSON(): unknown;
}

export const Uri = {
  file(path: string): Uri {
    return {
      scheme: 'file',
      authority: '',
      path,
      query: '',
      fragment: '',
      fsPath: path,
      with(change: { path?: string; query?: string; fragment?: string }): Uri {
        return Uri.file(change.path ?? path);
      },
      toString: () => `file://${path}`,
      toJSON: () => ({ scheme: 'file', path }),
    };
  },
  joinPath(base: Uri, ...segments: string[]): Uri {
    return Uri.file([base.path, ...segments].join('/'));
  },
};

export interface Webview {
  html: string;
  options: { enableScripts?: boolean; localResourceRoots?: unknown[] };
  onDidReceiveMessage: (listener: (message: unknown) => void) => Disposable;
  postMessage(message: unknown): Promise<boolean>;
  postedMessages: unknown[];
  receiveMessage(message: unknown): void;
}

export interface WebviewPanel {
  webview: Webview;
  title: string;
  visible: boolean;
  reveal(): void;
  dispose(): void;
}

export const state = {
  configuration: new Map<string, unknown>(),
  secrets: new Map<string, string>(),
  inputBoxResults: [] as Array<string | undefined>,
  quickPickResults: [] as unknown[],
  quickPickOffered: [] as unknown[][],
  registeredCommands: new Map<string, (...args: never[]) => unknown>(),
  statusBarItems: [] as StatusBarItem[],
  webviewPanels: [] as WebviewPanel[],
  hoverProviders: [] as Array<{ provideHover(): unknown }>,
  output: [] as string[],
};

export function __reset(): void {
  state.configuration.clear();
  state.secrets.clear();
  state.inputBoxResults = [];
  state.quickPickResults = [];
  state.quickPickOffered = [];
  state.registeredCommands.clear();
  state.statusBarItems = [];
  state.webviewPanels = [];
  state.hoverProviders = [];
  state.output = [];
}

function configKey(section: string, key: string): string {
  return `${section}.${key}`;
}

export const workspace = {
  getConfiguration(section: string) {
    return {
      get<T>(key: string, fallback: T): T {
        const found = state.configuration.get(configKey(section, key));
        return found === undefined ? fallback : (found as T);
      },
      update(key: string, value: unknown) {
        state.configuration.set(configKey(section, key), value);
        return Promise.resolve();
      },
    };
  },
  onDidChangeConfiguration: new EventEmitter<unknown>().event,
};

export const commands = {
  registerCommand(id: string, handler: (...args: never[]) => unknown): Disposable {
    state.registeredCommands.set(id, handler);
    return { dispose: () => { state.registeredCommands.delete(id); } };
  },
  executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
    const handler = state.registeredCommands.get(id);
    if (!handler) return Promise.reject(new Error(`command not found: ${id}`));
    return Promise.resolve(handler(...(args as never[])));
  },
};

export const window = {
  createStatusBarItem(_alignment: number, _priority?: number): StatusBarItem {
    const item: StatusBarItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      visible: false,
      show() { item.visible = true; },
      hide() { item.visible = false; },
      dispose() { item.visible = false; },
    };
    state.statusBarItems.push(item);
    return item;
  },
  showInputBox(options?: { password?: boolean; title?: string; placeHolder?: string }): Promise<string | undefined> {
    state.output.push(`input:${options?.title ?? ''}:${options?.placeHolder ?? ''}`);
    return Promise.resolve(state.inputBoxResults.shift());
  },
  showQuickPick(items: unknown): Promise<unknown> {
    state.quickPickOffered.push(items as unknown[]);
    const queued = state.quickPickResults.shift();
    if (typeof queued === 'string') {
      const match = (items as unknown[]).find((item) =>
        typeof item === 'string' ? item === queued : (item as { label?: string })?.label === queued,
      );
      return Promise.resolve(match ?? undefined);
    }
    return Promise.resolve(queued);
  },
  showInformationMessage(message: string): Promise<void> {
    state.output.push(`info:${message}`);
    return Promise.resolve();
  },
  showErrorMessage(message: string): Promise<void> {
    state.output.push(`error:${message}`);
    return Promise.resolve();
  },
  showWarningMessage(message: string): Promise<void> {
    state.output.push(`warn:${message}`);
    return Promise.resolve();
  },
  withProgress<T>(_options: unknown, task: (progress: unknown) => Promise<T>): Promise<T> {
    return task({ report: () => undefined });
  },
  createWebviewPanel(_viewType: string, _title: string, _column: number, _options: unknown): WebviewPanel {
    const listeners: Array<(message: unknown) => void> = [];
    const webview: Webview = {
      html: '',
      options: {},
      postedMessages: [],
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        listeners.push(listener);
        return {
          dispose: () => {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          },
        };
      },
      postMessage: async (message: unknown) => {
        webview.postedMessages.push(message);
        return true;
      },
      receiveMessage: (message: unknown) => {
        for (const listener of [...listeners]) listener(message);
      },
    };
    const panel: WebviewPanel = {
      webview,
      title: _title,
      visible: false,
      reveal() { panel.visible = true; },
      dispose() { panel.visible = false; },
    };
    state.webviewPanels.push(panel);
    return panel;
  },
  onDidChangeWindowState: new EventEmitter<{ focused: boolean }>().event,
};

export const languages = {
  registerHoverProvider(_selector: unknown, provider: { provideHover(): unknown }): Disposable {
    state.hoverProviders.push(provider);
    return { dispose: () => undefined };
  },
};

export const env = { language: 'zh-cn' };
export const extensions = { getExtension: () => undefined };

export const SecretStorage = {
  async get(key: string): Promise<string | undefined> { return state.secrets.get(key); },
  async store(key: string, value: string): Promise<void> { state.secrets.set(key, value); },
  async delete(key: string): Promise<void> { state.secrets.delete(key); },
};
