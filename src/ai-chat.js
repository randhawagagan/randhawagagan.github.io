/**
 * ai-chat.js — "Ask my portfolio" chat widget
 * -------------------------------------------------
 * A compact, product-grade chat UI that answers questions about Gagan Randhawa.
 *
 * Usage:
 *   import { initAiChat } from "./src/ai-chat.js";
 *   const chat = initAiChat(document.querySelector("#ai-chat"), {
 *     endpoint: "https://your-worker.example.workers.dev", // optional
 *   });
 *   // later: chat.destroy();
 *
 * Two modes:
 *   • LIVE     — when `opts.endpoint` is set. POSTs the conversation to the
 *                Cloudflare Worker and streams the plain-text token response.
 *   • FALLBACK — when `opts.endpoint` is falsy. Answers from a small set of
 *                canned responses, revealed word-by-word so the experience is
 *                indistinguishable from the live path. This keeps the site
 *                fully functional before the Worker is deployed.
 *
 * The widget is self-contained: it injects its own scoped <style> block that
 * inherits the site's theme via CSS custom properties (--bg, --surface, …).
 *
 * @module ai-chat
 */

/* ------------------------------------------------------------------ *
 * Canned knowledge for FALLBACK mode.
 * Keyword-matched, first hit wins. Keep answers genuinely useful.
 * ------------------------------------------------------------------ */
const FALLBACK_INTRO =
  "Hi! I'm Gagan's portfolio assistant. Ask me about his skills, the SAP " +
  "and aerospace work, or whether he's a fit for a Lead Frontend role.";

const FALLBACK_ANSWERS_EN = [
  {
    keywords: ["strongest", "strength", "best at", "good at", "skill"],
    text:
      "Gagan's strongest edge is turning messy, large-scale frontends into " +
      "fast, maintainable systems. Over 11+ years he's specialised in " +
      "performance engineering (shaving seconds off enterprise React/Angular " +
      "apps), design systems that scale across teams, and the technical " +
      "leadership to land them — mentoring engineers and setting the " +
      "architecture, not just writing components.",
  },
  {
    keywords: ["sap", "labs"],
    text:
      "At SAP Labs, Gagan worked on enterprise-grade UI at serious scale — " +
      "the kind of product where a single dropdown ships to thousands of " +
      "business users. He focused on building reusable component libraries, " +
      "enforcing accessibility and performance budgets, and keeping a large " +
      "TypeScript/Angular codebase healthy as the team grew.",
  },
  {
    keywords: ["aerospace", "adda", "c#", "csharp"],
    text:
      "At Adda Tech he worked on aerospace software, pairing a React/" +
      "TypeScript frontend with a C# backend. Aerospace means high " +
      "correctness bars and dense, data-heavy interfaces — good training for " +
      "building UIs that stay clear and reliable under real complexity.",
  },
  {
    keywords: ["lead", "leadership", "manager", "principal", "architect", "fit"],
    text:
      "Yes — Gagan is a strong fit for a Lead Frontend / Frontend Architect " +
      "role. He already operates at that altitude: owning architecture, " +
      "standing up design systems, driving performance initiatives, and " +
      "mentoring engineers. He pairs deep hands-on React/Angular/TypeScript " +
      "skill with the judgment to make cross-team technical decisions.",
  },
  {
    keywords: ["ai", "llm", "gpt", "product", "now", "currently", "building"],
    text:
      "Right now Gagan is building AI-powered products — integrating LLMs " +
      "into real, shipping user experiences (this chat widget is one such " +
      "example). He's focused on the pragmatic side: streaming UX, graceful " +
      "fallbacks, and keeping API keys safely server-side behind a proxy.",
  },
  {
    keywords: ["react", "angular", "typescript", "tech", "stack", "language"],
    text:
      "Gagan's core stack is React, Angular, and TypeScript on the frontend, " +
      "with C# experience on the backend. He's comfortable across the modern " +
      "frontend toolchain and leans on strong typing and design systems to " +
      "keep large apps maintainable.",
  },
  {
    keywords: ["experience", "years", "background", "who", "about"],
    text:
      "Gagan Randhawa is a Senior Frontend Engineer / Frontend Architect with " +
      "11+ years of experience. He's ex-SAP Labs, has shipped aerospace " +
      "software at Adda Tech, works primarily in React, Angular, and " +
      "TypeScript, and is now building AI-powered products. His strengths are " +
      "performance, design systems, and technical leadership.",
  },
  {
    keywords: ["contact", "email", "reach", "hire", "available"],
    text:
      "You can reach Gagan at randhawa_gagan@outlook.com. He's open to senior and " +
      "lead frontend conversations, especially where performance, design " +
      "systems, or AI-in-product work is involved.",
  },
];

