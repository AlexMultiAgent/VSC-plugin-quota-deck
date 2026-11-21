import { normalizeError } from '../../src/core/errors';
import { HttpClient } from '../../src/core/http';
import { resolveTimeZone, type RangeId } from '../../src/core/time';
import type {
  CapabilityState,
  ConnectionState,
  ProviderId,
  ProviderSnapshot,
  QuotaProvider,
} from '../../src/core/types';
import type { ResolvedLanguage, Translator } from '../../src/localization';
import { translatorFor } from '../../src/localization';
import { buildDashboardModel, type DashboardProvider, type ProviderHealth } from '../../src/presentation/dashboard/viewModel';
import { providerDisplayName } from '../../src/presentation/display';
import { pricingState } from '../../src/providers/deepseek/pricing';
import { buildProviders } from '../../src/providers/registry';
import { credentialEnvNames, envSecretReader } from './credentials';

export interface CollectQuotaOptions {
  readonly provider?: ProviderId;
  readonly range?: RangeId;
  readonly language?: ResolvedLanguage;
  readonly timeZone?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: number;
  readonly requestTimeoutMs?: number;
}

export interface ProviderQuotaReport {
  readonly id: ProviderId;
  readonly name: string;
  readonly state: ProviderHealth;
  readonly stateLabel: string;
  readonly fetchedAt: string | null;
  readonly accountValue: { readonly label: string; readonly value: string } | null;
  readonly meters: DashboardProvider['meters'];
  readonly details: DashboardProvider['details'];
  readonly message: string | null;
}

export interface MissingCredentials {
  readonly provider: ProviderId;
  readonly env: string[];
}

export interface QuotaReport {
  readonly generatedAt: string;
  readonly timeZone: string;
  readonly range: RangeId;
  readonly rangeLabel: string;
  readonly language: ResolvedLanguage;
  readonly providers: ProviderQuotaReport[];
  readonly missingCredentials: MissingCredentials[];
}

function failedCapabilities(provider: QuotaProvider): Record<string, CapabilityState> {
  const error = normalizeError({ malformed: true });
  const capabilities: Record<string, CapabilityState> = {};
  for (const capability of provider.getCapabilities().capabilities) {
    capabilities[capability.id] = { kind: 'failed', error };
  }
  return capabilities;
}

/**
 * Fetch one snapshot per selected provider and reduce them through the same
 * dashboard view model the extension uses, so the MCP report cannot disagree
 * with the VS Code surfaces about a balance, a percentage or a reset time.
 */
export async function collectQuota(options: CollectQuotaOptions = {}): Promise<QuotaReport> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const language = options.language ?? 'en-US';
  const range = options.range ?? 'last7';
  const timeZone = resolveTimeZone(options.timeZone ?? env.QUOTA_DECK_TIME_ZONE);
  const t: Translator = translatorFor(language);
  const http = new HttpClient({ timeoutMs: 15_000, maxAttempts: 2 });
  const secrets = envSecretReader(env);
  const providers = buildProviders(http).filter(
    (provider) => options.provider === undefined || provider.id === options.provider,
  );

  const connections = new Map<ProviderId, ConnectionState>();
  const snapshots: Partial<Record<ProviderId, ProviderSnapshot>> = {};

  for (const provider of providers) {
    connections.set(provider.id, await provider.connect(secrets));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? 30_000);
    try {
      snapshots[provider.id] = await provider.fetchSnapshot(controller.signal, range, timeZone);
    } catch {
      snapshots[provider.id] = {
        providerId: provider.id,
        fetchedAt: new Date(now).toISOString(),
        capabilities: failedCapabilities(provider),
      };
    } finally {
      clearTimeout(timer);
      provider.dispose();
    }
  }

  const model = buildDashboardModel({
    snapshots,
    order: providers.map((provider) => provider.id),
    t,
    range,
    pricing: pricingState(now),
    timeZone,
    now,
  });

  const byId = new Map<ProviderId, ProviderQuotaReport>();
  for (const provider of model.providers) {
    byId.set(provider.id, {
      id: provider.id,
      name: provider.name,
      state: provider.state,
      stateLabel: provider.stateLabel,
      fetchedAt: provider.fetchedAt,
      accountValue:
        provider.accountValue === null
          ? null
          : { label: provider.accountValue.label, value: provider.accountValue.value },
      meters: provider.meters,
      details: provider.details,
      message: provider.message,
    });
  }
  for (const provider of providers) {
    if (byId.has(provider.id)) continue;
    byId.set(provider.id, {
      id: provider.id,
      name: providerDisplayName(provider.id),
      state: 'not-configured',
      stateLabel: t('state.unconfigured'),
      fetchedAt: null,
      accountValue: null,
      meters: [],
      details: [],
      message: `Missing ${credentialEnvNames(provider.id).join(' or ')}`,
    });
  }

  const missingCredentials = providers
    .filter((provider) => connections.get(provider.id)?.kind === 'not-configured')
    .map((provider) => ({ provider: provider.id, env: credentialEnvNames(provider.id) }));

  return {
    generatedAt: new Date(now).toISOString(),
    timeZone,
    range,
    rangeLabel: model.rangeLabel,
    language,
    providers: providers
      .map((provider) => byId.get(provider.id))
      .filter((report): report is ProviderQuotaReport => report !== undefined),
    missingCredentials,
  };
}

/** A compact human-readable rendering of the same report the tool returns as JSON. */
export function renderMarkdown(report: QuotaReport): string {
  const lines: string[] = [
    `# QuotaDeck — ${report.rangeLabel} (${report.timeZone})`,
    '',
    `Generated ${report.generatedAt}.`,
    '',
  ];
  for (const provider of report.providers) {
    lines.push(`## ${provider.name} — ${provider.stateLabel}`);
    if (provider.accountValue !== null) {
      lines.push(`- ${provider.accountValue.label}: ${provider.accountValue.value}`);
    }
    for (const meter of provider.meters) {
      const value =
        meter.unlimited === true
          ? 'unlimited'
          : meter.valueLabel ?? (meter.percent === null ? '—' : `${Math.round(meter.percent)}%`);
      const reset = meter.resetLabel === null ? '' : ` (${meter.resetLabel})`;
      lines.push(`- ${meter.label}: ${value}${reset}`);
    }
    if (provider.message !== null) lines.push(`- ${provider.message}`);
    lines.push('');
  }
  if (report.missingCredentials.length > 0) {
    lines.push(
      'Missing credentials: ' +
        report.missingCredentials
          .map((missing) => `${missing.provider} (${missing.env.join(' or ')})`)
          .join(', '),
    );
  }
  return lines.join('\n').trimEnd() + '\n';
}
