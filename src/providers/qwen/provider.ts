import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  ProviderCapabilities,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'qwen.accountBalance', titleKey: 'capability.qwen.accountBalance', credential: 'api-key', required: false },
  { id: 'qwen.modelQuota', titleKey: 'capability.qwen.modelQuota', credential: 'api-key', required: false },
  { id: 'qwen.consumption', titleKey: 'capability.qwen.consumption', credential: 'api-key', required: false },
  { id: 'qwen.accessKeyValidation', titleKey: 'capability.qwen.accessKeyValidation', credential: 'api-key', required: false },
];

export class QwenProvider implements QuotaProvider {
  readonly id = 'qwen' as const;
  readonly displayName = 'Qwen';

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(_secrets: SecretReader): Promise<ConnectionState> {
    return { kind: 'not-configured' };
  }

  async fetchSnapshot(signal: AbortSignal): Promise<ProviderSnapshot> {
    void signal;
    const capabilities: Record<string, CapabilityState> = {};
    for (const capability of CAPABILITIES) {
      capabilities[capability.id] = { kind: 'unsupported', reason: 'not implemented in V1' };
    }
    return { providerId: this.id, fetchedAt: new Date().toISOString(), capabilities };
  }

  dispose(): void {}
}
