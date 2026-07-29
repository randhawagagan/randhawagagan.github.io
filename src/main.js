/* =========================================================================
   main.js — integration glue
   Wires the Three.js hero and the AI chat widget into the page, plus
   theme toggle, scroll reveals, and small niceties. Each dynamic import is
   isolated so a failure in one module never takes down the page.
   ========================================================================= */

// Set this to your deployed Cloudflare Worker URL to enable live AI.
// Leave empty ("") to run the on-page chat in scripted-fallback mode.
const AI_ENDPOINT = "";

// Holds the Three.js hero API once it's initialized, so the theme toggle
// can recolor the hero live.
let heroApi = null;

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
    if (heroApi && heroApi.setTheme) heroApi.setTheme(next);
  });
})();

/* ---- Count-up for metric numbers ---- */
const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function countUp(el) {
  const target = parseFloat(el.getAttribute("data-count"));
  const suffix = el.getAttribute("data-suffix") || "";
  if (Number.isNaN(target)) return;
  if (REDUCE) { el.textContent = target + suffix; return; }
  const duration = 1100;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = Math.round(target * eased) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---- Reveal on scroll (with stagger) + count-up trigger ---- */
(function reveal() {
  const els = Array.from(document.querySelectorAll(".reveal"));

  // Stagger siblings: delay each reveal by its index among reveal-siblings.
  if (!REDUCE) {
    const byParent = new Map();
    els.forEach((el) => {
      const p = el.parentElement;
      const group = byParent.get(p) || [];
      group.push(el);
      byParent.set(p, group);
    });
    byParent.forEach((group) => {
      if (group.length < 2) return;
      group.forEach((el, i) => { el.style.transitionDelay = Math.min(i * 0.09, 0.45) + "s"; });
    });
  }

  const fire = (el) => {
    el.classList.add("in");
    el.querySelectorAll("[data-count]").forEach(countUp);
  };

  if (REDUCE || !("IntersectionObserver" in window)) {
    els.forEach(fire);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          fire(en.target);
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
    heroApi = initHero(canvas, { wrap });
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

/* ---- Hero scroll reactivity (wow-on-scroll) ---- */
(function heroScroll() {
  if (REDUCE) return;
  const hero = document.getElementById("top");
  if (!hero) return;
  let ticking = false;
  function update() {
    ticking = false;
    if (!heroApi || !heroApi.setScrollProgress) return;
    const h = hero.offsetHeight || window.innerHeight;
    const p = Math.min(1, Math.max(0, window.scrollY / h));
    heroApi.setScrollProgress(p);
  }
  window.addEventListener(
    "scroll",
    () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } },
    { passive: true }
  );
})();
