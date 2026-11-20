import type { Translator } from '../localization';
import type {
  CapabilityState,
  ConnectionState,
  ProviderId,
  ProviderSnapshot,
  QuotaProvider,
} from '../core/types';
import { formatDateTime, providerDisplayName } from './display';

/** The slice of `vscode.OutputChannel` the report needs, kept structural for tests. */
export interface ReportChannel {
  clear(): void;
  appendLine(value: string): void;
  show(): void;
}

export interface HealthReportOptions {
  readonly providers: readonly QuotaProvider[];
  readonly snapshots: Partial<Record<ProviderId, ProviderSnapshot>>;
  readonly connection: ReadonlyMap<ProviderId, ConnectionState>;
  readonly order: ProviderId[];
  readonly t: Translator;
  readonly timeZone: string;
  readonly now: number;
}

function credentialLabel(state: ConnectionState | undefined, t: Translator): string {
  if (state === undefined) return t('health.credentialsMissing');
  switch (state.kind) {
    case 'ready':
      return t('health.credentialsReady');
    case 'partial':
      return t('health.credentialsPartial');
    case 'not-configured':
      return t('health.credentialsMissing');
    case 'error':
      return t('health.credentialsError');
  }
}

function capabilityStateLabel(state: CapabilityState | undefined, t: Translator): string {
  if (state === undefined) return t('health.unknown');
  switch (state.kind) {
    case 'ok':
      return t('state.ok');
    case 'stale':
      return t('state.stale');
    case 'failed':
      return `${t('state.failed')}: ${t(state.error.message)}`;
    case 'unconfigured':
      return t('state.unconfigured');
    case 'unsupported':
      return t('state.unsupported');
  }
}

function lastRefreshLabel(
  snapshot: ProviderSnapshot | undefined,
  timeZone: string,
  t: Translator,
): string {
  if (snapshot === undefined) return t('health.neverRefreshed');
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  return Number.isNaN(fetchedAt)
    ? t('health.neverRefreshed')
    : formatDateTime(fetchedAt, timeZone);
}

export function buildHealthReport(options: HealthReportOptions): string {
  const { t } = options;
  const lines: string[] = [
    t('health.title'),
    `${t('health.checkedAt')}: ${formatDateTime(options.now, options.timeZone)}`,
    '',
  ];
  const providers = options.order
    .map((id) => options.providers.find((provider) => provider.id === id))
    .filter((provider): provider is QuotaProvider => provider !== undefined);

  if (providers.length === 0) {
    lines.push(t('health.noProviders'));
    return lines.join('\n');
  }

  for (const provider of providers) {
    const snapshot = options.snapshots[provider.id];
    const connection = options.connection.get(provider.id);
    const descriptors = provider.getCapabilities().capabilities;
    lines.push(providerDisplayName(provider.id));
    lines.push(`  ${t('health.credentials')}: ${credentialLabel(connection, t)}`);
    lines.push(
      `  ${t('health.lastRefresh')}: ${lastRefreshLabel(snapshot, options.timeZone, t)}`,
    );
    for (const descriptor of descriptors) {
      lines.push(
        `  ${t(descriptor.titleKey)}: ` +
          capabilityStateLabel(snapshot?.capabilities[descriptor.id], t),
      );
    }
    if (connection?.kind === 'partial') {
      const missing = connection.missing.map((entry) => {
        const descriptor = descriptors.find(
          (candidate) => candidate.id === entry.capability,
        );
        return descriptor === undefined ? entry.capability : t(descriptor.titleKey);
      });
      lines.push(`  ${t('health.missingLabel')}: ${missing.join(', ')}`);
    }
    if (connection?.kind === 'error') {
      lines.push(
        `  ${t('health.credentialsError')}: ${t(connection.error.message)}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function writeHealthReport(channel: ReportChannel, report: string): void {
  channel.clear();
  for (const line of report.split('\n')) channel.appendLine(line);
  channel.show();
}
