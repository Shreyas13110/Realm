// Mandates: user-set limits enforced by the server, never by the client.
export function checkMandate(mandates, spentTodayUsd, action, amountUsd = 0) {
  if (!mandates.allowedActions.includes(action)) {
    return { ok: false, reason: `Action "${action}" is not allowed by your Mandate` };
  }
  if (amountUsd > mandates.perActionLimitUsd) {
    return { ok: false, reason: `$${amountUsd} exceeds per-action limit of $${mandates.perActionLimitUsd}` };
  }
  if (spentTodayUsd + amountUsd > mandates.dailyLimitUsd) {
    return { ok: false, reason: `Would exceed daily limit of $${mandates.dailyLimitUsd}` };
  }
  return { ok: true };
}
