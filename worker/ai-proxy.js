/**
 * ai-proxy.js — Cloudflare Worker: "Ask my portfolio" API proxy
 * -------------------------------------------------------------
 * Sits between the static portfolio site (GitHub Pages) and the Anthropic
 * Messages API. The site never sees the API key — it only ever talks to this
 * Worker. The Worker:
 *
 *   1. Accepts `POST { messages: [{ role, content }, ...] }`.
 *   2. Validates the input.
 *   3. Calls the Anthropic Messages API with streaming enabled.
 *   4. Parses Anthropic's SSE stream server-side and forwards ONLY the plain
 *      text deltas back to the browser, so the front-end can append tokens
 *      directly (no client-side SSE parsing required).
 *
 * Secrets / config (set via `wrangler secret put` / `[vars]` — see README):
 *   • ANTHROPIC_API_KEY  (secret, required)  — never hardcode.
 *   • ALLOWED_ORIGIN     (var, optional)     — e.g. "https://gagan.dev".
 *                                              Defaults to "*".
 *
 * @see README.md for deploy instructions.
 */

// A valid current Anthropic model id.
const MODEL = "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 512;
const MAX_MESSAGES = 40; // basic abuse guard on conversation length
const MAX_CONTENT_CHARS = 8000; // per-message length cap

// System prompt describing Gagan. The model must not invent facts beyond this.
const SYSTEM_PROMPT = `You are the AI assistant embedded in Gagan Randhawa's personal portfolio website. You answer questions from recruiters, hiring managers, and peers about Gagan.

About Gagan Randhawa:
- Senior Frontend Engineer / Frontend Architect with 11+ years of experience.
- Ex-SAP Labs, where he worked on enterprise-grade UI at scale.
- Built aerospace software at Adda Tech (React/TypeScript frontend, C# backend).
- Core stack: React, Angular, TypeScript, with C# on the backend.
- Now building AI-powered products, integrating LLMs into real shipping experiences.
- Key strengths: web performance engineering, design systems, and technical leadership / mentoring.
- Contact: randhawa_gagan@live.com.

Guidelines:
- Answer as a helpful, professional assistant representing Gagan's portfolio.
- Be concise and specific — a few sentences is usually right.
- Never invent facts, projects, employers, or credentials beyond what is listed above. If asked something you don't know, say so and suggest emailing Gagan.
- Speak positively but honestly. Do not fabricate metrics or claims.`;

/* ------------------------------------------------------------------ *
 * CORS helpers
 * ------------------------------------------------------------------ */
function corsHeaders(env) {
  const origin = (env && env.ALLOWED_ORIGIN) || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonError(message, status, env) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

/* ------------------------------------------------------------------ *
 * Input validation. Returns { messages } or throws an Error whose
 * message is safe to surface to the client.
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
    throw new Error("Conversation is too long.");
  }
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) {
      throw new Error("Each message needs role 'user' or 'assistant'.");
    }
    if (typeof m.content !== "string" || m.content.length === 0) {
      throw new Error("Each message needs non-empty string content.");
    }
    clean.push({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) });
  }
  return clean;
}

/* ------------------------------------------------------------------ *
 * Anthropic SSE -> plain text.
 *
 * Anthropic streams Server-Sent Events. The text we care about lives in
 * `content_block_delta` events whose delta type is `text_delta`:
 *
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","index":0,
 *          "delta":{"type":"text_delta","text":"Hello"}}
 *
 * We parse those server-side and enqueue just `delta.text`. The browser then
 * receives a stream of raw text tokens with no protocol to decode.
 * ------------------------------------------------------------------ */
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

          // SSE events are separated by a blank line.
          let sep;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            emit(rawEvent, controller, encoder);
          }
        }
        // Flush any trailing event.
        if (buffer.trim()) emit(buffer, controller, encoder);
      } catch (err) {
        // Surface a short note in-stream so the reader isn't left hanging.
        controller.enqueue(
          encoder.encode("\n\n[stream interrupted]")
        );
      } finally {
        controller.close();
      }
    },
  });
}

/** Parse one SSE event block and enqueue its text delta, if any. */
function emit(rawEvent, controller, encoder) {
  // A block may contain multiple `data:` lines; concatenate them.
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
    return; // ignore keep-alives / malformed fragments
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
 * Worker entry point
 * ------------------------------------------------------------------ */
export default {
  async fetch(request, env) {
    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (request.method !== "POST") {
      return jsonError("Method not allowed. Use POST.", 405, env);
    }

    if (!env.ANTHROPIC_API_KEY) {
      // Misconfiguration — do not leak details.
      return jsonError("Server is not configured.", 500, env);
    }

    // --- Parse & validate input ---
    let cleanMessages;
    try {
      const body = await request.json();
      cleanMessages = validate(body);
    } catch (err) {
      return jsonError(err.message || "Invalid request.", 400, env);
    }

    /*
     * Rate limiting note:
     * This proxy is public, so consider adding rate limiting before going to
     * production. Options: Cloudflare's built-in Rate Limiting Rules (no code),
     * or a Durable Object / KV counter keyed on `request.headers.get("CF-Connecting-IP")`.
     * Left out here to keep the Worker dependency-free.
     */

    // --- Call Anthropic with streaming enabled ---
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
          system: SYSTEM_PROMPT,
          messages: cleanMessages,
        }),
      });
    } catch {
      return jsonError("Failed to reach the model provider.", 502, env);
    }

    if (!upstream.ok || !upstream.body) {
      // Forward a sanitized status; log the detail server-side only.
      const detail = await upstream.text().catch(() => "");
      console.error("Anthropic error", upstream.status, detail);
      return jsonError("The model provider returned an error.", 502, env);
    }

    // --- Stream plain-text tokens back to the browser ---
    return new Response(textStreamFromAnthropic(upstream.body), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        ...corsHeaders(env),
      },
    });
  },
};
