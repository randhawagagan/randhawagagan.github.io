/**
 * hero.js — "Engineered point-field" WebGL hero animation.
 *
 * A slowly rotating GPU point cloud arranged on a displaced torus-knot lattice,
 * threaded with a subtle wireframe and reacting to pointer movement with a
 * damped parallax. Dark-mode-native, procedural (no external assets), and built
 * to be a tasteful proof-of-skill centerpiece.
 *
 * Public API:
 *   const hero = initHero(canvasEl, opts);
 *   hero.pause();   // stop the RAF loop
 *   hero.resume();  // restart the RAF loop
 *   hero.destroy(); // tear everything down (listeners, observers, GPU resources)
 *
 * @module hero
 */

import * as THREE from 'https://esm.sh/three@0.160.0';
import { EffectComposer } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';

/* -------------------------------------------------------------------------- */
/* Palette & tunables                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Two full palettes plus per-theme render hints. The hero flips between them
 * live via setTheme(). On the light background additive glow washes out, so
 * light mode uses NormalBlending with a touch more opacity/size so the
 * structure reads as crisp coloured dots against the light page.
 */
const PALETTES = {
  dark: {
    background: 0x08090d, // page-dark background + fog
    primary: 0x5b6cff, // electric indigo — the bulk of the points
    secondary: 0x34e0e8, // cyan — ~15% of points
    spark: 0xffb454, // amber — rare ~3% warm sparks
    blending: THREE.AdditiveBlending,
    pointColorScale: 0.85, // tame additive glow so it never blows to white
    pointOpacity: 1.0,
    pointSize: 26.0,
    lineOpacity: 0.16,
    bloomStrength: 0.72, // real glow: the indigo/cyan points shimmer
    hoverDarken: 0.0, // dark theme: hover BRIGHTENS points (additive glow)
  },
  light: {
    background: 0xecedf2, // soft light page background + fog
    // Deep, saturated colours so the structure reads clearly on the light page
    // (bloom is ~off in light, so contrast — not glow — has to carry it).
    primary: 0x2a2f8f, // deep indigo — wireframe lines + bulk points
    secondary: 0x0c7a80, // deep teal
    spark: 0x9a5e14, // deep amber
    blending: THREE.NormalBlending, // additive would just wash toward white
    pointColorScale: 1.0, // keep full saturation on the light field
    pointOpacity: 1.0, // fully opaque dots read best on light
    pointSize: 30.0, // slightly larger so the structure reads clearly
    lineOpacity: 0.5, // stronger lines for a clearly visible skeleton
    bloomStrength: 0.08, // near-off: bloom washes out an already-light page
    hoverDarken: 1.0, // light theme: hover DEEPENS points (brightening vanishes)
  },
};

// Bloom radius/threshold are shared across themes (only strength flips live).
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.2;

