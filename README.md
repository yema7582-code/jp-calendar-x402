# Japan Calendar API (x402)

Small pay-per-call JSON API for agents and scripts that need Japanese calendar facts. Each call costs 0.001 USDC on Base, paid with the [x402](https://x402.org) protocol (no account, no API key). Settlement goes through the PayAI facilitator.

| Endpoint | What it returns |
| --- | --- |
| `GET /v1/holidays?year=2026` | Official national holidays for a year (Cabinet Office CSV, 1955–2027) |
| `GET /v1/business-days?from=2026-12-25&add=5` | The date N Japanese business days later (or earlier with a negative number), skipping weekends and national holidays |
| `GET /v1/business-days?from=2026-11-01&to=2026-11-30` | Number of business days in a range, inclusive |
| `GET /v1/wareki?date=2026-10-24` | Japanese era date (令和8年10月24日, R8.10.24) plus holiday / business-day flags |

An unpaid request gets HTTP 402 with the payment terms; any x402 client (for example `x402-fetch` or `x402-axios`) pays and retries automatically. Bad input is rejected before settlement, so you are never charged for a 400.

Deploy: the entry point is `worker.js` (`export default { fetch }`), which runs unchanged on Cloudflare Workers or `deno serve worker.js`.
