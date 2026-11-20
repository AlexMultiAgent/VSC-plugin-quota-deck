# MiniMax contract verification

Checked on 2026-11-20 against a live domestic Token Plan key (`sk-cp-…`) on
`https://www.minimaxi.com`. Captured payloads live in
`src/test/fixtures/minimax-cn/`.

| Capability | Status | Credential |
| --- | --- | --- |
| `minimax.plan` | verified | Token Plan key |
| `minimax.subscription` | verified | Token Plan key |
| `minimax.tokenUsage` | verified | Token Plan key |
| `minimax.accountBalance` | verified | Token Plan key (same key as the plan) |
| `minimax.points` | removed | needed a web-session Cookie |

## The credential check lives in the body, not the status code

A rejected credential still answers **HTTP 200**:

```json
{ "base_resp": { "status_code": 1004, "status_msg": "cookie is missing, log in again" } }
```

`base_resp.status_code === 0` is the only success marker. The provider maps a
non-zero code to an `auth` failure; without that check a revoked key looks like
an unexpected response shape.

## `minimax.plan`

`GET /v1/api/openplatform/coding_plan/remains`

The payload is `model_remains[]`, one entry per model. The domestic and
international hosts answer the same shape.

| Field | Meaning |
| --- | --- |
| `model_name` | `general` for the coding plan, `video` for the media allowance |
| `current_interval_total_count` | allowance of the 5-hour window; **0** on a Token Plan key |
| `current_interval_usage_count` | the count still **left**, not the count already spent |
| `current_interval_remaining_percent` | 5-hour window remaining percentage |
| `current_weekly_total_count` / `current_weekly_usage_count` | the same pair for the weekly window |
| `current_weekly_remaining_percent` | weekly remaining percentage |
| `current_interval_status` / `current_weekly_status` | `1` normal, `2` exhausted, `3` unlimited; when both totals are 0 and both statuses are 3, the model is not in the plan |
| `end_time` / `weekly_end_time` | window reset, epoch **milliseconds** |
| `weekly_unlimited` | legacy boolean fallback for an unlimited weekly window; `current_weekly_status: 3` is the current signal |
| `weekly_boost_permille` | per-mille multiplier applied to the weekly percentage (`1500` = 1.5×); the UI caps the displayed value at 200% |

### `current_interval_usage_count` is the remaining count

This is the field that costs a day when misread. The same record also carries
`current_interval_remaining_percent`, and the captured video allowance reports:

```json
{ "model_name": "video",
  "current_interval_total_count": 3,
  "current_interval_usage_count": 3,
  "current_interval_remaining_percent": 100 }
```

Three uses **left** of three — reading the usage count as "already spent"
turns a full allowance into `0/3`. The count fields only mean anything when
`current_interval_total_count` is greater than zero; a Token Plan key leaves
them at 0 and only the percentage fields carry the quota.

## `minimax.subscription`

`GET /v1/api/openplatform/charge/combo/cycle_audio_resource_package?biz_line=2&cycle_type=1&resource_package_type=7`

Top-level keys: `cycle_resource_packages` (the catalogue of plans for sale),
`current_subscribe`, `invoice_info`, `voice_slot_info`, `credit_info`,
`current_combo_card`, `base_resp`.

| Field | Meaning |
| --- | --- |
| `current_subscribe_end_time` | locale date string such as `"07/06/2027"` — ambiguous, and `Date.parse` resolves it to **local** midnight |
| `current_subscribe_end_time_ts` | the same expiry as epoch milliseconds — this is the one to read |
| `current_subscribe_title` | plan name, e.g. `TokenPlanMax-年度会员` |
| `voice_slot_info.voice_slot_total` / `voice_slot_used` | voice slots owned and used; the dashboard shows `used/total` |
| `current_combo_card.price_data.renew_price_tag` | renewal price in the account currency; the dashboard labels it as the renewal price |

### Credits (积分) are console-only

`credit_info.total_credit` is a legacy field (0.00 on an annual Token Plan) and is **not** the
balance the console labels 积分. The console reads `/backend/account/token_plan_credit`
(`balance_breakdown.total_balance` and its per-source `buckets`) through a Cookie-authenticated
console session. The extension accepts API credentials only, so it does not surface a credit
number; the dashboard and tooltip say the balance is console-only.

## `minimax.tokenUsage`

`GET /account/amount?page=1&limit=100&aggregate=false`

`charge_records[]` entries carry `created_at` in **epoch seconds**,
`consume_token` and `consume_cash` as **strings**. Purchase events
(`method` ending in `_purchase`) are excluded from usage. The response also
carries `total_cnt`, `consume_token_sum`, `consume_cash_sum` and
`consume_cash_after_voucher_sum`; the dashboard aggregates token and cash
totals for the selected range instead of showing the all-time sums.

## `minimax.accountBalance`

`GET /account/query_balance`

Live-verified on 2026-11-20 with the same `sk-cp-…` Token Plan key used for
`minimax.plan`. The official CLI normally selects this endpoint for `sk-api-…`
keys, but the Token Plan key answers it as well.

| Field | Meaning |
| --- | --- |
| `available_amount` | spendable balance |
| `cash_balance` | cash balance |
| `voucher_balance` | voucher balance |
| `credit_balance` | credit balance |
| `owed_amount` | outstanding amount |
| `balance_alert_switch` / `balance_alert_threshold` | alert settings; not surfaced |
| `base_resp.status_code` | `0` on success; the same body-level credential check applies |

The response has **no currency field**. The extension labels `minimax-cn`
amounts as `CNY` and `minimax-global` amounts as `USD`; if MiniMax ever returns
a different settlement currency for an account, that assumption is contract
drift.

## `minimax.points`

Removed in v0.2.11: the endpoint is cookie-authenticated, and the extension no
longer accepts a web-session Cookie. `src/core/cache.ts` lists the capability in
`RETIRED_MINIMAX_CAPABILITIES` so snapshots cached before the removal are
stripped of it.
