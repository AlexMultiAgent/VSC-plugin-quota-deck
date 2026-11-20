import type { HttpClient } from '../core/http';
import type { QuotaProvider } from '../core/types';
import { DeepSeekProvider } from './deepseek/provider';
import { MiniMaxProvider } from './minimax/provider';
import { QwenProvider } from './qwen/provider';
import { ORIGINS } from './endpoints';

export const MINIMAX_CN_ORIGIN = ORIGINS['minimax-cn'];
export const MINIMAX_GLOBAL_ORIGIN = ORIGINS['minimax-global'];
export const QWEN_AUTH_ORIGIN = ORIGINS['qwen-auth'];
export const QWEN_CLI_ORIGIN = ORIGINS['qwen-cli'];
export const QWEN_DATA_ORIGIN = ORIGINS['qwen-data'];

export function buildProviders(http: HttpClient): QuotaProvider[] {
  return [
    new MiniMaxProvider('minimax-cn', MINIMAX_CN_ORIGIN, http),
    new MiniMaxProvider('minimax-global', MINIMAX_GLOBAL_ORIGIN, http),
    new DeepSeekProvider(http),
    new QwenProvider(
      {
        cli: QWEN_CLI_ORIGIN,
        data: QWEN_DATA_ORIGIN,
      },
      http,
    ),
  ];
}
