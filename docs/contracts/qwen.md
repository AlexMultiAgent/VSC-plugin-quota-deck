# Qwen / Model Studio contract inventory

Checked on 2026-11-18.

This document separates sources used by the extension from stronger Qwen /
Model Studio sources that are available but not yet integrated. Listing a
source here does not claim that its live response shape has been verified in
this implementation environment.

## Source inventory

| Source | Capability | Credential | Status |
| --- | --- | --- | --- |
| Alibaba Cloud BSS `QueryAccountBalance` | Account available, cash, credit, and quota-limit amounts | Alibaba Cloud AccessKey ID and Secret | Integrated as `qwen.accountBalance` |
| Model Studio Usage API `GET /usage/summary` | Usage totals for a selected period | Not yet verified | Candidate runtime source |
| Model Studio Usage API `GET /usage/trend` | Usage time series for a selected period | Not yet verified | Candidate runtime source |
| Model Studio CLI `bl quota show` | Account quota inspection from a terminal | User-installed CLI session | Diagnostic/reference only |

The balance query uses the BSS OpenAPI endpoint at
`https://business.aliyuncs.com/`. The Usage API and CLI entries do not add any
runtime network request in the current version.

## Why the usage sources are stronger

The integrated balance query describes the Alibaba Cloud account. It cannot
show how many tokens a Qwen model consumed, which models were used, or how
usage changed over time. The public `/usage/summary` and `/usage/trend`
endpoints can provide those dimensions and are therefore a stronger future
basis for the Qwen dashboard than the balance-only capability.

`bl quota show` can be useful when manually checking quota behavior or
capturing a fixture. The extension should not depend on it at runtime by
default because it requires a separately installed CLI, imports an external
authentication context, and makes error handling and support harder.

## Integration gates

Before any Usage API capability changes from candidate to integrated, capture
and sanitize representative responses for all supported periods, then confirm:

- the API origin and authentication method;
- exact query parameters, timezone handling, and allowed range values;
- field names and units for request, token, model, and cost totals;
- pagination, rate limits, and empty-period behavior;
- whether the endpoint reports free quota, paid usage, or both;
- the RAM permissions required beyond `bss:QueryAccountBalance`.

Until those checks pass, the dashboard must not turn candidate usage data into
zeros or present it as live account usage.

## capability status

| Capability | Status |
| --- | --- |
| `qwen.accountBalance` | Implemented and unit-tested; not live-captured here |
| `qwen.usageSummary` | Candidate; not implemented |
| `qwen.usageTrend` | Candidate; not implemented |
| `qwen.quotaCli` | Reference only; not implemented |
