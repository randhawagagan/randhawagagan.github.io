/* =========================================================================
   i18n.js — tiny, build-step-free English/French localization.

   - `translations`  : { en: {...}, fr: {...} } flat maps of key -> HTML string.
   - `applyLang(lang)`: swaps innerHTML for every [data-i18n], updates <title>,
                        meta description + og/twitter, and persists the choice.
   - `initLang()`    : resolves the initial language (saved -> navigator -> en).

   French is professional Québec/Canadian French. Brand, product and tech
   names (ClinicMaster, SAP, React, Azure, HIPAA, SOC 2, p75 LCP, …) stay as-is.
   ========================================================================= */

const STORAGE_KEY = "gr-lang";

export const translations = {
  en: {
    /* ---- <head> / social meta ---- */
    "meta.title": "Gagan Randhawa — Frontend Architect & AI Product Builder",
    "meta.description":
      "Gagan Randhawa — Senior frontend engineer and architect with 12+ years building enterprise web products. Angular, React, TypeScript. Now building AI-powered products end-to-end.",
    "meta.ogTitle": "Gagan Randhawa — Frontend Architect & AI Product Builder",
    "meta.ogDescription":
      "12+ years building enterprise frontends at SAP and in aerospace. Leading Angular/React teams, obsessed with performance and design systems. Now building AI-powered products.",
    "meta.twitterTitle": "Gagan Randhawa — Frontend Architect & AI Product Builder",
    "meta.twitterDescription":
      "12+ years building enterprise frontends. Now building AI-powered products, end-to-end.",

    /* ---- Nav ---- */
    "nav.work": "Work",
    "nav.building": "Building",
    "nav.approach": "Approach",
    "nav.askAi": "Ask my AI",
    "nav.about": "About",
    "nav.resume": "Résumé",
    "nav.contact": "Contact",

    /* ---- Hero ---- */
    "hero.eyebrow": "Frontend Architect · AI Product Builder · Montréal, QC",
    "hero.h1":
      'Enterprise-grade frontends, now pointed at <span class="lit">AI products</span>.',
    "hero.sub":
      "I'm Gagan — a senior frontend engineer and architect with 12+ years building web products at SAP and in aerospace. I lead Angular &amp; React teams, obsess over performance and design systems, and I build AI-powered products end-to-end.",
    "hero.ctaPrimary": "See the work →",
    "hero.ctaGhost": "Meet my portfolio AI",
    "hero.scroll": "Scroll",

    /* ---- Proof strip labels ---- */
    "proof.years": "Years<br />engineering",
    "proof.lcp": "p75 LCP<br />improved",
    "proof.load": "Initial load<br />cut",
    "proof.coverage": "Test<br />coverage",
    "proof.led": "Engineers<br />led",
    "proof.ds": "Design-system<br />components",

    /* ---- Work section ---- */
    "work.eyebrow": "Selected work",
    "work.title": "Work that moved the product.",
    "work.lead":
      "A few builds that show the range: a flagship healthcare SaaS, aerospace tooling, and enterprise platform work at SAP.",

    /* Case 1 — ClinicMaster */
    "case1.index": "01 — 2022–present · Adda Tech, Montréal",
    "case1.title": "ClinicMaster — Healthcare SaaS",
    "case1.role": "Team Lead · Frontend Architecture",
    "case1.desc":
      "Adda Tech's flagship: a cloud platform running scheduling, charting, billing, and analytics for multi-location clinic networks (physio, mental health, sleep, aesthetics). I built the front-end architecture — a reusable component library, Redux + TypeScript state, and per-franchise PWA theming — for a SOC&nbsp;2 / HIPAA / Québec&nbsp;Law&nbsp;25-compliant product on Azure.",
    "case1.m1": "feature delivery time with a 40+ component design-system library",
    "case1.m2": "next-gen portal adoption via per-franchise dynamic PWA manifests",
    "case1.m3": "HIPAA · PHIPA · Québec Law 25 — regulated, multi-location scale",

    /* Case 2 — Aerospace */
    "case2.index": "02 — 2022–present · Adda Tech, Montréal",
    "case2.title": "Aerospace Parts Platform",
    "case2.role": "Team Lead · Frontend Architecture",
    "case2.desc":
      "Front-end architecture for an aerospace application managing airplane parts — Angular &amp; React dashboards. Refactored the render-critical path with profiling and lazy loading for a materially faster, calmer UI, and shipped it through Dockerized CI/CD on AWS.",
    "case2.m1": "p75 LCP via code-splitting, lazy loading &amp; profiling",
    "case2.m2": "load time on the render-critical React path",
    "case2.m3": "Dockerized pipelines, deployed on AWS",

    /* Case 3 — SAP Ariba */
    "case3.index": "03 — 2017–2022 · SAP Labs, Bengaluru",
    "case3.title": "SAP Ariba &amp; CX Suite UI",
    "case3.role": "Front-End Lead / Senior Developer (T3)",
    "case3.desc":
      'Designed a supplier-discovery UI that let users post and invite suppliers in three clicks, decomposed a monolith into shared micro-frontends, built the internal <span class="mono">seller-commons</span> library, and integrated Emarsys into SAP Marketing over SSO.',
    "case3.m1": "unit + E2E coverage (Jest/Cypress) → −20% incidents",
    "case3.m2": "user engagement, −30% bug reports",
    "case3.m3": "upsell from a 5-cloud field-extension app",

    /* Case 4 — Migration */
    "case4.index": "04 — SAP Labs · Platform leadership",
    "case4.title": "Legacy → React Migration",
    "case4.role": "Leading a team of 8 engineers",
    "case4.desc":
      "Directed eight front-end engineers migrating an entire legacy application to a modern React framework, and re-sequenced independent API calls to run in parallel — collapsing a painful initial load and cutting long-term maintenance cost.",
    "case4.m1": "initial load by parallelizing independent API calls",
    "case4.m2": "UI responsiveness after the migration",
    "case4.m3": "maintenance cost long-term",

    /* ---- Flagship / Building ---- */
    "flagship.eyebrow": "Currently building",
    "flagship.title": "A product, in the open.",
    "flagship.badge": '<span class="pulse"></span> In progress',
    "flagship.h3": "An AI workflow tool for software teams.",
    "flagship.p":
      "Turning my enterprise frontend background into a product: an AI-assisted workspace that drafts, summarizes, and routes engineering work — streaming LLM responses, retrieval over team docs, and evals to keep answers grounded. Built the way I'd build any product: typed, tested, observable, and fast.",

    /* ---- Approach ---- */
    "approach.eyebrow": "How I work",
    "approach.title": "Turning complexity into momentum.",
    "approach.p1h": "Architecture first",
    "approach.p1":
      "Design systems, micro-frontends, rendering and state boundaries chosen for how the product will grow — not just today's screen.",
    "approach.p2h": "Performance as a feature",
    "approach.p2":
      "Core Web Vitals treated as budgets. Profiling, code-splitting, and parallelization with measured p75 deltas, not vibes.",
    "approach.p3h": "Tested &amp; observable",
    "approach.p3":
      "TDD where it counts, unit + E2E coverage, and instrumentation so regressions show up before users do.",
    "approach.p4h": "AI-augmented delivery",
    "approach.p4":
      "Shipping with agentic workflows and evals — using AI to move faster while keeping a senior engineer's judgment in the loop.",

    /* ---- Ask AI ---- */
    "ask.eyebrow": "Portfolio AI · Live",
    "ask.h2": "This portfolio can answer back.",
    "ask.p1":
      "Ask directly about my experience, technical decisions, results, or fit for your role. The assistant is grounded in this portfolio and responds in English or French.",
    "ask.proof1": "Career-grounded",
    "ask.proof2": "Live answers",
    "ask.proof3": "EN + FR",
    "ask.note":
      "Frontend widget + Cloudflare Worker proxy · streaming responses · key stays server-side.",

    /* ---- About ---- */
    "about.eyebrow": "About",
    "about.title": "Twelve years deep. Still curious.",
    "about.p1":
      "I started in 2014 and have spent my career close to the code — <strong>enterprise applications at scale, Angular and React, design systems, micro-frontends, performance work, and leading engineers</strong> at SAP Labs and, today, as a Team Lead at Adda Tech in Laval.",
    "about.p2":
      "What I actually enjoy is <strong>solving hard technical problems and shipping polished products</strong> — not climbing an org chart. So I'm deepening frontend architecture and folding practical AI into how I build, aiming squarely at product engineering.",
    "about.p3":
      "Right now that means turning a decade of frontend depth into <strong>AI-powered products</strong>, built end-to-end with the same discipline I bring to enterprise work.",

    /* Timeline roles */
    "tl1.role": "Team Lead",
    "tl2.role": "Front-End Lead / Senior Dev (T3)",
    "tl3.role": "Associate Programming Analyst",
    "tl4.role": "B.E. Computer Science",

    /* ---- Contact ---- */
    "contact.eyebrow": "Let's talk",
    "contact.h2": "Building something<br />that needs a frontend lead?",
    "contact.lead":
      "Open to Lead Frontend / Frontend Architect roles, founding-engineer conversations, and product collaborations.",
    "contact.available": "Available for the right opportunity",
    "contact.based": "Based in",
    "contact.timezone": "Time zone",
    "contact.timezoneValue": "Eastern Time (ET)",
    "contact.reply": "Typical reply",
    "contact.replyValue": "Within 1–2 days",
    "contact.copy": "Copy email",
    "contact.copied": "Email copied",
    "contact.resumePdf": "Download résumé (PDF)",
    "contact.resumeDocx": "ATS résumé (Word)",

    /* ---- Footer ---- */
    "foot.built": "Built with Three.js + a hand-written AI proxy · no template",
  },

  fr: {
    /* ---- <head> / social meta ---- */
    "meta.title": "Gagan Randhawa — Architecte frontend & créateur de produits IA",
    "meta.description":
      "Gagan Randhawa — Ingénieur et architecte frontend senior avec plus de 12 ans à bâtir des produits web d'entreprise. Angular, React, TypeScript. Aujourd'hui, des produits propulsés par l'IA, de bout en bout.",
    "meta.ogTitle": "Gagan Randhawa — Architecte frontend & créateur de produits IA",
    "meta.ogDescription":
      "Plus de 12 ans à bâtir des frontends d'entreprise chez SAP et dans l'aérospatiale. Direction d'équipes Angular/React, obsédé par la performance et les design systems. Aujourd'hui, des produits propulsés par l'IA.",
    "meta.twitterTitle": "Gagan Randhawa — Architecte frontend & créateur de produits IA",
    "meta.twitterDescription":
      "Plus de 12 ans à bâtir des frontends d'entreprise. Aujourd'hui, des produits propulsés par l'IA, de bout en bout.",

    /* ---- Nav ---- */
    "nav.work": "Travaux",
    "nav.building": "En cours",
    "nav.approach": "Approche",
    "nav.askAi": "Mon IA portfolio",
    "nav.about": "À propos",
    "nav.resume": "CV (anglais)",
    "nav.contact": "Contact",

    /* ---- Hero ---- */
    "hero.eyebrow": "Architecte frontend · Créateur de produits IA · Montréal, QC",
    "hero.h1":
      'Des frontends de calibre entreprise, désormais tournés vers les <span class="lit">produits IA</span>.',
    "hero.sub":
      "Je suis Gagan — ingénieur et architecte frontend senior avec plus de 12 ans à bâtir des produits web chez SAP et dans l'aérospatiale. Je dirige des équipes Angular &amp; React, je suis obsédé par la performance et les design systems, et je crée des produits propulsés par l'IA, de bout en bout.",
    "hero.ctaPrimary": "Voir les réalisations →",
    "hero.ctaGhost": "Découvrir mon IA portfolio",
    "hero.scroll": "Défiler",

    /* ---- Proof strip labels ---- */
    "proof.years": "Années<br />d'ingénierie",
    "proof.lcp": "p75 LCP<br />amélioré",
    "proof.load": "Chargement<br />initial réduit",
    "proof.coverage": "Couverture<br />de tests",
    "proof.led": "Ingénieurs<br />encadrés",
    "proof.ds": "Composants de<br />design system",

    /* ---- Work section ---- */
    "work.eyebrow": "Travaux sélectionnés",
    "work.title": "Du travail qui fait avancer le produit.",
    "work.lead":
      "Quelques réalisations qui montrent l'étendue : un SaaS santé phare, des outils pour l'aérospatiale et du travail de plateforme d'entreprise chez SAP.",

    /* Case 1 — ClinicMaster */
    "case1.index": "01 — 2022–aujourd'hui · Adda Tech, Montréal",
    "case1.title": "ClinicMaster — SaaS santé",
    "case1.role": "Chef d'équipe · Architecture front-end",
    "case1.desc":
      "Le produit phare d'Adda Tech : une plateforme infonuagique gérant la prise de rendez-vous, les dossiers, la facturation et l'analytique pour des réseaux de cliniques multi-sites (physio, santé mentale, sommeil, esthétique). J'ai bâti l'architecture front-end — une bibliothèque de composants réutilisables, un état Redux + TypeScript et un thème PWA par franchise — pour un produit conforme à SOC&nbsp;2 / HIPAA / la Loi&nbsp;25 du Québec, sur Azure.",
    "case1.m1":
      "de temps de livraison des fonctionnalités grâce à une bibliothèque de design system de plus de 40 composants",
    "case1.m2":
      "d'adoption du portail nouvelle génération via des manifestes PWA dynamiques par franchise",
    "case1.m3": "HIPAA · PHIPA · Loi 25 du Québec — à l'échelle réglementée et multi-sites",

    /* Case 2 — Aerospace */
    "case2.index": "02 — 2022–aujourd'hui · Adda Tech, Montréal",
    "case2.title": "Plateforme de pièces aérospatiales",
    "case2.role": "Chef d'équipe · Architecture front-end",
    "case2.desc":
      "Architecture front-end d'une application aérospatiale gérant des pièces d'avion — tableaux de bord Angular &amp; React. J'ai refactorisé le chemin critique de rendu avec du profilage et du chargement différé pour une interface nettement plus rapide et plus posée, livrée via un CI/CD dockerisé sur AWS.",
    "case2.m1": "p75 LCP grâce au fractionnement de code, au chargement différé &amp; au profilage",
    "case2.m2": "de temps de chargement sur le chemin React critique de rendu",
    "case2.m3": "Pipelines dockerisés, déployés sur AWS",

    /* Case 3 — SAP Ariba */
    "case3.index": "03 — 2017–2022 · SAP Labs, Bengaluru",
    "case3.title": "Interface SAP Ariba &amp; CX Suite",
    "case3.role": "Responsable front-end / Développeur senior (T3)",
    "case3.desc":
      'J\'ai conçu une interface de découverte de fournisseurs permettant de publier et d\'inviter des fournisseurs en trois clics, décomposé un monolithe en micro-frontends partagés, bâti la bibliothèque interne <span class="mono">seller-commons</span> et intégré Emarsys à SAP Marketing via SSO.',
    "case3.m1": "de couverture unitaire + E2E (Jest/Cypress) → −20 % d'incidents",
    "case3.m2": "d'engagement utilisateur, −30 % de rapports de bogues",
    "case3.m3": "de vente incitative grâce à une appli d'extension de champs sur 5 clouds",

    /* Case 4 — Migration */
    "case4.index": "04 — SAP Labs · Direction de plateforme",
    "case4.title": "Migration du legacy vers React",
    "case4.role": "Direction d'une équipe de 8 ingénieurs",
    "case4.desc":
      "J'ai dirigé huit ingénieurs front-end dans la migration complète d'une application legacy vers un framework React moderne, et réordonné des appels d'API indépendants pour qu'ils s'exécutent en parallèle — réduisant un chargement initial pénible et abaissant le coût de maintenance à long terme.",
    "case4.m1": "de chargement initial en parallélisant des appels d'API indépendants",
    "case4.m2": "de réactivité de l'interface après la migration",
    "case4.m3": "de coût de maintenance à long terme",

    /* ---- Flagship / Building ---- */
    "flagship.eyebrow": "En cours de création",
    "flagship.title": "Un produit, construit en public.",
    "flagship.badge": '<span class="pulse"></span> En cours',
    "flagship.h3": "Un outil de flux de travail IA pour les équipes logicielles.",
    "flagship.p":
      "Je transforme mon expérience de frontend d'entreprise en produit : un espace de travail assisté par l'IA qui rédige, résume et achemine le travail d'ingénierie — réponses LLM en continu, recherche dans les documents d'équipe et évaluations pour garder les réponses ancrées. Conçu comme je conçois tout produit : typé, testé, observable et rapide.",

    /* ---- Approach ---- */
    "approach.eyebrow": "Ma façon de travailler",
    "approach.title": "Transformer la complexité en élan.",
    "approach.p1h": "L'architecture d'abord",
    "approach.p1":
      "Design systems, micro-frontends, frontières de rendu et d'état choisis en fonction de la croissance du produit — pas seulement de l'écran d'aujourd'hui.",
    "approach.p2h": "La performance comme fonctionnalité",
    "approach.p2":
      "Les Core Web Vitals traités comme des budgets. Profilage, fractionnement de code et parallélisation avec des écarts p75 mesurés, pas au feeling.",
    "approach.p3h": "Testé &amp; observable",
    "approach.p3":
      "Du TDD là où ça compte, une couverture unitaire + E2E et de l'instrumentation pour que les régressions apparaissent avant les utilisateurs.",
    "approach.p4h": "Livraison augmentée par l'IA",
    "approach.p4":
      "Livrer avec des flux de travail agentiques et des évaluations — utiliser l'IA pour aller plus vite tout en gardant le jugement d'un ingénieur senior dans la boucle.",

    /* ---- Ask AI ---- */
    "ask.eyebrow": "IA du portfolio · En direct",
    "ask.h2": "Ce portfolio peut vous répondre.",
    "ask.p1":
      "Posez directement vos questions sur mon expérience, mes décisions techniques, mes résultats ou mon adéquation à votre poste. L'assistant s'appuie sur ce portfolio et répond en français ou en anglais.",
    "ask.proof1": "Ancré dans mon parcours",
    "ask.proof2": "Réponses en direct",
    "ask.proof3": "FR + EN",
    "ask.note":
      "Composant frontend + proxy Cloudflare Worker · réponses en continu · la clé reste côté serveur.",

    /* ---- About ---- */
    "about.eyebrow": "À propos",
    "about.title": "Douze ans d'expertise. Toujours curieux.",
    "about.p1":
      "J'ai débuté en 2014 et j'ai passé ma carrière au plus près du code — <strong>applications d'entreprise à grande échelle, Angular et React, design systems, micro-frontends, travail de performance et encadrement d'ingénieurs</strong> chez SAP Labs et, aujourd'hui, comme chef d'équipe chez Adda Tech à Laval.",
    "about.p2":
      "Ce que j'aime vraiment, c'est <strong>résoudre des problèmes techniques difficiles et livrer des produits soignés</strong> — pas gravir un organigramme. Alors j'approfondis l'architecture frontend et j'intègre l'IA pratique à ma façon de bâtir, en visant carrément l'ingénierie de produit.",
    "about.p3":
      "En ce moment, ça veut dire transformer une décennie d'expertise frontend en <strong>produits propulsés par l'IA</strong>, construits de bout en bout avec la même rigueur que j'apporte au travail d'entreprise.",

    /* Timeline roles */
    "tl1.role": "Chef d'équipe",
    "tl2.role": "Responsable front-end / Dév. senior (T3)",
    "tl3.role": "Analyste-programmeur associé",
    "tl4.role": "B.E. en informatique",

    /* ---- Contact ---- */
    "contact.eyebrow": "Discutons",
    "contact.h2": "Vous bâtissez quelque chose<br />qui a besoin d'un responsable frontend ?",
    "contact.lead":
      "Ouvert aux postes de responsable frontend / architecte frontend, aux échanges d'ingénieur fondateur et aux collaborations produit.",
    "contact.available": "Disponible pour la bonne occasion",
    "contact.based": "Basé à",
    "contact.timezone": "Fuseau horaire",
    "contact.timezoneValue": "Heure de l'Est (HE)",
    "contact.reply": "Réponse habituelle",
    "contact.replyValue": "Sous 1 à 2 jours",
    "contact.copy": "Copier le courriel",
    "contact.copied": "Courriel copié",
    "contact.resumePdf": "Télécharger le CV (PDF anglais)",
    "contact.resumeDocx": "CV ATS (Word anglais)",

    /* ---- Footer ---- */
    "foot.built": "Construit avec Three.js + un proxy IA écrit à la main · sans gabarit",
  },
};

