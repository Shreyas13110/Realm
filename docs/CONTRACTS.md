# API contracts
Errors: `{error:{code,message}}`. Session via httpOnly cookie `sid`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | /api/health | | `{ok, paypal:'sandbox'|'mock', ai:'live'|'replay'}` |
| GET | /api/state | | subscriptions, mandates, proposals, quests, timeline, audit, webhooks, mode |
| POST | /api/reset | | `{ok}` |
| PUT | /api/mandates | `{perActionLimitUsd, dailyLimitUsd, allowedActions[]}` | mandates |
| POST | /api/agent/chat | `{message<=500}` | SSE: `text`, `tool`, `notice`, `error`, `done` events |
| POST | /api/proposals/:id/approve | | proposal (403 `MANDATE_BLOCKED`, 409 `CONFLICT`) |
| POST | /api/proposals/:id/reject | | proposal |
| POST | /api/webhooks/paypal | PayPal event | `{ok}` or 400 `BAD_SIGNATURE` |

Subscription: `{id, name, amountUsd, status: ACTIVE|CANCEL_REQUESTED|CANCELLED, simulated, paypalId?}`
Proposal: `{id, action, subscriptionId, name, monthlySavingUsd, reason, status: pending|executed|rejected|blocked}`
| POST | /api/orders/capture | `{orderId}` | `{status:'COMPLETED', orderId, captureId, amountUsd, simulated}` |
| POST | /api/pools/:id/paylinks | `{payerName, amountUsd}` | `{token, payerName, amountUsd, url}` |
| POST | /api/pools/:id/release | | proposal (executed) |
| POST | /api/subs/:id/sync | | `{id, status, paypalStatus}` |
| POST | /api/mandates/test | | 403 `MANDATE_BLOCKED` |
| GET | /api/pay/:token | | `{poolName, payerName, amountUsd, status, simulated}` (public) |
| POST | /api/pay/:token/order | | `{orderId, approveUrl, simulated}` (public) |
| POST | /api/pay/:token/capture | `{orderId}` | `{status, captureId, amountUsd, simulated}` (public) |

Proposal statuses: pending, executing, awaiting_payment, executed, rejected, blocked, failed. Actions: cancel_subscription, fund_quest, squad_payout.
