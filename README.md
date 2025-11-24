```
AXLLM Example
=============
Packages: @lucid-agents/core, @lucid-agents/http, @lucid-agents/hono, @lucid-agents/payments, @ax-llm/ax, zod, Bun.

Files
-----
- `src/agent.ts` – agent runtime with payments + Ax client; priced `brainstorm` entrypoint.
- `src/index.ts` – serves via `Bun.serve` on `PORT` (default 8787).
- `scripts/test-agent.ts` – paid smoke test.
- `.env.example` – env template.

Setup
-----
```
cp .env.example .env
```
Fill:
- `OPENAI_API_KEY` – Ax/OpenAI (missing => fallback summary).
- `PRIVATE_KEY` – pays for LLM via x402.
- `PAYMENTS_RECEIVABLE_ADDRESS` (defaults to `0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429`).
- `FACILITATOR_URL` / `NETWORK`; optional `AX_MODEL`, `AX_API_URL`.

Run
---
- Dev: `bun run dev`
- Start: `bun run start`
Manifest: `/.well-known/agent.json`

Entrypoint
----------
- `brainstorm` (invoke) price `0.03` USDC. Input `{ topic }`, output `{ summary, ideas }`. Falls back if Ax not configured.

Paid test
---------
```
CLIENT_PRIVATE_KEY=0x... OPENAI_API_KEY=sk-... bun run scripts/test-agent.ts
```
- Uses `AGENT_URL` if set; starts server if needed, reads manifest pricing, calls `/entrypoints/brainstorm/invoke`.

Notes
-----
- Typecheck: `bun run typecheck`
- Adjust price: `PER_CALL_PRICE` in `src/agent.ts`.
```
