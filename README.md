# Realm — Real Money. Game Brain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PayPal Sandbox](https://img.shields.io/badge/PayPal-REST%20Sandbox%20v1%2Fv2-blue.svg)](https://developer.paypal.com/)
[![AI Powered](https://img.shields.io/badge/AI-Google%20Gemini%20%7C%20Claude-purple.svg)](https://ai.google.dev/)
[![Deploy to Render](https://img.shields.io/badge/Deploy-Render-46E3B7.svg)](https://render.com)

> **PayPal AI Hackathon 2026 Entry**  
> An autonomous AI financial guide (**Oryn**) that audits your real subscriptions, curbs impulse spending, and coordinates squad savings—where **AI proposes, humans approve, and PayPal executes within hard financial mandates**.

---

## Table of Contents
- [Approved License](#approved-license)
- [How We Used PayPal](#how-we-used-paypal)
- [How We Used Artificial Intelligence (AI)](#how-we-used-artificial-intelligence-ai)
- [Other Tools, Technologies & Sponsor Integrations](#other-tools-technologies--sponsor-integrations)
  - [Render Deployment](#render-deployment)
  - [Postman / API Contracts](#postman--api-contracts)
  - [APIMatic / OpenAPI Alignment](#apimatic--openapi-alignment)
  - [Security & Architecture](#security--architecture)
- [Setup & Installation Instructions](#setup--installation-instructions)
  - [Prerequisites](#prerequisites)
  - [Quickstart](#quickstart)
  - [Environment Variables](#environment-variables)
  - [Running Automated Tests](#running-automated-tests)
  - [Smoke Probes](#smoke-probes)
- [Feature Matrix: Real vs. Simulated](#feature-matrix-real-vs-simulated)
- [Repository Availability](#repository-availability)

---

## Approved License
Realm is distributed under the **[MIT License](LICENSE)**, an approved **[Open Source Initiative (OSI)](https://opensource.org/licenses/MIT)** license. You are free to inspect, modify, and run this code under the conditions of the license.

---

## How We Used PayPal

Realm deep-links into the official **PayPal Developer REST API (Sandbox)** across four distinct product vectors:

1. **PayPal Subscriptions API (`/v1/billing/subscriptions`)**:
   - **Subscription Hydra Boss Battle**: Every subscription is mapped to a "Hydra head".
   - When Oryn's audit detects an under-utilized service (e.g., streaming service with zero logins in 60 days), Oryn queues a cancellation proposal.
   - Upon user approval, the server initiates an authenticated `POST /v1/billing/subscriptions/{id}/cancel` (or `suspend`) with reason tracking.

2. **PayPal Orders v2 API (`/v2/checkout/orders`)**:
   - **Quest Funding & Impulse Redirection**: Quests (e.g., Blue Yeti Mic, Travel Fund) are funded using PayPal standard checkout.
   - The server creates an order with server-calculated amounts (`intent: 'CAPTURE'`), binds an idempotency lock, and captures via `POST /v2/checkout/orders/{id}/capture` upon user approval in the front-end PayPal SDK popup.
   - When a user cancels a wasteful subscription, Realm offers to redirect the saved amount directly into a quest fund via PayPal.

3. **PayPal Payouts API (`/v1/payments/payouts`)**:
   - **XP Reward Cash-Out**: Players earn XP through financial discipline (e.g., maintaining streaks, parking impulse buys). XP converts into real PayPal sandbox payouts (`sender_batch_header`, recipient email, and note).
   - **Squad Pool Payouts**: When a shared quest reaches 100% funding (e.g., Broke Squad Goa trip), the pool executes a PayPal payout to the designated host.

4. **PayPal Webhooks API (`/v1/notifications/verify-webhook-signature`)**:
   - Full webhook verification engine validating `BILLING.SUBSCRIPTION.CANCELLED`, `PAYMENT.CAPTURE.COMPLETED`, and `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`.
   - Uses PayPal's certificate verification endpoint against raw incoming request buffers (`req.rawBody`) before state synchronization.

5. **PayPal JavaScript SDK**:
   - Dynamically injected into the frontend client (`https://www.paypal.com/sdk/js?client-id=...`) with secure Content Security Policy allowances.

---

## How We Used Artificial Intelligence (AI)

### Dual-Engine AI Architecture: Oryn
Realm features **Oryn**, an ancient RPG-style financial mentor that speaks like a cryptic elder yet computes with mathematical precision. Oryn supports two enterprise AI backends with seamless fallback:
- **Google Gemini API (`gemini-2.5-flash` / `gemini-1.5-flash`)**: High-speed function calling and multimodal comprehension via Google Generative Language REST endpoints.
- **Anthropic Claude SDK (`claude-sonnet-4-6` / `claude-sonnet-5-5`)**: Tool use loops, message streaming (SSE), and grounded structured outputs.
- **Replay Mode**: When offline or in test environments without API keys, Oryn falls back to a deterministic, labelled replay engine with zero crashes.

### Safety Model: Zero-Trust "Propose-Only" Mandates
Autonomous agents must **never** move real money without human authorization. Realm implements a three-tier safety boundary:
1. **The AI can only propose**: Oryn's function calling schema gives the AI `propose_action`, `read_subscriptions`, `read_ledger`, `read_quests`, and `read_mood_log`. It has **no API access to move funds**.
2. **Server-Side Mandates**: Even when a human clicks "Approve", the request is passed through the `src/agent/mandates.js` policy validator:
   - `perActionLimitUsd`: Maximum permitted expenditure per single action.
   - `dailyLimitUsd`: Hard daily expenditure ceiling.
   - `allowedActions`: Explicit whitelist of permissible financial verbs (`cancel_subscription`, `fund_quest`, `squad_payout`).
3. **Idempotent Flight Recorder**: Every proposal, approval, execution, and rejection is recorded in an immutable ledger with unique request IDs to prevent replay attacks and double-spend clicks.

---

## Other Tools, Technologies & Sponsor Integrations

### Render Deployment
- Fully containerized and cloud-ready for [Render](https://render.com).
- Configured via [`render.yaml`](render.yaml) blueprint specification:
  - Environment: `node` (Node 22 runtime)
  - Build Command: `npm ci`
  - Start Command: `node --env-file-if-exists=.env src/server.js`
  - Health check path: `/api/health`
  - Zero-downtime deployment ready.

### Postman / API Contracts
- Complete API schema documented in [`docs/CONTRACTS.md`](docs/CONTRACTS.md).
- Endpoints follow standardized REST conventions:
  - Uniform envelope error handling: `{ error: { code: 'STRING_CODE', message: 'Readable description' } }`.
  - Token-scoped public endpoints (`/api/pay/:token/order`) for multi-party squad contributions.
  - Can be directly imported into Postman or Astro for automated integration testing.

### APIMatic / OpenAPI Alignment
- All PayPal integration endpoints strictly follow PayPal's OpenAPI definitions for Subscriptions v1, Orders v2, and Payouts v1.
- Payload schemas validated at the boundary using **Zod** schema definitions.

### Security & Architecture
- **Runtime**: Node.js v22+ (native ES modules, native test runner, native fetch).
- **Web Framework**: Express 4.21 with strict JSON limits (100kb).
- **Content Security Policy (CSP)**: Handled via `helmet` v8 with granular whitelisting for PayPal SDK frames, scripts, Google Fonts, and inline event handlers (`script-src-attr 'unsafe-inline'`).
- **Rate Limiting**: Multi-tier protection via `express-rate-limit` protecting public paylinks, agent queries, and PayPal endpoints.
- **Frontend**: Lightweight vanilla ES modules, responsive doodle RPG design, zero build step required.

---

## Setup & Installation Instructions

### Prerequisites
- **Node.js**: v22.9.0 or higher
- **npm**: v10+
- (Optional) **PayPal Developer Account**: Sandbox Client ID and Secret from [developer.paypal.com](https://developer.paypal.com).
- (Optional) **AI Key**: Google Gemini API key or Anthropic Claude API key.

### Quickstart

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Shreyas13110/Realm.git
   cd Realm
   ```

2. **Install dependencies**:
   ```bash
   npm ci
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your sandbox credentials (the application will also run in simulated/replay mode if keys are left blank):
   ```ini
   PORT=3000
   PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
   PAYPAL_SECRET=your_paypal_sandbox_secret
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Start the server**:
   ```bash
   npm start
   ```
   Open **`http://localhost:3000`** in your browser.

---

### Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Local server listening port | `3000` |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox REST App Client ID | `""` (runs simulated) |
| `PAYPAL_SECRET` | PayPal Sandbox REST App Secret | `""` (runs simulated) |
| `PAYPAL_CURRENCY` | Base transaction currency | `USD` |
| `PAYPAL_WEBHOOK_ID` | Registered PayPal Webhook ID for verification | `""` |
| `GEMINI_API_KEY` | Google Gemini API Key | `""` (falls back to replay) |
| `GEMINI_MODEL` | Gemini Model identifier | `gemini-2.5-flash` |
| `ANTHROPIC_API_KEY` | Anthropic API Key (alternative engine) | `""` |
| `REWARD_PAYEE_EMAIL` | PayPal email address for XP cash-out payouts | `""` |

---

### Running Automated Tests

Realm contains a comprehensive automated test suite with **30 unit and integration tests** built on the native Node.js test runner:

```bash
# Run syntax validation across all project files
npm run check

# Run full test suite (executor, http, mandates, money, store, ui)
npm test
```

### Smoke Probes

To verify the live server against all contracts and UI modules:
```bash
node scripts/smoke.js http://localhost:3000
```

---

## Feature Matrix: Real vs. Simulated

| Feature | When Real Keys are Provided | Without Keys (Demo Mode) |
| :--- | :--- | :--- |
| **Oryn Agent** | Live streaming from Gemini / Claude | Labelled deterministic Replay Mode |
| **Financial Mandates** | Enforces real per-action and daily caps | Enforces real per-action and daily caps |
| **Subscription Cancel** | Executes `POST /v1/billing/subscriptions/.../cancel` | Simulates cancellation with mock receipt |
| **Quest Funding** | Real PayPal Orders v2 capture via modal popup | Simulated checkout with sandbox ID |
| **Squad Paylinks** | Real PayPal Orders generated per public link | Simulated order tokens |
| **XP Cash-Out** | Real PayPal Payouts batch sent to payee | Generates `SIM-` payout batch receipt |
| **Webhook Security** | Verifies RSA signatures with PayPal certs | Rejects unverified payloads with 400 |

---

## Repository Availability

- **Repository**: [https://github.com/Shreyas13110/Realm](https://github.com/Shreyas13110/Realm)
- **Visibility**: Public
- **License**: Approved OSI [MIT License](LICENSE)
