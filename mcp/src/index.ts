import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import { RANGE_IDS, type RangeId } from '../../src/core/time';
import { isProviderId, type ProviderId } from '../../src/core/types';
import type { ResolvedLanguage } from '../../src/localization';
import { collectQuota, renderMarkdown, type CollectQuotaOptions } from './quota';
import { createServer } from './server';

const LANGUAGES = ['en-US', 'zh-CN'] as const;

function printHelp(): void {
  process.stderr.write(
    [
      'QuotaDeck MCP server (read-only).',
      '',
      'Usage: quota-deck-mcp [--once] [--provider <id>] [--range <range>] [--language <en-US|zh-CN>] [--time-zone <IANA>]',
      '',
      'Without --once the server speaks MCP over stdio.',
      'Credentials are read from MINIMAX_CN_TOKEN_PLAN, MINIMAX_GLOBAL_TOKEN_PLAN,',
      'DEEPSEEK_API_KEY and QWEN_MANAGEMENT_TOKEN. They are never logged or returned.',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const parsed = (() => {
    try {
      return parseArgs({
        options: {
          once: { type: 'boolean', default: false },
          provider: { type: 'string' },
          range: { type: 'string' },
          language: { type: 'string' },
          'time-zone': { type: 'string' },
          help: { type: 'boolean', default: false },
        },
        allowPositionals: false,
      });
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      printHelp();
      process.exitCode = 2;
      return undefined;
    }
  })();
  if (parsed === undefined) return;

  if (parsed.values.help) {
    printHelp();
    return;
  }

  const provider = parsed.values.provider;
  if (provider !== undefined && !isProviderId(provider)) {
    process.stderr.write(`Unknown provider: ${provider}\n`);
    process.exitCode = 2;
    return;
  }
  const range = parsed.values.range;
  if (range !== undefined && !(RANGE_IDS as readonly string[]).includes(range)) {
    process.stderr.write(`Unknown range: ${range}\n`);
    process.exitCode = 2;
    return;
  }
  const language = parsed.values.language;
  if (language !== undefined && !(LANGUAGES as readonly string[]).includes(language)) {
    process.stderr.write(`Unknown language: ${language}\n`);
    process.exitCode = 2;
    return;
  }

  const options: CollectQuotaOptions = {
    ...(provider !== undefined && isProviderId(provider) ? { provider } : {}),
    ...(range !== undefined ? { range: range as RangeId } : {}),
    ...(language === 'en-US' || language === 'zh-CN'
      ? { language: language as ResolvedLanguage }
      : {}),
    ...(parsed.values['time-zone'] !== undefined ? { timeZone: parsed.values['time-zone'] } : {}),
  };

  if (parsed.values.once) {
    const report = await collectQuota(options);
    process.stdout.write(`${renderMarkdown(report)}\n${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
