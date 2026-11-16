# MiniMax contract verification

Checked on 2026-11-17.

No MiniMax credentials were available in the implementation environment. The
capture commands stopped before making a request because the required
environment variables were absent:

- `MINIMAX_CN_TOKEN_PLAN`
- `MINIMAX_CN_WEB_COOKIE`
- `MINIMAX_GLOBAL_TOKEN_PLAN`
- `MINIMAX_GLOBAL_WEB_COOKIE`

## capability status

| Capability | Status | Reason |
| --- | --- | --- |
| `minimax.plan` | unavailable | no domestic or global Token Plan key |
| `minimax.subscription` | unavailable | no domestic Token Plan key |
| `minimax.tokenUsage` | unavailable | no domestic Token Plan key |
| `minimax.points` | unavailable | no web-session Cookie |

No response field names or response semantics are claimed as verified in this
environment. Re-run the capture script with the variables above and replace this
file with the confirmed contract before treating any MiniMax capability as
live-verified.
