/* =========================================================================
   main.js — integration glue
   Wires the Three.js hero and the AI chat widget into the page, plus
   theme toggle, scroll reveals, and small niceties. Each dynamic import is
   isolated so a failure in one module never takes down the page.
   ========================================================================= */

// Set this to your deployed Cloudflare Worker URL to enable live AI.
// Leave empty ("") to run the on-page chat in scripted-fallback mode.
const AI_ENDPOINT = "https://ask-my-portfolio.gagzy-randhawa.workers.dev";

import { initLang, applyLang, translations } from "./i18n.js";

// Holds the Three.js hero API once it's initialized, so the theme toggle
// can recolor the hero live.
let heroApi = null;
// Holds the AI chat API so the language toggle can re-render its UI strings.
let chatApi = null;

/* ---- Language (EN ⇄ FR), persisted ---- */
(function language() {
  let lang = initLang();
  applyLang(lang);
  const btn = document.getElementById("lang-toggle");
  if (!btn) return;
  const paint = () => {
    const target = lang === "en" ? "FR" : "EN";
    const label = lang === "en" ? "Passer au français" : "Switch to English";
    const text = btn.querySelector("span");
    if (text) text.textContent = target;
    btn.setAttribute("aria-label", label);
    btn.title = label;
  };
  paint();
  btn.addEventListener("click", () => {
    lang = lang === "en" ? "fr" : "en";
    applyLang(lang);
    paint();
    if (chatApi && chatApi.setLang) chatApi.setLang(lang);
  });
})();

/* ---- Theme toggle (persisted) ---- */
(function theme() {
  const root = document.documentElement;
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const paint = () => {
    const current = root.getAttribute("data-theme") || "dark";
    const nextLabel = current === "dark" ? "Use light theme" : "Use dark theme";
    btn.setAttribute("aria-label", nextLabel);
    btn.setAttribute("aria-pressed", String(current === "dark"));
    btn.title = nextLabel;
  };
  paint();
  btn.addEventListener("click", () => {
    const current = root.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("gr-theme", next);
    paint();
    if (heroApi && heroApi.setTheme) heroApi.setTheme(next);
  });
})();

/* ---- Mobile navigation ---- */
(function mobileNav() {
  const toggle = document.getElementById("menu-toggle");
  const links = document.getElementById("primary-nav");
  if (!toggle || !links) return;
  const close = () => {
    links.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  };
  toggle.addEventListener("click", () => {
    const open = !links.classList.contains("open");
    links.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { close(); toggle.focus(); }
  });
})();

/* ---- Active section navigation ---- */
(function activeNavigation() {
  const links = Array.from(document.querySelectorAll(".nav-links a[href^='#']"));
  if (!("IntersectionObserver" in window) || !links.length) return;
  const byId = new Map(links.map((link) => [link.getAttribute("href").slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => { link.classList.remove("active"); link.removeAttribute("aria-current"); });
    const active = byId.get(visible.target.id);
    if (active) { active.classList.add("active"); active.setAttribute("aria-current", "location"); }
  }, { rootMargin: "-28% 0px -60%", threshold: [0, 0.15, 0.4] });
  byId.forEach((_link, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
})();

/* ---- Premium surface light follows the pointer (mouse/pen only) ---- */
(function premiumSurfaces() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
  document.querySelectorAll(".premium-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }, { passive: true });
  });
})();

/* ---- Copy-email affordance with localized confirmation ---- */
(function copyEmail() {
  const button = document.querySelector(".copy-email");
  if (!button) return;
  const label = button.querySelector("span");
  let timer = null;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.email || "");
      const lang = document.documentElement.lang === "fr" ? "fr" : "en";
      label.textContent = translations[lang]["contact.copied"];
      button.classList.add("is-copied");
      clearTimeout(timer);
      timer = setTimeout(() => {
        const current = document.documentElement.lang === "fr" ? "fr" : "en";
        label.textContent = translations[current]["contact.copy"];
        button.classList.remove("is-copied");
      }, 2200);
    } catch (_) {
      window.location.href = `mailto:${button.dataset.email}`;
    }
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
    chatApi = initAiChat(mount, { endpoint: AI_ENDPOINT });
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
