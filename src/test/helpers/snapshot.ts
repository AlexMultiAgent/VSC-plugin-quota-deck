import type { CapabilityState, ProviderId, ProviderSnapshot } from '../../core/types';

export function makeSnapshot(
  providerId: ProviderId,
  capabilities: Record<string, CapabilityState>,
  fetchedAt = '2026-11-16T00:00:00.000Z',
): ProviderSnapshot {
  return { providerId, fetchedAt, capabilities };
}
