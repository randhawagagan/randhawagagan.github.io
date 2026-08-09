/**
 * ai-proxy.js — Cloudflare Worker: "Ask my portfolio" API proxy (hardened)
 * ------------------------------------------------------------------------
 * Sits between the static portfolio site (GitHub Pages) and the Anthropic
 * Messages API. The site never sees the API key — it only ever talks to this
 * Worker, and the Worker talks to Anthropic.
 *
 * This chat is PUBLIC, so the Worker is hardened to be cost-safe. Abuse should
 * never produce a meaningful bill. Defenses, in order:
 *
 *   1. Origin allowlist  — only the portfolio origins (+ localhost) may call.
 *   2. Per-IP rate limit  — Cloudflare native Rate Limiting binding.
 *   3. Global daily cap    — a KV counter caps total upstream calls per day.
 *   4. Input caps          — small max_tokens + message size/count limits.
 *   5. Cheapest model       — Claude Haiku 4.5.
 *
 * Front-end contract (unchanged):
 *   • Success → HTTP 200, streaming body of raw text tokens (text/plain).
 *   • Error   → non-2xx JSON { "error": string }.
 *   • Daily cap hit → HTTP 200 with a friendly streamed text message (see the
 *     DAILY-CAP UX note below). Chosen so the visitor sees a graceful reply in
 *     the chat rather than an error bubble, and NO Anthropic call is made.
 *
 * Bindings / config (see README.md):
 *   • ANTHROPIC_API_KEY (secret, required) — never hardcode.
 *   • RATE_LIMITER      (ratelimit binding) — per-IP limiter.
 *   • DEMO_KV           (KV namespace)      — global daily counter.
 *   • MAX_DAILY_REQUESTS (var, optional)    — default 300.
 *
 * Bindings 2 and 3 are optional at runtime: if unbound (e.g. first local run),
 * that specific defense is skipped rather than crashing.
 */

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

// Cheapest current model. Confirmed via the claude-api skill: the alias
// `claude-haiku-4-5` (pinned: claude-haiku-4-5-20251001) uses the same Messages
// API and the same streaming SSE shape (content_block_delta / text_delta).
const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const MAX_TOKENS = 300; // small cap keeps per-call cost tiny
const MAX_MESSAGES = 12; // conversation length cap
const MAX_CONTENT_CHARS = 1500; // per-message length cap
const DEFAULT_MAX_DAILY = 300; // global upstream calls/day if env var unset
const KV_TTL_SECONDS = 172800; // 2 days — old daily keys expire on their own

// Origins allowed to use this proxy. Localhost/127.0.0.1 on any port are
// matched by the regex below (for local testing).
const ALLOWED_ORIGINS = new Set([
  "https://gaganrandhawa.me",
  "https://www.gaganrandhawa.me",
]);
const LOCALHOST_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// System prompt describing Gagan. The model must not invent facts beyond this.
const SYSTEM_PROMPT = `You are the AI assistant embedded in Gagan Randhawa's personal portfolio website. You answer questions from recruiters, hiring managers, and peers about Gagan.

About Gagan Randhawa:
- Senior Frontend Engineer / Frontend Architect with 12+ years of experience.
- Currently a Team Lead at Adda Tech in Laval, leading a software engineering team while remaining hands-on. Promoted to Team Lead in December 2025 after serving as Senior Software Engineer.
- Ex-SAP Labs, where he worked on enterprise-grade UI at scale.
- Built aerospace software at Adda Tech (React/TypeScript frontend, C# backend).
- Core stack: React, Angular, TypeScript, with C# on the backend.
- Now building AI-powered products, integrating LLMs into real shipping experiences.
- Key strengths: web performance engineering, design systems, and technical leadership / mentoring.
- Contact: randhawa_gagan@outlook.com.

Guidelines:
- Answer as a helpful, professional assistant representing Gagan's portfolio.
- Reply in French when the requested locale is French; otherwise reply in the language used by the visitor.
- Be concise and specific — a few sentences is usually right.
- Never invent facts, projects, employers, or credentials beyond what is listed above. If asked something you don't know, say so and suggest emailing Gagan.
- Speak positively but honestly. Do not fabricate metrics or claims.`;

