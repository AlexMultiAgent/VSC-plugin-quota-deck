# DeepSeek verified contract

Checked on 2026-11-17 and re-probed on 2026-11-20 with `DEEPSEEK_API_KEY`. Account values in the committed
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

## What the API key can and cannot reach (probed 2026-11-20)

| Route | Result with the API key |
| --- | --- |
| `GET /user/balance` and `GET /v1/user/balance` | Both return the same balance payload |
| `GET /models` and `GET /v1/models` | Public model metadata (`deepseek-flash`, `deepseek-v4-pro`, context window, modalities); not account data and not shown |
| `GET /user/usage`, `GET /user/bills` | 404; not public routes |
| `platform.deepseek.com/api/v0/users/get_user_summary` | HTTP 200 with `{"code":40003,"msg":"Authorization Failed (invalid token)"}` |
| `platform.deepseek.com/api/v0/usage/by_api_key/amount` and `/cost` | Same `40003` rejection |

The platform usage routes require the browser session's `userToken`, not an API
key. The extension will not request or forward that token, so detailed usage,
per-model cost, per-key spending, and quota windows remain console-only. The
API-key balance endpoint is account-level; it does not expose a per-key budget.

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