const CONFIG = {
  pointCount: 4200, // total GPU points on the structure
  wireframeSegments: 140, // tubular segments for the wireframe skeleton
  cameraZ: 46, // resting camera distance
  parallaxStrength: 6, // how far the camera drifts with the pointer
  parallaxDamping: 0.045, // lerp factor toward the pointer target (lower = smoother)
  autoRotate: 0.018, // very slow gallery-like idle rotation
  fogNear: 32,
  fogFar: 92,
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the theme to start with.
 * Priority: explicit override → document `data-theme` → OS colour preference.
 * @param {string} [override] - "light" | "dark" if the caller forced one.
 * @returns {"light"|"dark"}
 */
function resolveInitialTheme(override) {
  if (override === 'light' || override === 'dark') return override;

  const attr =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;

  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/** Detect whether the user asked for reduced motion. */
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * A parametric torus-knot position. Returns THREE.Vector3.
 * p/q control how the knot winds; this gives an "engineered" woven structure.
 */
function torusKnotPoint(t, p, q, radius, tube, out) {
  const cu = Math.cos(t);
  const su = Math.sin(t);
  const qOverP = (q / p) * t;
  const cs = Math.cos(qOverP);
  const r = radius * (2 + cs) * 0.5;

  out.x = r * cu;
  out.y = r * su;
  out.z = radius * Math.sin(qOverP) * 0.5;

  // Add cross-section thickness so points don't collapse onto a line.
  out.x += tube * cu;
  out.y += tube * su;
  return out;
}

/** Build a compact, single-stroke initial with the same dusty wire aesthetic. */
function makeInitial(points, palette) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    'centripetal',
    0.5
  );
  const tube = new THREE.TubeGeometry(curve, 64, 0.82, 6, false);
  const wireGeometry = new THREE.WireframeGeometry(tube);
  tube.dispose();
  const wireMaterial = new THREE.LineBasicMaterial({
    color: palette.primary,
    transparent: true,
    opacity: palette.lineOpacity * 1.35,
    blending: palette.blending,
    depthWrite: false,
    fog: true,
  });
  const wire = new THREE.LineSegments(wireGeometry, wireMaterial);

  const count = 720;
  const dustPositions = new Float32Array(count * 3);
  const frames = curve.computeFrenetFrames(180, false);
  const center = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const frameIndex = Math.floor(Math.random() * 181);
    curve.getPointAt(frameIndex / 180, center);
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.25 + Math.random() * 0.55;
    const normal = frames.normals[frameIndex];
    const binormal = frames.binormals[frameIndex];
    dustPositions[i * 3] = center.x + normal.x * Math.cos(angle) * radius + binormal.x * Math.sin(angle) * radius;
    dustPositions[i * 3 + 1] = center.y + normal.y * Math.cos(angle) * radius + binormal.y * Math.sin(angle) * radius;
    dustPositions[i * 3 + 2] = center.z + normal.z * Math.cos(angle) * radius + binormal.z * Math.sin(angle) * radius;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    // Match the knot's dominant indigo. Cyan is reserved for occasional sparks
    // in the main shader; using it for every letter point made them look neon.
    color: palette.primary,
    size: 0.09,
    transparent: true,
    opacity: 0.48,
    blending: palette.blending,
    depthWrite: false,
    fog: true,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  const group = new THREE.Group();
  group.add(wire, dust);
  return { group, wireGeometry, wireMaterial, dustGeometry, dustMaterial };
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Initialise the hero animation on an existing <canvas>.
 *
 * @param {HTMLCanvasElement} canvas - canvas that fills its parent container.
 * @param {Object} [opts]
 * @param {number} [opts.pointCount] - override the number of points.
 * @param {boolean} [opts.autoStart=true] - begin animating immediately.
 * @param {"light"|"dark"} [opts.theme] - force the initial theme (overrides detection).
 * @returns {{ destroy: () => void, pause: () => void, resume: () => void,
 *            setTheme: (theme: "light"|"dark") => void }}
 */
export function initHero(canvas, opts = {}) {
  const parent = canvas.parentElement || document.body;

  // Merge caller overrides over defaults.
  const config = { ...CONFIG, ...opts };

  // ---- Graceful bail-out object -------------------------------------------
  // Returned whenever we cannot render (no canvas, no WebGL, context failure).
  // It satisfies the contract without throwing so the page never crashes.
  const noop = {
    destroy() {},
    pause() {},
    resume() {},
    setTheme() {},
    setScrollProgress() {},
  };

  if (!canvas || typeof canvas.getContext !== 'function') {
    return noop;
  }

  const reducedMotion = prefersReducedMotion();

  // ---- Resolve the initial theme ------------------------------------------
  // Priority: explicit opts.theme > document [data-theme] > OS preference.
  const initialTheme = resolveInitialTheme(opts.theme);
  let currentTheme = initialTheme;

  // ---- Intro / scroll animation state -------------------------------------
  // Damped on the JS side so the shader only ever reads smooth values.
  // Under reduced motion everything starts fully assembled and in view.
  const INTRO_DURATION = 1.4; // seconds for the build-in convergence
  // The intro is driven by WALL-CLOCK time (not a per-frame counter) so it
  // always reaches the dense end-state after INTRO_DURATION regardless of frame
  // rate — a throttled/backgrounded tab or a pause/resume can never leave the
  // field frozen mid-dispersion (which would render as a faint scattered ghost).
  let introStartMs = -1; // timestamp of the first animated frame; -1 = not begun
  let introProgress = reducedMotion ? 1 : 0; // raw 0..1
  let introEase = reducedMotion ? 1 : 0; // eased 0..1 → uIntro
  let scrollTarget = 0; // last value handed to setScrollProgress
  let scrollCurrent = 0; // damped toward scrollTarget

  /* ------------------------------------------------------------------------ */
  /* Renderer                                                                 */
  /* ------------------------------------------------------------------------ */

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
  } catch (err) {
    // WebGL unavailable — signal the fallback and leave the page intact.
    parent.classList.add('hero-webgl-unavailable');
    return noop;
  }

  // If context creation silently failed, bail the same way.
  if (!renderer.getContext()) {
    parent.classList.add('hero-webgl-unavailable');
    return noop;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Clear colour, fog and material colours are all set by applyPalette() below;
  // seed them with the initial palette here to avoid a first-frame flash.
  renderer.setClearColor(PALETTES[initialTheme].background, 1);
  // Colour management: the whole post-processing chain works in LINEAR space and
  // OutputPass owns the final linear→sRGB conversion (the tone-mapping stage).
  // Tone mapping itself is left OFF so the exact palette + page-matching
  // background colours (#08090d / #ecedf2) survive the round-trip unshifted;
  // bloom blow-out is controlled by threshold instead. outputColorSpace stays
  // the r160 default (sRGB), which OutputPass targets.
  renderer.toneMapping = THREE.NoToneMapping;

  /* ------------------------------------------------------------------------ */
  /* Scene, camera, fog                                                       */
  /* ------------------------------------------------------------------------ */

  const scene = new THREE.Scene();
  // IMPORTANT: drive the background via scene.background, NOT renderer clear.
  // Through the EffectComposer + OutputPass chain a renderer clear colour gets
  // sRGB-encoded twice (lifting near-black #08090d to a slate grey), whereas a
  // colour-managed scene.background survives the pipeline exactly. Verified:
  // scene.background → [8,9,13], setClearColor → [50,53,64].
  scene.background = new THREE.Color(PALETTES[initialTheme].background);
  scene.fog = new THREE.Fog(
    PALETTES[initialTheme].background,
    config.fogNear,
    config.fogFar
  );

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 0, config.cameraZ);

  // A group we spin so the camera parallax and the structure rotation are
  // independent of each other.
  const structure = new THREE.Group();
  scene.add(structure);

  /* ------------------------------------------------------------------------ */
  /* Geometry: the point field                                                */
  /* ------------------------------------------------------------------------ */

  const KNOT_P = 2;
  const KNOT_Q = 3;
  const BASE_RADIUS = 18;
  const TUBE = 5.5;

  // Role constants for each point's colour slot. Roles are theme-independent
  // and fixed once; applyPalette() maps them to the active palette's colours.
  const ROLE_PRIMARY = 0;
  const ROLE_SECONDARY = 1;
  const ROLE_SPARK = 2;

  const pointCount = config.pointCount;
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3); // filled by applyPalette()
  const sizes = new Float32Array(pointCount);
  // Per-point phase so the "breathing" displacement isn't uniform.
  const phases = new Float32Array(pointCount);
  // Per-point colour role, so theme switches recolour without re-scattering.
  const roles = new Uint8Array(pointCount);
  // Per-point dispersal vector: where the point sits when fully scattered.
  // Reused for BOTH the intro fly-in and the scroll dissolve so there are no
  // extra attributes or per-frame allocations for either effect.
  const scatter = new Float32Array(pointCount * 3);

  const tmp = new THREE.Vector3();

  for (let i = 0; i < pointCount; i++) {
    // Walk the knot parameter and scatter points around its tube cross-section.
    const t = (i / pointCount) * Math.PI * 2 * KNOT_P;
    torusKnotPoint(t, KNOT_P, KNOT_Q, BASE_RADIUS, TUBE, tmp);

    // Jitter each point into a small shell around the curve for volume.
    const jitter = 3.4;
    tmp.x += (Math.random() - 0.5) * jitter;
    tmp.y += (Math.random() - 0.5) * jitter;
    tmp.z += (Math.random() - 0.5) * jitter;

    const idx = i * 3;
    positions[idx] = tmp.x;
    positions[idx + 1] = tmp.y;
    positions[idx + 2] = tmp.z;

    // Colour distribution: ~3% amber sparks, ~15% secondary, remainder primary.
    const roll = Math.random();
    const role =
      roll < 0.03 ? ROLE_SPARK : roll < 0.18 ? ROLE_SECONDARY : ROLE_PRIMARY;
    roles[i] = role;

    // Varied base sizes; sparks read a touch larger.
    sizes[i] = (role === ROLE_SPARK ? 2.2 : 1.0) * (0.6 + Math.random() * 0.9);
    phases[i] = Math.random() * Math.PI * 2;

    // Dispersal offset: a wide spread, biased far into depth so the intro
    // reads as points flying in from the distance and assembling.
    scatter[idx] = (Math.random() - 0.5) * 90;
    scatter[idx + 1] = (Math.random() - 0.5) * 90;
    scatter[idx + 2] = (Math.random() - 0.5) * 120 - 30;
  }

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pointGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  pointGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  pointGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  pointGeometry.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));

  /* ------------------------------------------------------------------------ */
  /* Point material: custom shader for round, size-attenuated, glowing points */
  /* ------------------------------------------------------------------------ */

  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uSize: { value: PALETTES[initialTheme].pointSize }, // global size multiplier
      uColorScale: { value: PALETTES[initialTheme].pointColorScale },
      uOpacity: { value: PALETTES[initialTheme].pointOpacity },
      uFogColor: { value: new THREE.Color(PALETTES[initialTheme].background) },
      uFogNear: { value: config.fogNear },
      uFogFar: { value: config.fogFar },
      // Intro / scroll / hover drivers (all updated on the JS side, damped).
      uIntro: { value: reducedMotion ? 1 : 0 }, // 0 = scattered, 1 = assembled
      uScroll: { value: 0 }, // 0 = in view, 1 = scrolled past (disperses)
      uScrollFade: { value: 1 }, // alpha multiplier as the hero dissolves
      uPointer: { value: new THREE.Vector2(0, 0) }, // damped cursor, NDC space
      uPointerStrength: { value: 0 }, // 0 idle → 1 while pointer active
      uAspect: { value: 1 }, // viewport aspect for a round hover spotlight
      uFlow: { value: 0.55 }, // amplitude of the slow flowing turbulence
      uHoverDarken: { value: 0 }, // 0 = hover brightens (dark), 1 = deepens (light)
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false, // let overlapping points blend
    blending: PALETTES[initialTheme].blending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uSize;
      uniform float uIntro;
      uniform float uScroll;
      uniform vec2 uPointer;
      uniform float uPointerStrength;
      uniform float uAspect;
      uniform float uFlow;

      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aScatter;

      varying vec3 vColor;
      varying float vFogDepth; // view-space distance for fog in the fragment stage
      varying float vGlow;     // hover proximity, brightens points near the cursor

      void main() {
        vColor = color;

        // Dispersal: 1 when scattered (intro start) or scrolled away, 0 when
        // assembled and in view. Reuses one scatter vector for both effects.
        float disperse = (1.0 - uIntro) + uScroll * 0.9;
        vec3 pos = position + aScatter * disperse;

        // Gentle "breathing" displacement along the position direction for an
        // alive feel; per-point phase keeps it from pulsing in unison.
        float breathe = sin(uTime * 0.6 + aPhase) * 0.6;
        pos += normalize(position + 0.001) * breathe;

        // Slow flowing turbulence: a divergence-free-ish curl of sines that
        // makes the field drift like it's alive, without drifting far enough to
        // hurt readability. Faded out while dispersed so intro/scroll stay clean.
        float assembled = uIntro * (1.0 - uScroll);
        vec3 flow = vec3(
          sin(pos.y * 0.16 + uTime * 0.25),
          sin(pos.z * 0.16 + uTime * 0.22 + 1.7),
          sin(pos.x * 0.16 + uTime * 0.28 + 3.1)
        );
        pos += flow * uFlow * assembled;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vFogDepth = -mvPosition.z;

        vec4 clip = projectionMatrix * mvPosition;

        // Hover spotlight: measure proximity to the cursor in NDC (aspect
        // corrected so the falloff is circular), then brighten + enlarge.
        vec2 ndc = clip.xy / max(clip.w, 0.0001);
        vec2 delta = ndc - uPointer;
        delta.x *= uAspect;
        float prox = smoothstep(0.42, 0.0, length(delta)) * uPointerStrength;
        vGlow = prox;

        // Size attenuation for depth, plus a subtle global pulse and the hover
        // enlargement for richness.
        float pulse = 1.0 + 0.06 * sin(uTime * 1.3 + aPhase);
        gl_PointSize =
          uSize * aSize * uPixelRatio * (1.0 / -mvPosition.z) *
          pulse * (1.0 + prox * 1.1);
        gl_Position = clip;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uColorScale;  // tames additive glow (dark) / full sat (light)
      uniform float uOpacity;     // per-theme opacity multiplier
      uniform float uScrollFade;  // global dissolve as the hero scrolls away
      uniform float uHoverDarken; // 0 = hover brightens (dark), 1 = deepens (light)

      varying vec3 vColor;
      varying float vFogDepth;
      varying float vGlow;

      void main() {
        // Build a soft round sprite procedurally (no texture needed).
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;

        // Soft radial falloff; keep a bright-but-not-white core.
        float alpha = smoothstep(0.5, 0.0, d);
        alpha = pow(alpha, 1.6);

        vec3 base = vColor * uColorScale;

        // Hover response is theme-aware:
        //  • dark  (uHoverDarken 0): brighten toward glow — reads on a dark bg.
        //  • light (uHoverDarken 1): deepen toward a richer, darker shade —
        //    brightening would vanish into the light page, so we go the other way.
        vec3 hoverBright = base * (1.0 + vGlow * 0.7);
        vec3 hoverDeep = mix(base, base * 0.3, vGlow); // pull toward much darker
        vec3 color = mix(hoverBright, hoverDeep, uHoverDarken);

        // Depth fog: fade distant points toward the background so they recede
        // with distance instead of piling up (works for both palettes).
        float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
        color = mix(color, uFogColor, fogFactor);

        // Both themes gain opacity on hover — a darker dot reads stronger on
        // light, a glowier dot reads stronger on dark.
        gl_FragColor = vec4(color, alpha * uOpacity * uScrollFade * (1.0 + vGlow * 0.4));
      }
    `,
  });

  const points = new THREE.Points(pointGeometry, pointMaterial);
  const knotObject = new THREE.Group();
  knotObject.add(points);
  structure.add(knotObject);

  /* ------------------------------------------------------------------------ */
  /* Wireframe skeleton: a thin torus-knot line for "engineered" structure    */
  /* ------------------------------------------------------------------------ */

  const knotCurveGeometry = new THREE.TorusKnotGeometry(
    BASE_RADIUS * 0.62, // radius
    TUBE * 0.34, // tube
    config.wireframeSegments, // tubular segments
    6, // radial segments (low = sparse wireframe)
    KNOT_P,
    KNOT_Q
  );
  const wireframeGeometry = new THREE.WireframeGeometry(knotCurveGeometry);
  // The source geometry is only needed to derive the wireframe edges.
  knotCurveGeometry.dispose();

  const wireframeMaterial = new THREE.LineBasicMaterial({
    color: PALETTES[initialTheme].primary,
    transparent: true,
    opacity: PALETTES[initialTheme].lineOpacity,
    blending: PALETTES[initialTheme].blending,
    depthWrite: false,
    fog: true,
  });
  const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
  knotObject.add(wireframe);

  /* ------------------------------------------------------------------------ */
  /* Initial satellites: separate G and R sculptures                          */
  /* ------------------------------------------------------------------------ */

  const gInitial = makeInitial([
    [4.0, 4.2, -0.4], [1.2, 6.0, 0.5], [-2.4, 5.5, 1.0],
    [-4.8, 2.7, 0.3], [-5.0, -1.4, -0.8], [-2.8, -4.6, -1.1],
    [1.0, -5.2, -0.2], [4.3, -3.1, 0.9], [4.5, 0.0, 0.5],
    [1.8, 0.1, -0.5], [-0.2, 0.1, -0.8],
  ], PALETTES[initialTheme]);
  const rInitial = makeInitial([
    [-3.5, -5.5, 0.4], [-3.5, 0.0, 0.9], [-3.5, 5.5, -0.3],
    [0.5, 5.5, -1.0], [3.8, 3.8, -0.8], [3.5, 1.0, 0.2],
    [-3.1, 0.0, 1.0], [-0.4, -1.0, 1.2], [4.0, -5.5, -0.6],
  ], PALETTES[initialTheme]);

  gInitial.group.position.set(-10.5, 7.8, 3.0);
  gInitial.group.rotation.set(-0.1, 0.28, -0.12);
  gInitial.group.scale.setScalar(0.94);
  rInitial.group.position.set(11.2, -7.4, -1.5);
  rInitial.group.rotation.set(0.12, -0.32, 0.1);
  rInitial.group.scale.setScalar(0.96);
  knotObject.scale.setScalar(0.72);
  knotObject.position.z = -1.5;
  structure.add(gInitial.group, rInitial.group);
  const initials = [gInitial, rInitial];

  /* ------------------------------------------------------------------------ */
  /* Post-processing: EffectComposer + UnrealBloom for a premium glow         */
  /* ------------------------------------------------------------------------ */

  // Pipeline: RenderPass (linear HDR) → UnrealBloom (linear) → OutputPass
  // (tone-map stage + linear→sRGB). Every render in this module goes through
  // composer.render() so the glow is applied uniformly.
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(1, 1), // resolution — corrected immediately by resize()
    PALETTES[initialTheme].bloomStrength,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD
  );
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  /* ------------------------------------------------------------------------ */
  /* Theme application                                                        */
  /* ------------------------------------------------------------------------ */

  // Scratch colours reused across palette applications (avoid per-call allocs).
  const _paletteColors = {
    0: new THREE.Color(), // ROLE_PRIMARY
    1: new THREE.Color(), // ROLE_SECONDARY
    2: new THREE.Color(), // ROLE_SPARK
  };

  /**
   * Apply a palette to every theme-dependent surface: renderer clear colour,
   * fog, per-point colours (a BufferAttribute we rewrite in place), the point
   * shader uniforms (size / opacity / colour-scale / blending / fog colour),
   * and the wireframe line. Does NOT render — callers decide when to draw.
   * @param {"light"|"dark"} themeName
   */
  function applyPalette(themeName) {
    const p = PALETTES[themeName] || PALETTES.dark;
    currentTheme = themeName;

    // Resolve the three role colours once for this application.
    _paletteColors[ROLE_PRIMARY].set(p.primary);
    _paletteColors[ROLE_SECONDARY].set(p.secondary);
    _paletteColors[ROLE_SPARK].set(p.spark);

    // Per-point colours live in a BufferAttribute, so rewrite the array from
    // the fixed role map and flag it for re-upload to the GPU.
    const colorAttr = pointGeometry.getAttribute('color');
    const arr = colorAttr.array;
    for (let i = 0; i < pointCount; i++) {
      const c = _paletteColors[roles[i]];
      const idx = i * 3;
      arr[idx] = c.r;
      arr[idx + 1] = c.g;
      arr[idx + 2] = c.b;
    }
    colorAttr.needsUpdate = true;

    // Background + fog. scene.background is the authoritative clear (see the
    // note at scene creation); keep the renderer clear in sync as a fallback.
    scene.background.set(p.background);
    renderer.setClearColor(p.background, 1);
    scene.fog.color.set(p.background);

    // Point shader uniforms + blending.
    pointMaterial.uniforms.uFogColor.value.set(p.background);
    pointMaterial.uniforms.uColorScale.value = p.pointColorScale;
    pointMaterial.uniforms.uOpacity.value = p.pointOpacity;
    pointMaterial.uniforms.uSize.value = p.pointSize;
    pointMaterial.uniforms.uHoverDarken.value = p.hoverDarken;
    pointMaterial.blending = p.blending;
    pointMaterial.needsUpdate = true;

    // Wireframe line (opacity is driven by intro/scroll, not the palette).
    wireframeMaterial.color.set(p.primary);
    wireframeMaterial.blending = p.blending;
    wireframeMaterial.needsUpdate = true;
    for (const initial of initials) {
      initial.wireMaterial.color.set(p.primary);
      initial.wireMaterial.blending = p.blending;
      initial.wireMaterial.needsUpdate = true;
      initial.dustMaterial.color.set(p.primary);
      initial.dustMaterial.blending = p.blending;
      initial.dustMaterial.needsUpdate = true;
    }
    updateWireframeOpacity();

    // Bloom strength flips live with the theme: a real glow in dark mode, all
    // but off in light mode (where it would just wash the light page out).
    bloomPass.strength = p.bloomStrength;
  }

  /**
   * The wireframe's live opacity: the palette's base opacity, faded in during
   * the intro and faded out as the hero scrolls away. Cheap; no allocations.
   */
  function updateWireframeOpacity() {
    const base = PALETTES[currentTheme].lineOpacity;
    wireframeMaterial.opacity = base * introEase * (1.0 - scrollCurrent * 0.9);
    const fade = introEase * (1.0 - scrollCurrent * 0.9);
    for (const initial of initials) {
      initial.wireMaterial.opacity = base * 1.35 * fade;
      initial.dustMaterial.opacity = 0.48 * fade;
    }
  }

  /**
   * Push the current (already-damped) scroll value into every scroll-driven
   * surface: the dispersal/fade shader uniforms, the wireframe opacity, and a
   * camera dolly-back + gentle roll so the hero performs a parallax handoff as
   * it leaves the viewport. No per-frame allocations.
   */
  function composeScroll() {
    const s = scrollCurrent;
    pointMaterial.uniforms.uScroll.value = s;
    pointMaterial.uniforms.uScrollFade.value = 1.0 - s * 0.9;
    updateWireframeOpacity();
    camera.position.z = config.cameraZ + s * 26; // dolly back as we scroll past
    structure.rotation.z = s * 0.5; // subtle roll on a free axis
  }

  // Bake the initial palette into every surface before the first render.
  applyPalette(initialTheme);

  /* ------------------------------------------------------------------------ */
  /* Resize handling                                                          */
  /* ------------------------------------------------------------------------ */

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false); // false: don't touch the canvas CSS size
    // Keep the composer's render targets in lock-step with the renderer (size
    // AND pixel ratio) so bloom samples at the capped-DPR resolution.
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pointMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    pointMaterial.uniforms.uAspect.value = w / h;

    // Responsive horizontal placement: on wide screens the headline occupies
    // the left ~58%, so slide the knot to the RIGHT so both read clearly. On
    // narrow screens the text is full-width, so keep the knot centred (the
    // dimmed field behind the text is fine there).
    structure.position.x = computeKnotOffsetX(w, h);
  }

  /**
   * World-space X offset that lands the knot's centre at the desired fraction
   * of the viewport width. `frac` is the shift as a fraction of the FULL
   * viewport width (0 = centred at 50%, 0.20 = centred at 70%).
   *   • wide  (≥1000px): 0.20  → knot centre ≈ 70%
   *   • mid   (700–1000): ramps 0 → 0.20 (≈50% → 70%) so it eases in
   *   • narrow (<700px):  0     → stays centred
   * @returns {number} world units to translate the structure group along +X
   */
  function computeKnotOffsetX(w, h) {
    let frac;
    if (w >= 1000) frac = 0.2;
    else if (w > 700) frac = 0.2 * ((w - 700) / 300); // ease-in across mid range
    else frac = 0;
    if (frac === 0) return 0;

    // Half the visible world width at the knot's depth (camera rest distance).
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const worldHalfHeight = Math.tan(fovY / 2) * config.cameraZ;
    const worldHalfWidth = worldHalfHeight * (w / h);
    // frac is of the FULL width (2 × half-width).
    return frac * 2 * worldHalfWidth;
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);
  resize(); // size once up-front

  /* ------------------------------------------------------------------------ */
  /* Pointer parallax (damped)                                                */
  /* ------------------------------------------------------------------------ */

  // Target and current normalised pointer position (-1..1 ≈ NDC).
  const pointerTarget = new THREE.Vector2(0, 0);
  const pointerCurrent = new THREE.Vector2(0, 0);
  // Hover-spotlight strength ramps to 1 while the pointer is active over the
  // hero and eases back to 0 on leave, so idle points aren't lit at centre.
  let pointerStrengthTarget = 0;

  function onPointerMove(event) {
    // Support both mouse and touch via pointer events.
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    pointerTarget.set(x * 2 - 1, -(y * 2 - 1)); // flip Y for intuitive parallax
    pointerStrengthTarget = 1; // light up the field around the cursor
  }

  function onPointerLeave() {
    pointerTarget.set(0, 0); // ease back to centre when the pointer leaves
    pointerStrengthTarget = 0; // fade the hover spotlight out
  }

  // Passive listeners: we never call preventDefault, so scrolling stays smooth.
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });

  /* ------------------------------------------------------------------------ */
  /* WebGL context-loss safety                                                */
  /* ------------------------------------------------------------------------ */

  function onContextLost(event) {
    // Prevent the default so the context can be restored, and halt the loop.
    event.preventDefault();
    stopLoop();
  }

  function onContextRestored() {
    resize();
    if (shouldRun()) startLoop();
  }

  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  /* ------------------------------------------------------------------------ */
  /* Animation loop with visibility + pause gating                            */
  /* ------------------------------------------------------------------------ */

  let rafId = 0;
  let running = false;
  let isVisible = true; // toggled by IntersectionObserver
  let isPaused = false; // toggled by pause()/resume()
  const clock = new THREE.Clock();
  // Accumulated hover turns let each sculpture continue from its current pose
  // instead of snapping back when the pointer leaves.
  let gHoverTurn = 0;
  let rHoverTurn = 0;

  /** Whether the loop is allowed to run right now. */
  function shouldRun() {
    return !reducedMotion && isVisible && !isPaused;
  }

  function renderFrame() {
    // NOTE: getDelta() advances the clock; read elapsedTime afterwards so we
    // don't double-tick (getElapsedTime() would internally call getDelta()).
    const delta = Math.min(clock.getDelta(), 0.05); // clamp to avoid jumps
    const elapsed = clock.elapsedTime;

    // ---- Intro build-in: wall-clock driven, cubic ease-out ----------------
    if (introProgress < 1) {
      if (introStartMs < 0) introStartMs = performance.now();
      introProgress = Math.min(1, (performance.now() - introStartMs) / (INTRO_DURATION * 1000));
      const t = 1 - introProgress;
      introEase = 1 - t * t * t; // easeOutCubic
    }
    pointMaterial.uniforms.uIntro.value = introEase;

    // ---- Scroll: damp toward the target and drive the handoff -------------
    scrollCurrent += (scrollTarget - scrollCurrent) * 0.09;
    composeScroll(); // writes uScroll/fade, wireframe opacity, camera.z, roll

    // ---- Pointer hover strength: damp toward active/idle ------------------
    const uStrength = pointMaterial.uniforms.uPointerStrength;
    uStrength.value += (pointerStrengthTarget - uStrength.value) * 0.08;
    const hoverDrive = uStrength.value;
    gHoverTurn -= hoverDrive * delta * 0.18;
    rHoverTurn += hoverDrive * delta * 0.15;

    // Three independent rhythms: the original knot anchors the composition
    // while the initials orbit gently on different axes like kinetic sculpture.
    // Hover deliberately sends each object in a different direction/axis.
    knotObject.rotation.y += (config.autoRotate + hoverDrive * 0.1) * delta;
    knotObject.rotation.x = Math.sin(elapsed * 0.05) * 0.18;
    knotObject.position.y = Math.sin(elapsed * 0.09) * 0.7;

    gInitial.group.rotation.y = 0.28 + Math.sin(elapsed * 0.075) * 0.32 + gHoverTurn;
    gInitial.group.rotation.x = -0.1 + Math.sin(elapsed * 0.1 + 0.8) * 0.12;
    gInitial.group.rotation.z = -0.12 + Math.sin(elapsed * 0.055) * 0.08 - gHoverTurn * 0.18;
    gInitial.group.position.y = 7.8 + Math.sin(elapsed * 0.11) * 1.0;
    gInitial.group.position.z = 3.0 + Math.cos(elapsed * 0.08) * 1.2;

    rInitial.group.rotation.y = -0.32 + Math.sin(elapsed * 0.06 + 2.1) * 0.3 - rHoverTurn * 0.22;
    rInitial.group.rotation.x = 0.12 + Math.sin(elapsed * 0.085 + 1.4) * 0.13 + rHoverTurn;
    rInitial.group.rotation.z = 0.1 + Math.sin(elapsed * 0.065 + 2.4) * 0.08 + rHoverTurn * 0.12;
    rInitial.group.position.y = -7.4 + Math.sin(elapsed * 0.1 + 2.2) * 0.9;
    rInitial.group.position.z = -1.5 + Math.cos(elapsed * 0.067 + 1.1) * 1.1;

    // Damped camera parallax toward the pointer target (X/Y; Z owned by scroll).
    pointerCurrent.lerp(pointerTarget, config.parallaxDamping);
    camera.position.x = pointerCurrent.x * config.parallaxStrength;
    camera.position.y = pointerCurrent.y * config.parallaxStrength;
    camera.lookAt(scene.position);

    // Feed the damped cursor to the hover spotlight.
    pointMaterial.uniforms.uPointer.value.copy(pointerCurrent);
    pointMaterial.uniforms.uTime.value = elapsed;

    composer.render();
  }

  function tick() {
    // getDelta() is read inside renderFrame; call order keeps timing coherent.
    renderFrame();
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (running || !shouldRun()) return;
    running = true;
    clock.getDelta(); // discard the accumulated delta since the last stop
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /**
   * Render exactly one frame at the current transforms. Used to make theme
   * changes visible even when the loop is paused, out of view, or the hero is
   * running in reduced-motion (single static frame) mode.
   */
  function renderOnce() {
    composer.render();
  }

  /* ------------------------------------------------------------------------ */
  /* Reduced-motion path: render a single static frame and stop.              */
  /* ------------------------------------------------------------------------ */

  if (reducedMotion) {
    // Compose one attractive static pose: fully assembled (uIntro = 1 from
    // init), no scroll dispersal, no hover — then render once and never loop.
    structure.rotation.set(0, 0, 0);
    knotObject.rotation.set(0.3, 0.6, 0);
    pointMaterial.uniforms.uTime.value = 1.5;
    camera.position.set(3, 2, config.cameraZ);
    camera.lookAt(scene.position);
    composer.render();
  }

  /* ------------------------------------------------------------------------ */
  /* IntersectionObserver: pause when scrolled out of view                    */
  /* ------------------------------------------------------------------------ */

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        isVisible = entry.isIntersecting;
        if (shouldRun()) startLoop();
        else stopLoop();
      }
    },
    { threshold: 0.01 }
  );
  intersectionObserver.observe(canvas);

  // Kick things off (unless reduced-motion, which already rendered once).
  if (opts.autoStart !== false && !reducedMotion) {
    startLoop();
  }

  /* ------------------------------------------------------------------------ */
  /* Public controls & teardown                                               */
  /* ------------------------------------------------------------------------ */

  function pause() {
    isPaused = true;
    stopLoop();
  }

  function resume() {
    isPaused = false;
    if (shouldRun()) startLoop();
  }

  /**
   * Live-switch the palette. Recolours every surface and immediately draws one
   * frame, so the change is visible whether the loop is running, paused, out of
   * view, or in reduced-motion mode. Ignores unknown themes.
   * @param {"light"|"dark"} theme
   */
  function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return;
    if (theme === currentTheme) return; // no-op if already active
    applyPalette(theme);
    composeScroll(); // keep scroll-driven opacity/dolly consistent post-recolor
    renderOnce(); // guarantee visibility even when the loop isn't running
  }

  /**
   * Drive the scroll handoff. `p` is 0..1: 0 = hero fully in view at the top,
   * 1 = scrolled completely past. As `p` rises the field disperses, dissolves,
   * and the camera dollies back. The value is damped inside the RAF loop; when
   * the loop is idle (paused / out of view) we snap and render one frame so the
   * visual never desyncs from the scroll position. No-op under reduced motion.
   * @param {number} p
   */
  function setScrollProgress(p) {
    if (reducedMotion) return;
    if (typeof p !== 'number' || Number.isNaN(p)) return;
    scrollTarget = p < 0 ? 0 : p > 1 ? 1 : p; // clamp to [0, 1]

    // If the loop isn't advancing, apply immediately so scroll stays in sync.
    if (!running) {
      scrollCurrent = scrollTarget;
      composeScroll();
      camera.lookAt(scene.position); // camera.z changed; refresh orientation
      renderOnce();
    }
  }

  function destroy() {
    stopLoop();

    // Observers.
    resizeObserver.disconnect();
    intersectionObserver.disconnect();

    // Listeners.
    window.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);

    // Post-processing: dispose the composer's render targets and every pass
    // that owns GPU resources (guarded — not all passes expose dispose()).
    composer.dispose();
    if (typeof bloomPass.dispose === 'function') bloomPass.dispose();
    if (typeof renderPass.dispose === 'function') renderPass.dispose();
    if (typeof outputPass.dispose === 'function') outputPass.dispose();

    // GPU resources.
    pointGeometry.dispose();
    pointMaterial.dispose();
    wireframeGeometry.dispose();
    wireframeMaterial.dispose();
    for (const initial of initials) {
      initial.wireGeometry.dispose();
      initial.wireMaterial.dispose();
      initial.dustGeometry.dispose();
      initial.dustMaterial.dispose();
    }

    // Renderer: free the WebGL context and internal caches.
    renderer.dispose();
    // forceContextLoss releases the underlying GL context promptly.
    if (typeof renderer.forceContextLoss === 'function') {
      renderer.forceContextLoss();
    }
  }

  return { destroy, pause, resume, setTheme, setScrollProgress };
}
