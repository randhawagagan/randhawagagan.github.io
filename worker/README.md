# Ask my portfolio — Cloudflare Worker

This Worker (`ai-proxy.js`) is the server-side proxy for the "Ask my portfolio"
chat feature. It keeps the Anthropic API key **off the client** — the static
site (GitHub Pages) only ever talks to this Worker, and the Worker talks to
Anthropic.

It accepts `POST { messages }`, calls the Anthropic Messages API with streaming
enabled, parses the SSE response server-side, and streams back **plain text
tokens** that the front-end appends directly.

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
- An [Anthropic API key](https://console.anthropic.com/) (`sk-ant-...`).

---

## 1. Configure `wrangler.toml`

Create `wrangler.toml` next to `ai-proxy.js`:

```toml
name = "ask-my-portfolio"
main = "ai-proxy.js"
compatibility_date = "2024-11-01"

# Optional: lock CORS to your site's origin instead of "*".
# Falls back to "*" if unset.
[vars]
ALLOWED_ORIGIN = "https://your-username.github.io"
```

Set `ALLOWED_ORIGIN` to wherever the site is served (your GitHub Pages URL or
custom domain, e.g. `https://gaganrandhawa.dev`). Leave it out during local
testing to allow any origin.

---

## 2. Store the API key as a secret

**Never** put the key in `wrangler.toml` or the source. Store it as an
encrypted secret — the Worker reads it from `env.ANTHROPIC_API_KEY`:

```sh
wrangler secret put ANTHROPIC_API_KEY
# paste your sk-ant-... key when prompted
```

---

## 3. Deploy

```sh
wrangler deploy
```

Wrangler prints the deployed URL, for example:

```
https://ask-my-portfolio.<your-subdomain>.workers.dev
```

That URL is your **endpoint**.

### Test it

```sh
curl -N https://ask-my-portfolio.<your-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is Gagan good at?"}]}'
```

You should see the answer stream back as plain text.

---

## 4. Wire it into the site

Pass the deployed URL as the `endpoint` option to `initAiChat`:

```html
<div id="ai-chat" style="height: 480px; max-width: 420px;"></div>

<script type="module">
  import { initAiChat } from "./src/ai-chat.js";

  initAiChat(document.querySelector("#ai-chat"), {
    endpoint: "https://ask-my-portfolio.<your-subdomain>.workers.dev",
  });
</script>
```

Omit `endpoint` (or pass an empty string) and the widget runs in **fallback
mode** with canned answers — handy before the Worker is deployed.

### Endpoint contract

- **Request:** `POST <endpoint>` with header `Content-Type: application/json`
  and body `{ "messages": [{ "role": "user" | "assistant", "content": "..." }, ...] }`.
- **Response:** HTTP 200 with `Content-Type: text/plain` — a streaming body of
  raw text tokens. The front-end reads `response.body` and appends chunks as
  they arrive.
- **Errors:** JSON `{ "error": "..." }` with an appropriate status (400 for bad
  input, 405 wrong method, 500/502 server/provider issues).
- **CORS:** `OPTIONS` preflight is handled; responses carry the configured
  `ALLOWED_ORIGIN` (or `*`).

---

## Notes

- **The key stays server-side.** It lives only in the Worker's secret store and
  is never sent to the browser or committed to the repo.
- **Free-tier limits.** Cloudflare Workers' free plan allows 100,000 requests
  per day. Anthropic API usage is billed separately per your Anthropic account.
- **Rate limiting.** This proxy is public. For production, add
  [Cloudflare Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
  (no code) or a KV/Durable Object counter keyed on the client IP. See the
  comment in `ai-proxy.js`.
- **Model.** The Worker uses `claude-sonnet-5` with `max_tokens: 512`. Adjust in
  `ai-proxy.js` if desired.