const FALLBACK_DEFAULT =
  "Great question! I can speak to Gagan's strengths (performance, design " +
  "systems, leadership), his time at SAP Labs and in aerospace at Adda Tech, " +
  "his React/Angular/TypeScript stack, or whether he'd fit a Lead Frontend " +
  "role. Which would you like to hear about?";

const FALLBACK_ANSWERS_FR = [
  {
    keywords: ["force", "fort", "compétence", "competence", "meilleur"],
    text: "La grande force de Gagan est de transformer des frontends complexes à grande échelle en systèmes rapides et maintenables. Il combine performance web, systèmes de design et leadership technique, tout en restant très proche du code.",
  },
  {
    keywords: ["sap", "labs"],
    text: "Chez SAP Labs, Gagan a travaillé sur des interfaces d'entreprise à grande échelle. Il s'est concentré sur les bibliothèques de composants réutilisables, l'accessibilité, la performance et la santé d'une importante base de code TypeScript et Angular.",
  },
  {
    keywords: ["aérospatiale", "aerospatiale", "adda", "c#", "csharp"],
    text: "Chez Adda Tech, Gagan a travaillé sur un logiciel aérospatial avec un frontend React et TypeScript et un backend C#. Ce domaine exige des interfaces fiables, précises et capables de rendre des données complexes faciles à comprendre.",
  },
  {
    keywords: ["lead", "responsable", "architecte", "poste", "adéquation", "adequation"],
    text: "Oui. Gagan correspond bien à un poste de Lead Frontend ou d'Architecte Frontend : il prend en charge l'architecture, les systèmes de design et la performance, tout en accompagnant les ingénieurs et en restant opérationnel sur React, Angular et TypeScript.",
  },
  {
    keywords: ["ia", "llm", "gpt", "produit", "actuellement", "construit"],
    text: "Gagan développe actuellement des produits propulsés par l'IA et intègre des LLM dans de vraies expériences utilisateur. Il s'intéresse notamment au streaming, aux solutions de repli fiables et à la protection des clés API côté serveur.",
  },
  {
    keywords: ["react", "angular", "typescript", "technologie", "stack", "langage"],
    text: "La stack principale de Gagan comprend React, Angular et TypeScript côté frontend, avec une expérience en C# côté backend. Il privilégie le typage fort, la performance et les systèmes de design pour garder les grandes applications maintenables.",
  },
  {
    keywords: ["expérience", "experience", "parcours", "qui", "profil"],
    text: "Gagan Randhawa est ingénieur frontend senior et architecte frontend avec plus de 11 ans d'expérience. Ancien de SAP Labs, il développe aujourd'hui des logiciels aérospatiaux chez Adda Tech et construit des produits propulsés par l'IA.",
  },
  {
    keywords: ["contact", "courriel", "email", "joindre", "embaucher", "disponible"],
    text: "Vous pouvez joindre Gagan à randhawa_gagan@outlook.com. Il est ouvert aux échanges concernant des postes senior ou lead frontend, particulièrement autour de la performance, des systèmes de design et de l'IA appliquée aux produits.",
  },
];

const FALLBACK_DEFAULT_FR =
  "Bonne question ! Je peux vous parler des forces de Gagan — performance, systèmes de design et leadership — de son expérience chez SAP Labs et dans l'aérospatiale, de sa stack React, Angular et TypeScript, ou de son adéquation à un poste de Lead Frontend.";

/** Suggested-question chips shown above the input. */
const SUGGESTIONS = [
  "What's Gagan's strongest skill?",
  "Tell me about the SAP work",
  "Is he a fit for a Lead Frontend role?",
];

/* ------------------------------------------------------------------ *
 * Localized widget UI strings (EN/FR). The selected locale is also sent to
 * the Worker so live answers and graceful fallback states use the same language.
 * ------------------------------------------------------------------ */
