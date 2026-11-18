# MiniMax contract verification

Checked on 2026-11-19 against a live domestic Token Plan key (`sk-cp-…`) on
`https://www.minimaxi.com`. Captured payloads live in
`src/test/fixtures/minimax-cn/`.

| Capability | Status | Credential |
| --- | --- | --- |
| `minimax.plan` | verified | Token Plan key |
| `minimax.subscription` | verified | Token Plan key |
| `minimax.tokenUsage` | verified | Token Plan key |
| `minimax.points` | unverified | needs a web-session Cookie |

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
| `current_interval_status` / `current_weekly_status` | observed as `1`; the meaning of the other values is unverified |
| `end_time` / `weekly_end_time` | window reset, epoch **milliseconds** |
| `weekly_boost_permille` | present on the `general` entry, not used by the extension |

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

## `minimax.tokenUsage`

`GET /account/amount?page=1&limit=100&aggregate=false`

`charge_records[]` entries carry `created_at` in **epoch seconds** and
`consume_token` as a **string**. The response also carries `total_cnt`,
`consume_token_sum` and `consume_cash_sum`.

## `minimax.points`

Unverified: the endpoint is cookie-authenticated and no web-session Cookie was
available.
