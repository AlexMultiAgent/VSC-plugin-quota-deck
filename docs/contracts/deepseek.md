# DeepSeek verified contract

Checked on 2026-11-17 with `DEEPSEEK_API_KEY`. Account values in the committed
fixture are anonymized to zero while preserving the response shape and JSON
types.

## deepseek.balance

Endpoint: `GET https://api.deepseek.com/user/balance`.

Authentication: `Authorization: Bearer <api key>`.

| Question | Confirmed answer |
| --- | --- |
| Availability field | `is_available` |
| Balance list field | `balance_infos` |
| Currency field | `currency` |
| Total balance field | `total_balance` |
| Granted balance field | `granted_balance` |
| Topped-up balance field | `topped_up_balance` |
| Currencies observed | `CNY` |

## capability status

| Capability | Status | Reason |
| --- | --- | --- |
| `deepseek.balance` | verified | live response captured and shape checked |

The extension deliberately exposes only `deepseek.balance`. Detailed usage,
cost, and account summaries are not queried; users should open
`https://platform.deepseek.com` for those records. No platform session token
or Cookie is requested or forwarded.

## Endpoints

Every endpoint lives in `src/providers/endpoints.json`, which both the
extension and `scripts/capture-fixture.mjs` read. A capture therefore always
targets the URL the extension actually calls.

| Capability | Endpoint |
| --- | --- |
| `deepseek.balance` | `GET https://api.deepseek.com/user/balance` |

## Parsing rules

These hold regardless of whether the live shape is confirmed yet.

- A missing or non-numeric amount is contract drift. The parser throws, the
  capability becomes `failed` with a `malformed` error, and the last good value
  stays visible as `stale`. A malformed amount never becomes `0`.
- Monetary amounts are never summed across currencies. Each currency keeps its
  own row and its own total.