// Shown (streamed) when the global daily cap is hit — see DAILY-CAP UX note.
const DAILY_CAP_MESSAGE =
  "The live demo has hit today's limit — but here's the short version: " +
  "Gagan Randhawa is a Team Lead and Frontend Architect with " +
  "12+ years of experience (ex-SAP Labs, aerospace at Adda Tech). He works in " +
  "React, Angular, and TypeScript, and is strongest in performance, design " +
  "systems, and technical leadership. Reach him at randhawa_gagan@outlook.com, " +
  "or come back tomorrow to chat live.";

const DAILY_CAP_MESSAGE_FR =
  "La démo en direct a atteint sa limite quotidienne. En bref, Gagan Randhawa " +
  "est chef d'équipe et architecte frontend avec plus de 12 ans " +
  "d'expérience, notamment chez SAP Labs et dans l'aérospatiale chez Adda Tech. " +
  "Il travaille avec React, Angular et TypeScript et se distingue en performance, " +
  "systèmes de design et leadership technique. Écrivez-lui à " +
  "randhawa_gagan@outlook.com ou revenez demain pour clavarder en direct.";

/* ------------------------------------------------------------------ *
 * Origin / CORS helpers
 * ------------------------------------------------------------------ */

/** Extract the origin from the request (Origin header, Referer fallback). */
function getRequestOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin) return origin;
  // Fallback: derive origin from Referer (e.g. same-origin navigations).
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore malformed referer */
    }
  }
  return null;
}

/** Is this origin allowed to use the proxy? */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin) || LOCALHOST_RE.test(origin);
}

/**
 * CORS headers. We NEVER send `*` now — we echo only the specific allowed
 * origin. Callers must have already passed isAllowedOrigin().
 */
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

/* ------------------------------------------------------------------ *
 * Input validation
 * ------------------------------------------------------------------ */
function validate(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("`messages` must be a non-empty array.");
  }
  if (messages.length > MAX_MESSAGES) {
    throw new Error(`Too many messages (max ${MAX_MESSAGES}).`);
  }
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) {
      throw new Error("Each message needs role 'user' or 'assistant'.");
    }
    if (typeof m.content !== "string" || m.content.length === 0) {
      throw new Error("Each message needs non-empty string content.");
    }
    if (m.content.length > MAX_CONTENT_CHARS) {
      throw new Error(`Message too long (max ${MAX_CONTENT_CHARS} chars).`);
    }
    clean.push({ role: m.role, content: m.content });
  }
  return clean;
}

/* ------------------------------------------------------------------ *
 * Streaming helpers
 * ------------------------------------------------------------------ */

/** Stream a fixed string back as plain text (used for the daily-cap reply). */
function textResponse(text, origin) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

/**
 * Anthropic SSE -> plain text.
 *
 * Anthropic streams Server-Sent Events. The text we care about lives in
 * `content_block_delta` events whose delta type is `text_delta`:
 *
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","index":0,
 *          "delta":{"type":"text_delta","text":"Hello"}}
 *
 * We parse those server-side and enqueue just `delta.text`, so the browser
 * receives raw text tokens with no protocol to decode.
 */
function textStreamFromAnthropic(upstreamBody) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = upstreamBody.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            emit(rawEvent, controller, encoder);
          }
        }
        if (buffer.trim()) emit(buffer, controller, encoder);
      } catch {
        controller.enqueue(encoder.encode("\n\n[stream interrupted]"));
      } finally {
        controller.close();
      }
    },
  });
}

/** Parse one SSE event block and enqueue its text delta, if any. */
function emit(rawEvent, controller, encoder) {
  let dataStr = "";
  for (const line of rawEvent.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("data:")) {
      dataStr += trimmed.slice(5).trim();
    }
  }
  if (!dataStr || dataStr === "[DONE]") return;

  let parsed;
  try {
    parsed = JSON.parse(dataStr);
  } catch {
    return;
  }

  if (
    parsed.type === "content_block_delta" &&
    parsed.delta &&
    parsed.delta.type === "text_delta" &&
    typeof parsed.delta.text === "string"
  ) {
    controller.enqueue(encoder.encode(parsed.delta.text));
  }
}

