import type { HttpClient } from '../core/http';
import type { QuotaProvider } from '../core/types';
import { DeepSeekProvider } from './deepseek/provider';
import { MiniMaxProvider } from './minimax/provider';
import { QwenProvider } from './qwen/provider';

export const MINIMAX_CN_ORIGIN = 'https://www.minimaxi.com';
export const MINIMAX_GLOBAL_ORIGIN = 'https://www.minimax.io';

export function buildProviders(http: HttpClient): QuotaProvider[] {
  return [
    new MiniMaxProvider('minimax-cn', MINIMAX_CN_ORIGIN, http),
    new MiniMaxProvider('minimax-global', MINIMAX_GLOBAL_ORIGIN, http),
    new DeepSeekProvider(http),
    new QwenProvider(),
  ];
}
