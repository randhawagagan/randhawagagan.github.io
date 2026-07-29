/* =========================================================================
   main.js — integration glue
   Wires the Three.js hero and the AI chat widget into the page, plus
   theme toggle, scroll reveals, and small niceties. Each dynamic import is
   isolated so a failure in one module never takes down the page.
   ========================================================================= */

// Set this to your deployed Cloudflare Worker URL to enable live AI.
// Leave empty ("") to run the on-page chat in scripted-fallback mode.
const AI_ENDPOINT = "";

/* ---- Theme toggle (persisted) ---- */
(function theme() {
  const root = document.documentElement;
  const saved = localStorage.getItem("gr-theme");
  if (saved) root.setAttribute("data-theme", saved);
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = root.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("gr-theme", next);
  });
})();

/* ---- Reveal on scroll ---- */
(function reveal() {
  const els = document.querySelectorAll(".reveal");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  els.forEach((el) => io.observe(el));
})();

/* ---- Footer year ---- */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ---- Three.js hero (isolated) ---- */
(async function hero() {
  const canvas = document.getElementById("hero-canvas");
  const wrap = document.getElementById("hero-canvas-wrap");
  if (!canvas) return;
  try {
    const { initHero } = await import("./hero.js");
    initHero(canvas, { wrap });
  } catch (err) {
    console.warn("[hero] falling back to static background:", err);
    if (wrap) wrap.classList.add("no-webgl");
  }
})();

/* ---- AI chat widget (isolated) ---- */
(async function ai() {
  const mount = document.getElementById("ai-mount");
  if (!mount) return;
  try {
    const { initAiChat } = await import("./ai-chat.js");
    initAiChat(mount, { endpoint: AI_ENDPOINT });
  } catch (err) {
    console.warn("[ai-chat] widget unavailable:", err);
    mount.innerHTML =
      '<p style="font-family:var(--font-mono);font-size:13px;color:var(--muted)">Chat is warming up — reach me at randhawa_gagan@outlook.com in the meantime.</p>';
  }
})();