const UI_STRINGS = {
  en: {
    title: "Ask my portfolio",
    live: "live",
    demo: "demo",
    srLabel: "Ask a question about Gagan",
    placeholder: "Ask about Gagan's skills, SAP work, fit for a role…",
    send: "Send",
    greeting: FALLBACK_INTRO,
    chips: SUGGESTIONS,
  },
  fr: {
    title: "Interroger mon portfolio",
    live: "en direct",
    demo: "démo",
    srLabel: "Posez une question sur Gagan",
    placeholder: "Posez une question : compétences, travail chez SAP, adéquation à un poste…",
    send: "Envoyer",
    greeting:
      "Bonjour ! Je suis l'assistant du portfolio de Gagan. Posez-moi des questions sur ses compétences, son travail chez SAP et dans l'aérospatiale, ou son adéquation à un poste de responsable frontend.",
    chips: [
      "Quelle est la plus grande force de Gagan ?",
      "Parlez-moi du travail chez SAP",
      "Est-il fait pour un poste de responsable frontend ?",
    ],
  },
};

/** Read the current widget language from storage (default "en"). */
function readLang() {
  try {
    const l = localStorage.getItem("gr-lang");
    if (l === "fr" || l === "en") return l;
  } catch (_) {
    /* ignore */
  }
  return "en";
}

/** Pick a canned answer by keyword match. */
function matchFallback(question, lang = "en") {
  const q = question.toLowerCase();
  const answers = lang === "fr" ? FALLBACK_ANSWERS_FR : FALLBACK_ANSWERS_EN;
  for (const entry of answers) {
    if (entry.keywords.some((k) => q.includes(k))) return entry.text;
  }
  return lang === "fr" ? FALLBACK_DEFAULT_FR : FALLBACK_DEFAULT;
}

/* ------------------------------------------------------------------ *
 * Scoped styles. Everything is namespaced under `.aichat` so it can't
 * leak into the host page. Colours come from the site's theme vars,
 * with fallbacks so the widget still looks right in isolation.
 * ------------------------------------------------------------------ */
const STYLE_ID = "aichat-styles";
const CSS = `
.aichat {
  --_bg: var(--surface, #14161c);
  --_bg2: var(--surface-2, #1c1f27);
  --_border: var(--border, #2a2e38);
  --_ink: var(--ink, #eef0f5);
  --_muted: var(--muted, #9aa0ad);
  --_faint: var(--faint, #6b7280);
  --_accent: var(--accent, #5b6cff);
  --_accent2: var(--accent-2, #34e0e8);
  --_warm: var(--warm, #ffb454);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: var(--_bg);
  color: var(--_ink);
  border: 1px solid var(--_border);
  border-radius: 14px;
  overflow: hidden;
  font-family: var(--font-body, 'Montserrat', system-ui, sans-serif);
}
.aichat *, .aichat *::before, .aichat *::after { box-sizing: border-box; }

.aichat__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--_border);
  background: linear-gradient(180deg, var(--_bg2), var(--_bg));
}
.aichat__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--_accent2);
  box-shadow: 0 0 8px var(--_accent2);
  flex: 0 0 auto;
}
.aichat__title {
  font-family: var(--font-display, inherit);
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.2px;
  margin: 0;
}
.aichat__subtitle {
  margin: 0;
  font-size: 11px;
  color: var(--_faint);
  margin-left: auto;
}

.aichat__log {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scroll-behavior: smooth;
}

.aichat__msg {
  max-width: 85%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  animation: aichat-in 0.18s ease-out;
}
.aichat__msg--user {
  align-self: flex-end;
  background: var(--_accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.aichat__msg--bot {
  align-self: flex-start;
  background: var(--_bg2);
  color: var(--_ink);
  border: 1px solid var(--_border);
  border-bottom-left-radius: 4px;
}
.aichat__msg--error {
  border-color: var(--_warm);
  color: var(--_warm);
}

@keyframes aichat-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

/* Typing indicator */
.aichat__typing { display: inline-flex; gap: 4px; align-items: center; }
.aichat__typing span {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--_muted);
  animation: aichat-bounce 1.2s infinite ease-in-out both;
}
.aichat__typing span:nth-child(2) { animation-delay: 0.15s; }
.aichat__typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes aichat-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.aichat__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 14px 10px;
}
.aichat__chip {
  font: inherit;
  font-size: 12px;
  color: var(--_ink);
  background: var(--_bg2);
  border: 1px solid var(--_border);
  border-radius: 999px;
  padding: 6px 11px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, transform 0.08s;
}
.aichat__chip:hover { border-color: var(--_accent); color: var(--_accent2); }
.aichat__chip:active { transform: translateY(1px); }
.aichat__chip:disabled { opacity: 0.5; cursor: default; }

.aichat__form {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--_border);
  background: var(--_bg);
}
.aichat__input {
  flex: 1 1 auto;
  min-width: 0;
  font: inherit;
  font-size: 14px;
  color: var(--_ink);
  background: var(--_bg2);
  border: 1px solid var(--_border);
  border-radius: 10px;
  padding: 10px 12px;
  outline: none;
  transition: border-color 0.15s;
}
.aichat__input:focus { border-color: var(--_accent); }
.aichat__input::placeholder { color: var(--_faint); }
.aichat__input:disabled { opacity: 0.6; }

.aichat__send {
  flex: 0 0 auto;
  font: inherit;
  font-weight: 900;
  font-size: 13px;
  color: #fff;
  background: var(--_accent);
  border: none;
  border-radius: 10px;
  padding: 0 16px;
  cursor: pointer;
  transition: filter 0.15s, transform 0.08s;
}
.aichat__send:hover { filter: brightness(1.1); }
.aichat__send:active { transform: translateY(1px); }
.aichat__send:disabled { opacity: 0.5; cursor: default; filter: none; }

/* Visually-hidden but screen-reader accessible label */
.aichat__sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0);
  white-space: nowrap; border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .aichat__msg { animation: none; }
  .aichat__typing span { animation: none; opacity: 0.7; }
  .aichat__log { scroll-behavior: auto; }
}
`;

