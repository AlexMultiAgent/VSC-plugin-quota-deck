# Provider contracts

This directory records what was actually verified against provider endpoints.
It deliberately distinguishes verified capabilities from capabilities that were
not tested because no test credential was available.

- [MiniMax](minimax.md): unavailable in the current implementation environment.
- [DeepSeek](deepseek.md): balance verified; detailed usage and billing stay on the official website.

Fixtures under `src/test/fixtures/` are sanitized, anonymized, and guarded
against credential-shaped values and non-zero financial values. Re-run
`npm run guard:fixtures` after adding or changing a fixture.

## Re-verification

1. Export the required variables without writing them to a file or command line.
2. Run the relevant command from `scripts/capture-fixture.mjs`.
3. Run `npm run guard:fixtures`.
4. Review the sanitized fixture and update the contract document.
5. Commit the fixture and contract together.
