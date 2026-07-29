# Ask my portfolio — Cloudflare Worker

This Worker (`ai-proxy.js`) is the server-side proxy for the "Ask my portfolio"
chat feature. It keeps the Anthropic API key **off the client** — the static
site (GitHub Pages) only ever talks to this Worker, and the Worker talks to
Anthropic.

It accepts `POST { messages }`, calls the Anthropic Messages API
(**Claude Haiku 4.5**, the cheapest current model) with streaming enabled,
parses the SSE response server-side, and streams back **plain text tokens** that
the front-end appends directly.

The chat is **public but cost-safe**. Layered defenses ensure abuse can't
produce a meaningful bill:

1. **Origin allowlist** — only the portfolio origins (+ localhost) may call it.
2. **Per-IP rate limit** — Cloudflare's native Rate Limiting binding.
3. **Global daily cap** — a KV counter caps total upstream calls per UTC day.
4. **Input caps** — small `max_tokens` plus message size/count limits.
5. **Anthropic spend limit** — a hard backstop you set in the Anthropic Console
   (see step 6). Do not skip this.

---

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (the free plan is
  enough — see limits below).
- [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) — the
  Cloudflare Workers CLI:
  ```sh
  npm install -g wrangler
  wrangler login
  ```
- An [Anthropic account + API key](https://console.anthropic.com/). Sign up at
  **console.anthropic.com** with a personal email; the API is prepaid, so add a
  small credit (e.g. $5) to activate the key.

---

## 1. Create the KV namespace (global daily counter)

```sh
wrangler kv namespace create DEMO_KV
```

Wrangler prints an `id`, e.g.:

```
[[kv_namespaces]]
binding = "DEMO_KV"
id = "a1b2c3d4e5f6..."
```

Copy that `id` into `wrangler.toml` (below).

---

## 2. Configure `wrangler.toml` (complete example)

Create `wrangler.toml` next to `ai-proxy.js`. This includes **all** bindings and
vars the Worker uses:

```toml
name = "ask-my-portfolio"
main = "ai-proxy.js"
compatibility_date = "2024-11-01"

# --- Tunable vars ---
[vars]
# Global cap on upstream Anthropic calls per UTC day. Default in code: 300.
MAX_DAILY_REQUESTS = "300"

# --- Per-IP rate limiter (Cloudflare native Rate Limiting binding) ---
# `simple.limit` requests allowed per `simple.period` seconds (period is 10 or 60).
# Default here: 5 requests / 60s per IP. The Worker reads it as env.RATE_LIMITER.
[[unsafe.bindings]]
name = "RATE_LIMITER"
type = "ratelimit"
namespace_id = "1001"            # any unique integer id you choose for this limiter
simple = { limit = 5, period = 60 }

# --- KV namespace for the global daily counter ---
[[kv_namespaces]]
binding = "DEMO_KV"
id = "PASTE_THE_ID_FROM_STEP_1"
```

Notes:
- `[[unsafe.bindings]]` with `type = "ratelimit"` is Cloudflare's current
  Rate Limiting binding syntax. `namespace_id` is just a unique integer you pick
  to identify this limiter (not related to KV ids). `period` must be `10` or
  `60` seconds.
- The Worker degrades gracefully: if `RATE_LIMITER` or `DEMO_KV` is not bound
  (e.g. an early local run), that one defense is skipped rather than erroring.

---

## 3. Store the API key as a secret

**Never** put the key in `wrangler.toml` or the source. Store it as an
encrypted secret — the Worker reads it from `env.ANTHROPIC_API_KEY`:

```sh
wrangler secret put ANTHROPIC_API_KEY
# paste your sk-ant-... key when prompted
```

---

## 4. Deploy

```sh
wrangler deploy
```

Wrangler prints the deployed URL, for example:

```
https://ask-my-portfolio.<your-subdomain>.workers.dev
```

That URL is your **endpoint**.

### Test it (curl)

The Worker enforces the origin allowlist, so pass an allowed `Origin` header:

```sh
curl -N https://ask-my-portfolio.<your-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -H "Origin: https://gaganrandhawa.me" \
  -d '{"messages":[{"role":"user","content":"What is Gagan good at?"}]}'
```

You should see the answer stream back as plain text. Without an allowed
`Origin`/`Referer` you'll get `403 {"error":"Forbidden origin."}`. Fire the
request ~6 times quickly to see the `429` rate-limit JSON.

---

## 5. Wire it into the site

Set the endpoint in `src/main.js` and pass it to `initAiChat`:

```js
// src/main.js
import { initAiChat } from "./ai-chat.js";

// Your deployed Worker URL (leave "" to run the built-in fallback demo).
const AI_ENDPOINT = "https://ask-my-portfolio.<your-subdomain>.workers.dev";

initAiChat(document.querySelector("#ai-chat"), { endpoint: AI_ENDPOINT });
```

Set `AI_ENDPOINT = ""` (or omit `endpoint`) and the widget runs in **fallback
mode** with canned answers — handy before the Worker is deployed.

### Endpoint contract

- **Request:** `POST <endpoint>` with header `Content-Type: application/json`
  and body `{ "messages": [{ "role": "user" | "assistant", "content": "..." }, ...] }`.
  The request must carry an allowed `Origin` (browsers send this automatically).
- **Success:** HTTP 200, `Content-Type: text/plain` — a streaming body of raw
  text tokens. The front-end reads `response.body` and appends chunks as they
  arrive.
- **Daily cap reached:** HTTP 200 with a streamed friendly message (still raw
  text). We deliberately return 200, not an error, so the visitor sees a
  graceful reply in the chat — and **no Anthropic call is made**, so spend is
  zero once the cap is hit.
- **Errors:** JSON `{ "error": "..." }` with an appropriate status — `400` bad
  input, `403` forbidden origin, `405` wrong method, `429` rate-limited,
  `500`/`502` server/provider issues.
- **CORS:** `OPTIONS` preflight is handled; responses echo the specific allowed
  origin (never `*`).

---

## 6. Set a hard Anthropic spend limit (do not skip)

In the [Anthropic Console](https://console.anthropic.com/) → **Billing / Usage
limits**, set a **low monthly usage/spend limit (e.g. $5)** as a hard backstop.
Even if every other defense were bypassed, this caps the absolute worst-case
bill. Treat it as required, not optional.

---

## Tunable limits (and defaults)

| Setting | Where | Default | Purpose |
| --- | --- | --- | --- |
| `MODEL` | `ai-proxy.js` | `claude-haiku-4-5` | Cheapest current model |
| `MAX_TOKENS` | `ai-proxy.js` | `300` | Max output tokens per reply |
| `MAX_MESSAGES` | `ai-proxy.js` | `12` | Max messages per request (else 400) |
| `MAX_CONTENT_CHARS` | `ai-proxy.js` | `1500` | Max chars per message (else 400) |
| `MAX_DAILY_REQUESTS` | `wrangler.toml [vars]` (env) | `300` | Global upstream calls/UTC day |
| Rate limit | `wrangler.toml` ratelimit binding | `5 / 60s` per IP | Per-IP throttle (else 429) |
| Anthropic spend cap | Anthropic Console | `$5/mo` (you set it) | Hard billing backstop |

---

## Notes

- **The key stays server-side.** It lives only in the Worker's secret store and
  is never sent to the browser or committed to the repo.
- **Free-tier limits.** Cloudflare Workers' free plan allows 100,000 requests
  per day; KV and the Rate Limiting binding are included on the free plan.
  Anthropic API usage is billed separately per your Anthropic account.
- **Daily cap is a soft cap.** KV is eventually consistent and has no atomic
  increment, so the global counter is a budget backstop, not a transactional
  limit — a small overshoot near the boundary is possible and harmless.
