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
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
export const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 } as const;

export class MarkdownString {
  value: string;
  isTrusted = false;
  supportHtml = false;
  supportThemeIcons = false;
  constructor(value = '') { this.value = value; }
  appendMarkdown(value: string): MarkdownString { this.value += value; return this; }
  appendText(value: string): MarkdownString { this.value += value; return this; }
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class ThemeIcon {
  constructor(
    readonly id: string,
    readonly color?: ThemeColor,
  ) {}
}

export class TreeItem {
  id: string | undefined;
  description: string | MarkdownString | undefined;
  tooltip: string | MarkdownString | undefined;
  iconPath: ThemeIcon | undefined;
  command: { command: string; title: string } | undefined;
  contextValue: string | undefined;

  constructor(
    public label: string,
    public collapsibleState: number,
  ) {}
}

export interface TreeDataProvider<T> {
  onDidChangeTreeData(
    listener: (element?: T | null | undefined) => void,
  ): Disposable;
  getTreeItem(element: T): TreeItem;
  getChildren(element?: T): T[] | Promise<T[]>;
}

export interface TreeView<T> {
  readonly viewId: string;
  readonly treeDataProvider: TreeDataProvider<T>;
  readonly options: {
    readonly canSelectMany?: boolean | undefined;
    readonly showCollapseAll?: boolean | undefined;
  };
  dispose(): void;
}

export interface StatusBarItem {
  text: string;
  tooltip: string | MarkdownString | { value: string };
  command: string | { command: string; title: string };
  color: string | ThemeColor | undefined;
  backgroundColor: unknown;
  show(): void;
  hide(): void;
  dispose(): void;
  visible: boolean;
}

export interface OutputChannel {
  readonly name: string;
  append(value: string): void;
  appendLine(value: string): void;
  replace(value: string): void;
  clear(): void;
  show(preserveFocus?: boolean): void;
  hide(): void;
  dispose(): void;
  lines: string[];
  shown: boolean;
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
  parse(value: string): Uri {
    const parsed = new URL(value);
    return {
      scheme: parsed.protocol.replace(/:$/, ''),
      authority: parsed.host,
      path: parsed.pathname,
      query: parsed.search.replace(/^\?/, ''),
      fragment: parsed.hash.replace(/^#/, ''),
      fsPath: parsed.pathname,
      with(change: { path?: string; query?: string; fragment?: string }): Uri {
        return Uri.parse(value);
      },
      toString: () => value,
      toJSON: () => ({
        scheme: parsed.protocol.replace(/:$/, ''),
        authority: parsed.host,
        path: parsed.pathname,
      }),
    };
  },
};

export interface Webview {
  html: string;
  options: { enableScripts?: boolean; localResourceRoots?: unknown[] };
  asWebviewUri(localResource: Uri): Uri;
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
  onDidDispose(listener: () => void): Disposable;
}

export const state = {
  configuration: new Map<string, unknown>(),
  secrets: new Map<string, string>(),
  openedExternal: [] as string[],
  inputBoxResults: [] as Array<string | undefined>,
  inputBoxOptions: [] as Array<{
    password?: boolean;
    title?: string;
    placeHolder?: string;
    prompt?: string;
    value?: string;
    validateInput?: (value: string) => string | undefined;
  }>,
  quickPickResults: [] as unknown[],
  quickPickOffered: [] as unknown[][],
  informationMessageResults: [] as Array<string | undefined>,
  informationMessageOffered: [] as string[][],
  outputChannels: [] as OutputChannel[],
  registeredCommands: new Map<string, (...args: never[]) => unknown>(),
  statusBarItems: [] as StatusBarItem[],
  webviewPanels: [] as WebviewPanel[],
  hoverProviders: [] as Array<{ provideHover(): unknown }>,
  treeViews: [] as Array<TreeView<unknown> & {
    treeDataProvider: TreeDataProvider<unknown>;
  }>,
  output: [] as string[],
  configurationListeners: [] as Array<(event: { affectsConfiguration(section: string): boolean }) => void>,
};

export function __reset(): void {
  state.configuration.clear();
  state.secrets.clear();
  state.openedExternal = [];
  state.inputBoxResults = [];
  state.inputBoxOptions = [];
  state.quickPickResults = [];
  state.quickPickOffered = [];
  state.informationMessageResults = [];
  state.informationMessageOffered = [];
  state.outputChannels = [];
  state.registeredCommands.clear();
  state.statusBarItems = [];
  state.webviewPanels = [];
  state.hoverProviders = [];
  state.treeViews = [];
  state.output = [];
  state.configurationListeners = [];
}

export function fireConfigurationChange(section = 'quotaDeck'): void {
  for (const listener of [...state.configurationListeners]) {
    listener({ affectsConfiguration: (candidate: string) => candidate === section });
  }
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
  onDidChangeConfiguration(listener: (event: { affectsConfiguration(section: string): boolean }) => void) {
    state.configurationListeners.push(listener);
    return { dispose: () => { state.configurationListeners = state.configurationListeners.filter((l) => l !== listener); } };
  },
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
      color: undefined,
      backgroundColor: undefined,
      visible: false,
      show() { item.visible = true; },
      hide() { item.visible = false; },
      dispose() { item.visible = false; },
    };
    state.statusBarItems.push(item);
    return item;
  },
  createTreeView<T>(
    viewId: string,
    options: {
      treeDataProvider: TreeDataProvider<T>;
      canSelectMany?: boolean;
      showCollapseAll?: boolean;
    },
  ): TreeView<T> {
    const view: TreeView<T> = {
      viewId,
      treeDataProvider: options.treeDataProvider,
      options: {
        canSelectMany: options.canSelectMany,
        showCollapseAll: options.showCollapseAll,
      },
      dispose() {},
    };
    state.treeViews.push(view as TreeView<unknown>);
    return view;
  },
  showInputBox(options?: {
    password?: boolean;
    title?: string;
    placeHolder?: string;
    prompt?: string;
    value?: string;
    validateInput?: (value: string) => string | undefined;
  }): Promise<string | undefined> {
    state.inputBoxOptions.push(options ?? {});
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
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    state.output.push(`info:${message}`);
    state.informationMessageOffered.push(items);
    return Promise.resolve(state.informationMessageResults.shift());
  },
  showErrorMessage(message: string): Promise<void> {
    state.output.push(`error:${message}`);
    return Promise.resolve();
  },
  showWarningMessage(message: string): Promise<void> {
    state.output.push(`warn:${message}`);
    return Promise.resolve();
  },
  withProgress<T>(
    _options: unknown,
    task: (
      progress: { report(value: unknown): void },
      token: {
        isCancellationRequested: boolean;
        onCancellationRequested(listener: () => void): Disposable;
      },
    ) => Promise<T>,
  ): Promise<T> {
    return task(
      { report: () => undefined },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => undefined }),
      },
    );
  },
  createOutputChannel(name: string): OutputChannel {
    const channel: OutputChannel = {
      name,
      lines: [],
      shown: false,
      append(value: string) {
        channel.lines.push(value);
      },
      appendLine(value: string) {
        channel.lines.push(value);
      },
      replace(value: string) {
        channel.lines.splice(0, channel.lines.length, value);
      },
      clear() {
        channel.lines.splice(0, channel.lines.length);
      },
      show() {
        channel.shown = true;
      },
      hide() {
        channel.shown = false;
      },
      dispose() {
        channel.shown = false;
      },
    };
    state.outputChannels.push(channel);
    return channel;
  },
  createWebviewPanel(_viewType: string, _title: string, _column: number, _options: unknown): WebviewPanel {
    const listeners: Array<(message: unknown) => void> = [];
    const disposeListeners: Array<() => void> = [];
    const webview: Webview = {
      html: '',
      options: {},
      postedMessages: [],
      asWebviewUri: (localResource: Uri): Uri => ({
        ...localResource,
        toString: () => `vscode-resource:${localResource.path}`,
      }),
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
      dispose() {
        panel.visible = false;
        for (const listener of [...disposeListeners]) listener();
      },
      onDidDispose(listener: () => void): Disposable {
        disposeListeners.push(listener);
        return {
          dispose: () => {
            const index = disposeListeners.indexOf(listener);
            if (index >= 0) disposeListeners.splice(index, 1);
          },
        };
      },
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

export const env = {
  language: 'zh-cn',
  async openExternal(uri: Uri): Promise<boolean> {
    state.openedExternal.push(uri.toString());
    return true;
  },
};
export const extensions = { getExtension: () => undefined };

export const SecretStorage = {
  async get(key: string): Promise<string | undefined> { return state.secrets.get(key); },
  async store(key: string, value: string): Promise<void> { state.secrets.set(key, value); },
  async delete(key: string): Promise<void> { state.secrets.delete(key); },
};