/** Update a single meta tag's `content` if the element exists. */
function setMeta(selector, value) {
  if (value == null) return;
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute("content", value);
}

/**
 * Apply a language across the whole document.
 * @param {"en"|"fr"} lang
 */
export function applyLang(lang) {
  const dict = translations[lang] || translations.en;
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const value = dict[key];
    if (value != null) el.innerHTML = value;
  });

  // <title> + social meta
  if (dict["meta.title"]) document.title = dict["meta.title"];
  setMeta('meta[name="description"]', dict["meta.description"]);
  setMeta('meta[property="og:title"]', dict["meta.ogTitle"]);
  setMeta('meta[property="og:description"]', dict["meta.ogDescription"]);
  setMeta('meta[name="twitter:title"]', dict["meta.twitterTitle"]);
  setMeta('meta[name="twitter:description"]', dict["meta.twitterDescription"]);
  setMeta('meta[property="og:locale"]', lang === "fr" ? "fr_CA" : "en_CA");

  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (_) {
    /* storage may be unavailable (private mode) — ignore */
  }
}

/**
 * Resolve the initial language: saved choice -> navigator -> "en".
 * @returns {"en"|"fr"}
 */
export function initLang() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
  if (saved === "en" || saved === "fr") return saved;
  const nav = (navigator.language || "").toLowerCase();
  return nav.startsWith("fr") ? "fr" : "en";
}
