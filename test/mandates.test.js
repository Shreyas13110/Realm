import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMandate } from '../src/agent/mandates.js';

const m = { perActionLimitUsd: 50, dailyLimitUsd: 100, allowedActions: ['cancel_subscription'] };

test('allows in-limit allowed action', () => assert.equal(checkMandate(m, 0, 'cancel_subscription', 10).ok, true));
test('blocks disallowed action', () => assert.equal(checkMandate(m, 0, 'squad_payout', 1).ok, false));
test('blocks over per-action limit', () => assert.equal(checkMandate(m, 0, 'cancel_subscription', 51).ok, false));
test('blocks over daily limit', () => assert.equal(checkMandate(m, 95, 'cancel_subscription', 10).ok, false));
