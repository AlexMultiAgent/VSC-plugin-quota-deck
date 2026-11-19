# Provider contracts

This directory records what was actually verified against provider endpoints.
It deliberately distinguishes verified capabilities from capabilities that were
removed, and from those that were not tested because no test credential was
available.

- [MiniMax](minimax.md): plan, subscription and token usage verified against a live Token Plan
  key; the points capability was removed in v0.2.11 because it needed a web-session Cookie.
- [DeepSeek](deepseek.md): balance verified; detailed usage and billing stay on the official website.
- [Qwen / Model Studio](qwen.md): account balance integrated; public usage APIs
  and `bl quota show` recorded as stronger candidate sources.

Fixtures under `src/test/fixtures/` are sanitized, anonymized, and guarded
against credential-shaped values and non-zero financial values. Re-run
`npm run guard:fixtures` after adding or changing a fixture.

## Re-verification

1. Export the required variables without writing them to a file or command line. The MiniMax
   Token Plan key is the `sk-cp-…` key Claude Code sends to
   `ANTHROPIC_BASE_URL=https://api.minimax.cn/anthropic`; export it as `MINIMAX_CN_TOKEN_PLAN`.
2. Run the relevant command from `scripts/capture-fixture.mjs`.
3. Run `npm run guard:fixtures`.
4. Review the sanitized fixture and update the contract document.
5. Commit the fixture and contract together.
