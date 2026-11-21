# QuotaDeck MCP

Read-only MCP server for MiniMax CN/Global, DeepSeek and Qwen account balances, quota windows,
reset times and MiniMax usage. It reuses the parsing code of the
[QuotaDeck CN](https://marketplace.visualstudio.com/items?itemName=alexmultiagent.quota-deck)
VS Code extension and never proxies model requests.

## Quick start

```bash
npx -y quota-deck-mcp
```

The server speaks MCP over stdio. Without credentials every provider is reported as
`not-configured`; a missing value is never shown as `0`.

## Configure an MCP client

Claude Code (`~/.claude.json`, a project `.mcp.json`, or `claude mcp add`):

```json
{
  "mcpServers": {
    "quota-deck": {
      "command": "npx",
      "args": ["-y", "quota-deck-mcp"],
      "env": {
        "MINIMAX_CN_TOKEN_PLAN": "...",
        "MINIMAX_GLOBAL_TOKEN_PLAN": "...",
        "DEEPSEEK_API_KEY": "...",
        "QWEN_MANAGEMENT_TOKEN": "{\"accessToken\":\"...\",\"expiresAt\":\"...\"}"
      }
    }
  }
}
```

Only set the variables for the accounts you actually use.

## Credentials

| Provider | Variable | Notes |
| --- | --- | --- |
| MiniMax CN | `MINIMAX_CN_TOKEN_PLAN` | Token Plan key (`sk-cp-…`). |
| MiniMax Global | `MINIMAX_GLOBAL_TOKEN_PLAN` | Token Plan key for the international host. |
| DeepSeek | `DEEPSEEK_API_KEY` | Public balance endpoint only. |
| Qwen | `QWEN_MANAGEMENT_TOKEN` | JSON `{"accessToken":"…","expiresAt":"…"}` from the official Qianwen AI device flow. Optional; without it Qwen is reported as `not-configured`. |

Credentials are read from the process environment only. The server never touches VS Code Secret
Storage, never logs a value it reads, and never accepts a credential as a tool argument.
`QUOTA_DECK_TIME_ZONE` (optional) overrides the system IANA time zone used for reset labels.

## Tool

### `get_quota`

| Input | Type | Default | Meaning |
| --- | --- | --- | --- |
| `provider` | `minimax-cn` \| `minimax-global` \| `deepseek` \| `qwen` | all | Limit the report to one provider. |
| `range` | `today` \| `yesterday` \| `last7` \| `last30` \| `thisMonth` \| `lastMonth` | `last7` | MiniMax usage range; other providers ignore it. Not shown when there is no usage history. |
| `language` | `en-US` \| `zh-CN` | `en-US` | Label language. |

The tool returns a Markdown summary and the same data as JSON. Each provider reports its state
(`ok`, `partial`, `stale`, `failed`, `not-configured`, `unsupported`), account value, quota meters,
details and the missing environment variable when unconfigured.

## CLI mode

Useful for a quick check without an MCP client:

```bash
npx -y quota-deck-mcp --once
npx -y quota-deck-mcp --once --provider deepseek --language zh-CN
npx -y quota-deck-mcp --once --range thisMonth --time-zone Asia/Shanghai
```

## Development

```bash
npm --prefix mcp install
npm --prefix mcp run typecheck
npm --prefix mcp test
npm --prefix mcp run build
node mcp/dist/index.js --once
```

The package is built from `src/index.ts` with esbuild; the shared QuotaDeck provider and core
sources are bundled into `dist/index.js`, while `@modelcontextprotocol/sdk` and `zod` stay runtime
dependencies. The package is not part of the VS Code extension's VSIX.

## License

MIT
