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
| `deepseek.usageAmount` | unavailable | no platform Session Token or Cookie |
| `deepseek.usageCost` | unavailable | no platform Session Token or Cookie |
| `deepseek.accountSummary` | unavailable | no platform Session Token or Cookie |

The usage series shape, time-range encoding, API-key enumeration behavior, and
session-expiry response remain unverified in this environment. Re-run the
capture script with `DEEPSEEK_SESSION_TOKEN` and `DEEPSEEK_COOKIE` before
treating detailed usage as live-verified.

## Endpoints

Every endpoint lives in `src/providers/endpoints.json`, which both the
extension and `scripts/capture-fixture.mjs` read. A capture therefore always
targets the URL the extension actually calls.

| Capability | Endpoint |
| --- | --- |
| `deepseek.balance` | `GET https://api.deepseek.com/user/balance` |
| `deepseek.usageAmount` | `GET https://platform.deepseek.com/api/v0/usage/by_api_key/amount` |
| `deepseek.usageCost` | `GET https://platform.deepseek.com/api/v0/usage/by_api_key/cost` |
| `deepseek.accountSummary` | `GET https://platform.deepseek.com/api/v0/users/get_user_summary` |

## Parsing rules

These hold regardless of whether the live shape is confirmed yet.

- A missing or non-numeric amount is contract drift. The parser throws, the
  capability becomes `failed` with a `malformed` error, and the last good value
  stays visible as `stale`. A malformed amount never becomes `0`.
- Token counts are currency-independent and may be summed over the range.
  Monetary amounts are never summed across currencies: each currency keeps its
  own row and its own total.
- The account summary and the summed per-key rows are alternative sources.
  `selectAccountTotals()` returns exactly one of them and reports which, so a
  summary total is never added to a per-key total.

## Open questions

- Whether the account's API key list can be enumerated. Until it can,
  `canAggregate()` refuses to sum per-key rows and the account totals come
  solely from `get_user_summary`.
- The `tz` parameter is sent as the IANA name of the configured time zone.
  Whether the platform accepts a zone other than `Asia/Shanghai` is unverified.
