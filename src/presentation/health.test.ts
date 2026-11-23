import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CapabilityDescriptor,
  ConnectionState,
  ProviderId,
  QuotaProvider,
} from '../core/types';
import { translatorFor } from '../localization';
import { __reset, window } from '../test/__mocks__/vscode';
import { makeSnapshot } from '../test/helpers/snapshot';
import { buildHealthReport, writeHealthReport } from './health';

const zh = translatorFor('zh-CN');
const now = Date.parse('2026-11-20T10:00:00.000Z');

function provider(id: ProviderId, capabilities: CapabilityDescriptor[]): QuotaProvider {
  return {
    id,
    displayName: id,
    getCapabilities: () => ({ capabilities }),
    connect: async (): Promise<ConnectionState> => ({
      kind: 'ready',
      capabilities: capabilities.map((capability) => capability.id),
    }),
    fetchSnapshot: async () => {
      throw new Error('not used');
    },
    dispose: () => undefined,
  };
}

describe('buildHealthReport', () => {
  it('reports credentials, refresh time and capability states in order', () => {
    const minimax = provider('minimax-cn', [
      {
        id: 'minimax.plan',
        titleKey: 'capability.minimax.plan',
        credential: 'token-plan-key',
        required: true,
      },
      {
        id: 'minimax.subscription',
        titleKey: 'capability.minimax.subscription',
        credential: 'token-plan-key',
        required: false,
      },
    ]);
    const deepseek = provider('deepseek', [
      {
        id: 'deepseek.balance',
        titleKey: 'capability.deepseek.balance',
        credential: 'api-key',
        required: true,
      },
    ]);
    const connection = new Map<ProviderId, ConnectionState>([
      [
        'minimax-cn',
        { kind: 'ready', capabilities: ['minimax.plan', 'minimax.subscription'] },
      ],
      ['deepseek', { kind: 'not-configured' }],
    ]);

    const report = buildHealthReport({
      providers: [minimax, deepseek],
      snapshots: {
        'minimax-cn': makeSnapshot(
          'minimax-cn',
          {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: '2026-11-20T10:00:00.000Z',
              data: {},
            },
            'minimax.subscription': {
              kind: 'stale',
              fetchedAt: '2026-11-19T10:00:00.000Z',
              data: {},
              reason: 'network',
            },
          },
          '2026-11-20T10:00:00.000Z',
        ),
        deepseek: makeSnapshot('deepseek', {
          'deepseek.balance': { kind: 'unconfigured', reason: 'missing api key' },
        }),
      },
      connection,
      order: ['minimax-cn', 'deepseek'],
      t: zh,
      timeZone: 'Asia/Shanghai',
      now,
    });

    expect(report).toContain('QuotaDeck CN — 连接状态');
    expect(report).toContain('检查时间: 2026-11-20 18:00');
    expect(report.indexOf('MiniMax CN')).toBeLessThan(report.indexOf('DeepSeek'));
    expect(report).toContain('凭据: 已保存');
    expect(report).toContain('上次刷新: 2026-11-20 18:00');
    expect(report).toContain('Token Plan 额度: 正常');
    expect(report).toContain('订阅详情: 数据已过期');
    expect(report).toContain('凭据: 未配置');
    expect(report).toContain('上次刷新: 2026-11-16 08:00');
    expect(report).toContain('账户余额: 未配置');
  });

  it('lists missing credentials and the failure message', () => {
    const qwen = provider('qwen', [
      {
        id: 'qwen.accountBalance',
        titleKey: 'capability.qwen.accountBalance',
        credential: 'management-token',
        required: true,
      },
      {
        id: 'qwen.tokenPlan',
        titleKey: 'capability.qwen.tokenPlan',
        credential: 'management-token',
        required: true,
      },
    ]);
    const connection = new Map<ProviderId, ConnectionState>([
      [
        'qwen',
        {
          kind: 'partial',
          capabilities: ['qwen.tokenPlan'],
          missing: [{ capability: 'qwen.accountBalance', credential: 'management-token' }],
        },
      ],
    ]);

    const report = buildHealthReport({
      providers: [qwen],
      snapshots: {
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'failed',
            error: { kind: 'network', message: 'error.network' },
          },
          'qwen.tokenPlan': {
            kind: 'ok',
            fetchedAt: '2026-11-20T10:00:00.000Z',
            data: {},
          },
        }),
      },
      connection,
      order: ['qwen'],
      t: zh,
      timeZone: 'Asia/Shanghai',
      now,
    });

    expect(report).toContain('凭据: 部分缺失');
    expect(report).toContain('账户余额: 获取失败: 网络请求失败。');
    expect(report).toContain('Token Plan 额度: 正常');
    expect(report).toContain('缺少凭据的能力: 账户余额');
  });

  it('marks a provider without a snapshot as unknown', () => {
    const deepseek = provider('deepseek', [
      {
        id: 'deepseek.balance',
        titleKey: 'capability.deepseek.balance',
        credential: 'api-key',
        required: true,
      },
    ]);

    const report = buildHealthReport({
      providers: [deepseek],
      snapshots: {},
      connection: new Map<ProviderId, ConnectionState>([
        ['deepseek', { kind: 'ready', capabilities: ['deepseek.balance'] }],
      ]),
      order: ['deepseek'],
      t: zh,
      timeZone: 'Asia/Shanghai',
      now,
    });

    expect(report).toContain('上次刷新: 尚未刷新');
    expect(report).toContain('账户余额: 未知');
  });

  it('reports when there is no provider to check', () => {
    const report = buildHealthReport({
      providers: [],
      snapshots: {},
      connection: new Map(),
      order: [],
      t: zh,
      timeZone: 'Asia/Shanghai',
      now,
    });

    expect(report).toContain('没有可检查的服务商。');
  });
});

describe('writeHealthReport', () => {
  beforeEach(() => __reset());

  it('replaces the channel content and shows it', () => {
    const channel = window.createOutputChannel('QuotaDeck CN');
    channel.appendLine('stale');

    writeHealthReport(channel, 'first\nsecond');

    expect(channel.lines).toEqual(['first', 'second']);
    expect(channel.shown).toBe(true);
  });
});
