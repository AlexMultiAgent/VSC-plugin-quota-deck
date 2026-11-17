import type { CapabilityState, ProviderSnapshot } from './types';

export function capabilityState(
  snapshot: ProviderSnapshot | undefined,
  capabilityId: string,
): CapabilityState | undefined {
  return snapshot?.capabilities[capabilityId];
}

/**
 * The data of a capability that carries a value.
 *
 * A capability that failed, was never configured, or is unsupported has no
 * usable value, so it reads as `undefined` rather than as a zero.
 */
export function capabilityValue<T>(
  snapshot: ProviderSnapshot | undefined,
  capabilityId: string,
): T | undefined {
  const state = capabilityState(snapshot, capabilityId);
  if (state === undefined) return undefined;
  if (state.kind !== 'ok' && state.kind !== 'stale') return undefined;
  return state.data as T;
}
