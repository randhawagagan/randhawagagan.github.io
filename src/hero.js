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
  },
  light: {
    background: 0xecedf2, // soft light page background + fog
    primary: 0x4550e0, // deeper indigo so it reads on a light field
    secondary: 0x0f9aa2, // teal
    spark: 0xb9711a, // burnt amber
    blending: THREE.NormalBlending, // additive would just wash toward white
    pointColorScale: 1.0, // keep full saturation on the light field
    pointOpacity: 0.95,
    pointSize: 30.0, // slightly larger so the structure reads clearly
    lineOpacity: 0.3,
  },
};

const CONFIG = {
  pointCount: 4200, // total GPU points on the structure
  wireframeSegments: 140, // tubular segments for the wireframe skeleton
  cameraZ: 46, // resting camera distance
  parallaxStrength: 6, // how far the camera drifts with the pointer
  parallaxDamping: 0.045, // lerp factor toward the pointer target (lower = smoother)
  autoRotate: 0.045, // idle rotation speed (radians/sec-ish)
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
  const noop = { destroy() {}, pause() {}, resume() {}, setTheme() {} };

  if (!canvas || typeof canvas.getContext !== 'function') {
    return noop;
  }

  const reducedMotion = prefersReducedMotion();

  // ---- Resolve the initial theme ------------------------------------------
  // Priority: explicit opts.theme > document [data-theme] > OS preference.
  const initialTheme = resolveInitialTheme(opts.theme);
  let currentTheme = initialTheme;

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

  /* ------------------------------------------------------------------------ */
  /* Scene, camera, fog                                                       */
  /* ------------------------------------------------------------------------ */

  const scene = new THREE.Scene();
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
  }

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pointGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  pointGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  pointGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

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
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false, // let overlapping points blend
    blending: PALETTES[initialTheme].blending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uSize;

      attribute float aSize;
      attribute float aPhase;

      varying vec3 vColor;
      varying float vFogDepth; // view-space distance for fog in the fragment stage

      void main() {
        vColor = color;

        // Gentle "breathing" displacement along the position direction for an
        // alive feel; per-point phase keeps it from pulsing in unison.
        vec3 pos = position;
        float breathe = sin(uTime * 0.6 + aPhase) * 0.6;
        pos += normalize(position + 0.001) * breathe;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vFogDepth = -mvPosition.z;

        // Size attenuation: points shrink with distance for real depth.
        gl_PointSize = uSize * aSize * uPixelRatio * (1.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uColorScale; // tames additive glow (dark) / full sat (light)
      uniform float uOpacity;    // per-theme opacity multiplier

      varying vec3 vColor;
      varying float vFogDepth;

      void main() {
        // Build a soft round sprite procedurally (no texture needed).
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;

        // Soft radial falloff; keep a bright-but-not-white core.
        float alpha = smoothstep(0.5, 0.0, d);
        alpha = pow(alpha, 1.6);

        // Scale colour (in dark mode this keeps additive glow off pure white).
        vec3 color = vColor * uColorScale;

        // Depth fog: fade distant points toward the background so they recede
        // with distance instead of piling up (works for both palettes).
        float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
        color = mix(color, uFogColor, fogFactor);

        gl_FragColor = vec4(color, alpha * uOpacity);
      }
    `,
  });

  const points = new THREE.Points(pointGeometry, pointMaterial);
  structure.add(points);

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
  structure.add(wireframe);

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

    // Background + fog.
    renderer.setClearColor(p.background, 1);
    scene.fog.color.set(p.background);

    // Point shader uniforms + blending.
    pointMaterial.uniforms.uFogColor.value.set(p.background);
    pointMaterial.uniforms.uColorScale.value = p.pointColorScale;
    pointMaterial.uniforms.uOpacity.value = p.pointOpacity;
    pointMaterial.uniforms.uSize.value = p.pointSize;
    pointMaterial.blending = p.blending;
    pointMaterial.needsUpdate = true;

    // Wireframe line.
    wireframeMaterial.color.set(p.primary);
    wireframeMaterial.opacity = p.lineOpacity;
    wireframeMaterial.blending = p.blending;
    wireframeMaterial.needsUpdate = true;
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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pointMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);
  resize(); // size once up-front

  /* ------------------------------------------------------------------------ */
  /* Pointer parallax (damped)                                                */
  /* ------------------------------------------------------------------------ */

  // Target and current normalised pointer position (-1..1).
  const pointerTarget = new THREE.Vector2(0, 0);
  const pointerCurrent = new THREE.Vector2(0, 0);

  function onPointerMove(event) {
    // Support both mouse and touch via pointer events.
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    pointerTarget.set(x * 2 - 1, -(y * 2 - 1)); // flip Y for intuitive parallax
  }

  function onPointerLeave() {
    pointerTarget.set(0, 0); // ease back to centre when the pointer leaves
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

  /** Whether the loop is allowed to run right now. */
  function shouldRun() {
    return !reducedMotion && isVisible && !isPaused;
  }

  function renderFrame() {
    // NOTE: getDelta() advances the clock; read elapsedTime afterwards so we
    // don't double-tick (getElapsedTime() would internally call getDelta()).
    const delta = Math.min(clock.getDelta(), 0.05); // clamp to avoid jumps
    const elapsed = clock.elapsedTime;

    // Idle auto-rotation of the whole structure.
    structure.rotation.y += config.autoRotate * delta;
    structure.rotation.x = Math.sin(elapsed * 0.12) * 0.18;

    // Damped camera parallax toward the pointer target.
    pointerCurrent.lerp(pointerTarget, config.parallaxDamping);
    camera.position.x = pointerCurrent.x * config.parallaxStrength;
    camera.position.y = pointerCurrent.y * config.parallaxStrength;
    camera.lookAt(scene.position);

    pointMaterial.uniforms.uTime.value = elapsed;

    renderer.render(scene, camera);
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
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------------------ */
  /* Reduced-motion path: render a single static frame and stop.              */
  /* ------------------------------------------------------------------------ */

  if (reducedMotion) {
    // Compose one attractive static pose, render once, and never loop.
    structure.rotation.set(0.3, 0.6, 0);
    pointMaterial.uniforms.uTime.value = 1.5;
    camera.position.set(3, 2, config.cameraZ);
    camera.lookAt(scene.position);
    renderer.render(scene, camera);
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
    renderOnce(); // guarantee visibility even when the loop isn't running
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

    // GPU resources.
    pointGeometry.dispose();
    pointMaterial.dispose();
    wireframeGeometry.dispose();
    wireframeMaterial.dispose();

    // Renderer: free the WebGL context and internal caches.
    renderer.dispose();
    // forceContextLoss releases the underlying GL context promptly.
    if (typeof renderer.forceContextLoss === 'function') {
      renderer.forceContextLoss();
    }
  }

  return { destroy, pause, resume, setTheme };
}
