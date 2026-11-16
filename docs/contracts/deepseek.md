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