/* ------------------------------------------------------------------ *
 * Cost-safety helpers
 * ------------------------------------------------------------------ */

/** UTC date key, e.g. "demo:2026-07-29". */
function dailyKey() {
  return "demo:" + new Date().toISOString().slice(0, 10);
}

/**
 * Check-and-increment the global daily counter in KV.
 * Returns true if the request is WITHIN budget (and was counted), false if the
 * cap is already reached. If KV is not bound, always returns true (skip).
 *
 * Note: KV has no atomic increment and is eventually consistent, so this is a
 * soft cap — good enough as a budget backstop, not a hard transactional limit.
 */
async function withinDailyBudget(env) {
  if (!env.DEMO_KV) return true; // binding absent → skip this defense
  const max = parseInt(env.MAX_DAILY_REQUESTS, 10) || DEFAULT_MAX_DAILY;
  const key = dailyKey();
  const current = parseInt((await env.DEMO_KV.get(key)) || "0", 10);
  if (current >= max) return false;
  await env.DEMO_KV.put(key, String(current + 1), {
    expirationTtl: KV_TTL_SECONDS,
  });
  return true;
}

/**
 * Per-IP rate limit via Cloudflare's native Rate Limiting binding.
 * Returns true if allowed. If the binding is absent, returns true (skip).
 */
async function withinRateLimit(env, request) {
  if (!env.RATE_LIMITER) return true; // binding absent → skip this defense
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const { success } = await env.RATE_LIMITER.limit({ key: ip });
  return success;
}

/* ------------------------------------------------------------------ *
 * Worker entry point
 * ------------------------------------------------------------------ */
export default {
  async fetch(request, env) {
    const origin = getRequestOrigin(request);
    const allowed = isAllowedOrigin(origin);

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // --- Origin allowlist (403 for everyone else) ---
    if (!allowed) {
      // No CORS headers on a rejected origin — nothing to echo.
      return new Response(JSON.stringify({ error: "Forbidden origin." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return jsonError("Method not allowed. Use POST.", 405, origin);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return jsonError("Server is not configured.", 500, origin);
    }

    // --- Per-IP rate limit ---
    if (!(await withinRateLimit(env, request))) {
      return jsonError(
        "You've reached the demo's rate limit — give it a minute and try again.",
        429,
        origin
      );
    }

    // --- Parse & validate input ---
    let cleanMessages;
    let locale = "en";
    try {
      const body = await request.json();
      cleanMessages = validate(body);
      locale = body.locale === "fr" ? "fr" : "en";
    } catch (err) {
      return jsonError(err.message || "Invalid request.", 400, origin);
    }

    /*
     * DAILY-CAP UX: when the global budget is exhausted we do NOT call
     * Anthropic. Instead we return HTTP 200 and stream a friendly canned
     * message, so the visitor sees a graceful reply inside the chat (the
     * front-end treats any 200 stream as a normal assistant turn). This is a
     * nicer experience than a red error bubble, and it guarantees zero spend
     * once the cap is hit.
     */
    if (!(await withinDailyBudget(env))) {
      return textResponse(locale === "fr" ? DAILY_CAP_MESSAGE_FR : DAILY_CAP_MESSAGE, origin);
    }

    // --- Call Anthropic (Haiku 4.5) with streaming enabled ---
    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          stream: true,
          system: `${SYSTEM_PROMPT}\n\nThe visitor's selected locale is ${locale === "fr" ? "French" : "English"}. Reply in that language.`,
          messages: cleanMessages,
        }),
      });
    } catch {
      return jsonError("Failed to reach the model provider.", 502, origin);
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("Anthropic error", upstream.status, detail);
      return jsonError("The model provider returned an error.", 502, origin);
    }

    // --- Stream plain-text tokens back to the browser ---
    return new Response(textStreamFromAnthropic(upstream.body), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        ...corsHeaders(origin),
      },
    });
  },
};
