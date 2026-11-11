# Project rules (Realm)
- Node >=22, Express 4, ESM, no build step. Small modules. zod for validation.
- Errors: `{ "error": { "code": "...", "message": "..." } }` via `AppError`.
- Server is the source of truth; the client never decides money.
- Money movement needs: stored proposal, Mandate check, idempotency key, audit entry (see `src/executor.js`).
- Label everything simulated. Never invent statistics.
- Verify PayPal endpoint shapes against developer.paypal.com before relying on them.
- Never use innerHTML with dynamic text.
- Append progress to docs/STATUS.md.