/** Inject the shared stylesheet once per document. */
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

const prefersReducedMotion = () =>
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Initialise the chat widget inside `rootEl`.
 *
 * @param {HTMLElement} rootEl - container the widget renders into.
 * @param {{ endpoint?: string }} [opts] - `endpoint` = Worker URL. If falsy,
 *   the widget runs in fallback mode with canned answers.
 * @returns {{ destroy(): void }}
 */
export function initAiChat(rootEl, opts = {}) {
  if (!rootEl) throw new Error("initAiChat: rootEl is required");

  const endpoint = (opts.endpoint || "").trim();
  const isLive = Boolean(endpoint);

  let lang = readLang();
  const t = () => UI_STRINGS[lang] || UI_STRINGS.en;

  ensureStyles();

  /* --- Conversation state (sent verbatim to the Worker each turn) --- */
  const messages = []; // [{ role: "user" | "assistant", content: string }]
  let busy = false; // true while awaiting/streaming a response
  let abortController = null; // aborts an in-flight fetch on destroy

  /* --- Build the DOM --------------------------------------------- */
  const wrap = document.createElement("div");
  wrap.className = "aichat";
  wrap.innerHTML = `
    <div class="aichat__header">
      <span class="aichat__dot" aria-hidden="true"></span>
      <h2 class="aichat__title">${t().title}</h2>
      <p class="aichat__subtitle">${isLive ? t().live : t().demo}</p>
    </div>
    <div class="aichat__log" role="log" aria-live="polite" aria-label="Chat conversation"></div>
    <div class="aichat__chips" role="group" aria-label="Suggested questions"></div>
    <form class="aichat__form">
      <label class="aichat__sr-only" for="aichat-input">${t().srLabel}</label>
      <input
        id="aichat-input"
        class="aichat__input"
        type="text"
        autocomplete="off"
        placeholder="${t().placeholder}"
      />
      <button class="aichat__send" type="submit">${t().send}</button>
    </form>
  `;
  rootEl.appendChild(wrap);

  const logEl = wrap.querySelector(".aichat__log");
  const chipsEl = wrap.querySelector(".aichat__chips");
  const formEl = wrap.querySelector(".aichat__form");
  const inputEl = wrap.querySelector(".aichat__input");
  const sendEl = wrap.querySelector(".aichat__send");
  const titleEl = wrap.querySelector(".aichat__title");
  const srLabelEl = wrap.querySelector(".aichat__sr-only");

  /* --- Suggestion chips ------------------------------------------ */
  // The chip's own (localized) text is used as the question on click, so
  // re-labelling chips on a language switch keeps them fully functional.
  const chipButtons = t().chips.map((q) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "aichat__chip";
    chip.textContent = q;
    chip.addEventListener("click", () => {
      if (busy) return;
      inputEl.value = chip.textContent;
      submit();
    });
    chipsEl.appendChild(chip);
    return chip;
  });

  /* --- Rendering helpers ----------------------------------------- */
  function scrollToBottom() {
    logEl.scrollTop = logEl.scrollHeight;
  }

  /** Append a message bubble; returns the element for later mutation. */
  function addBubble(role, text, extraClass = "") {
    const el = document.createElement("div");
    el.className =
      "aichat__msg aichat__msg--" + role + (extraClass ? " " + extraClass : "");
    el.textContent = text;
    logEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  /** Show an animated typing indicator; returns its bubble element. */
  function addTyping() {
    const el = document.createElement("div");
    el.className = "aichat__msg aichat__msg--bot";
    el.innerHTML =
      '<span class="aichat__typing" aria-label="Assistant is typing">' +
      "<span></span><span></span><span></span></span>";
    logEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  /** Toggle the disabled state of all interactive controls. */
  function setBusy(next) {
    busy = next;
    inputEl.disabled = next;
    sendEl.disabled = next;
    chipButtons.forEach((c) => (c.disabled = next));
    if (!next) inputEl.focus();
  }

  /* --- Response paths -------------------------------------------- */

  /**
   * LIVE mode: POST the conversation and stream the plain-text reply.
   * The Worker returns a readable stream of raw text tokens.
   */
  async function streamFromWorker(botEl) {
    abortController = new AbortController();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, locale: lang }),
      signal: abortController.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error("Worker responded with status " + res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";

    // First token replaces the typing indicator.
    botEl.textContent = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      botEl.textContent = full;
      scrollToBottom();
    }
    full += decoder.decode(); // flush
    botEl.textContent = full;
    return full;
  }

  /**
   * FALLBACK mode: reveal a canned answer word-by-word so it feels identical
   * to the streamed live path. Reduced-motion users get the full text at once.
   */
  function streamFallback(botEl, question) {
    return new Promise((resolve) => {
      const answer = matchFallback(question, lang);

      if (prefersReducedMotion()) {
        botEl.textContent = answer;
        scrollToBottom();
        resolve(answer);
        return;
      }

      const words = answer.split(" ");
      let i = 0;
      botEl.textContent = "";
      const timer = setInterval(() => {
        if (i >= words.length) {
          clearInterval(timer);
          fallbackTimers.delete(timer);
          resolve(answer);
          return;
        }
        botEl.textContent += (i === 0 ? "" : " ") + words[i];
        i++;
        scrollToBottom();
      }, 28);
      fallbackTimers.add(timer);
    });
  }
  const fallbackTimers = new Set(); // tracked so destroy() can clear them

  /* --- Submit flow ----------------------------------------------- */
  async function submit() {
    const question = inputEl.value.trim();
    if (!question || busy) return;

    inputEl.value = "";
    addBubble("user", question);
    messages.push({ role: "user", content: question });

    setBusy(true);
    const typingEl = addTyping();

    try {
      // Reuse the typing bubble as the answer bubble once text arrives.
      const botEl = typingEl;
      let answer;
      if (isLive) {
        answer = await streamFromWorker(botEl);
      } else {
        answer = await streamFallback(botEl, question);
      }
      messages.push({ role: "assistant", content: answer });
    } catch (err) {
      // Aborted by destroy() — nothing to report.
      if (err && err.name === "AbortError") return;
      typingEl.classList.add("aichat__msg--error");
      typingEl.textContent = lang === "fr"
        ? "Désolé, l'assistant est momentanément inaccessible. Réessayez dans un instant ou écrivez à randhawa_gagan@outlook.com."
        : "Sorry — I couldn't reach the assistant just now. Please try again in " +
          "a moment, or email randhawa_gagan@outlook.com.";
      scrollToBottom();
    } finally {
      abortController = null;
      setBusy(false);
    }
  }

  /* --- Events ----------------------------------------------------- */
  function onSubmit(e) {
    e.preventDefault();
    submit();
  }
  formEl.addEventListener("submit", onSubmit);

  // Greet the user so the panel is never empty.
  const greetingEl = addBubble("bot", t().greeting);

  /* --- Public API ------------------------------------------------ */
  return {
    /**
     * Switch the widget's UI language. Re-labels the greeting, chips,
     * placeholder, title and controls. New live and fallback answers follow it.
     * @param {"en"|"fr"} next
     */
    setLang(next) {
      if (next !== "en" && next !== "fr") return;
      lang = next;
      const s = t();
      titleEl.textContent = s.title;
      if (srLabelEl) srLabelEl.textContent = s.srLabel;
      inputEl.placeholder = s.placeholder;
      sendEl.textContent = s.send;
      if (greetingEl) greetingEl.textContent = s.greeting;
      chipButtons.forEach((chip, i) => {
        if (s.chips[i]) chip.textContent = s.chips[i];
      });
    },
    /** Remove listeners, cancel in-flight work, and clear the DOM. */
    destroy() {
      formEl.removeEventListener("submit", onSubmit);
      if (abortController) abortController.abort();
      fallbackTimers.forEach((t) => clearInterval(t));
      fallbackTimers.clear();
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    },
  };
}
