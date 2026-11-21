import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RANGE_IDS, type RangeId } from '../../src/core/time';
import { PROVIDER_IDS, type ProviderId } from '../../src/core/types';
import type { ResolvedLanguage } from '../../src/localization';
import { collectQuota, renderMarkdown, type CollectQuotaOptions } from './quota';

export const SERVER_NAME = 'quota-deck-mcp';
export const SERVER_VERSION = '0.1.0';

const LANGUAGES = ['en-US', 'zh-CN'] as const;

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'get_quota',
    {
      title: 'Get AI quota, balance and reset windows',
      description:
        'Read MiniMax CN/Global, DeepSeek and Qwen account balances, quota windows and reset ' +
        'times. Credentials are read from the server environment (MINIMAX_CN_TOKEN_PLAN, ' +
        'MINIMAX_GLOBAL_TOKEN_PLAN, DEEPSEEK_API_KEY, QWEN_MANAGEMENT_TOKEN); this tool never ' +
        'accepts or returns secrets. A provider without a configured credential is reported as ' +
        'not-configured instead of a zero value.',
      inputSchema: {
        provider: z
          .enum(PROVIDER_IDS)
          .optional()
          .describe('Limit the report to one provider.'),
        range: z
          .enum(RANGE_IDS)
          .optional()
          .describe('MiniMax usage range; defaults to last7.'),
        language: z
          .enum(LANGUAGES)
          .optional()
          .describe('Report label language; defaults to en-US.'),
      },
    },
    async ({ provider, range, language }) => {
      const options: CollectQuotaOptions = {
        ...(provider !== undefined ? { provider: provider as ProviderId } : {}),
        ...(range !== undefined ? { range: range as RangeId } : {}),
        ...(language !== undefined ? { language: language as ResolvedLanguage } : {}),
      };
      const report = await collectQuota(options);
      return {
        content: [
          { type: 'text' as const, text: renderMarkdown(report) },
          { type: 'text' as const, text: JSON.stringify(report, null, 2) },
        ],
      };
    },
  );

  return server;
}
