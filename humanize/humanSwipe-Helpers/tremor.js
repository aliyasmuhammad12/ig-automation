// tremor.js
// Responsibility: produce tiny, smooth, human-like jitter (aka "tremor")
// to be added on top of the geometric swipe path per step.
//
// Design
// ------
// We model tremor as two critically-damped 1D systems (x and y) driven by
// small random nudges. This yields smooth noise (low-pass) instead of
// chattery per-step randomness.
//
// API
// ---
// createTremor(cfg, DEFAULTS, stepsN) -> tremorStep(i, opts?) -> { tx, ty }
//
// - cfg/DEFAULTS can provide the following (all optional):
//     tremorAmpPx: number | [min, max]      // overall amplitude cap (px)
//     tremorAmpX:  number | [min, max]      // x-amplitude cap override
//     tremorAmpY:  number | [min, max]      // y-amplitude cap override
//     tremorNudge: number | [min, max]      // random nudge magnitude
//     tremorDrag:  number | [0..1]          // velocity decay per step
//     tremorEase:  number | [0..1]          // how fast pos eases to 0
//     tremorBiasX: number                   // persistent bias (px/step)
//     tremorBiasY: number                   // persistent bias (px/step)
//     tremorWarmupSteps: number             // first N steps with smaller amp
//
// - stepsN is used to bias ranges for short vs long swipes.
//
// The returned function is *stateful* across steps.
//
// Typical usage in path.js (pseudo):
//   const tremorStep = createTremor(cfg, DEFAULTS, stepsN);
//   for (let i = 1; i <= stepsN; i++) {
//     const { tx, ty } = tremorStep(i);
//     x += tx; y += ty;
//   }

const { rFloat } = require('./utils');
const DEFAULTS = require('./params');

// ---- small internal helpers ----
function coalesce(...vals) {
  const fallback = vals.length ? vals[vals.length - 1] : undefined;
  for (let i = 0; i < vals.length - 1; i++) {
    const v = vals[i];
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

function arrRange(val, defA, defB) {
  if (Array.isArray(val) && val.length >= 2) return [val[0], val[1]];
  if (typeof val === 'number') return [val, val];
  return [defA, defB];
}

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

// ---- factory ----
function createTremor(cfg = {}, DEFAULTS = {}, stepsN = 0) {
  // Read ranges/params with sensible fallbacks
  const [ampMin, ampMax] = arrRange(
    coalesce(cfg.tremorAmpPx, DEFAULTS.tremorAmpPx),
    0.35, 0.9
  );
  const [ampXMin, ampXMax] = arrRange(
    coalesce(cfg.tremorAmpX, DEFAULTS.tremorAmpX),
    ampMin, ampMax
  );
  const [ampYMin, ampYMax] = arrRange(
    coalesce(cfg.tremorAmpY, DEFAULTS.tremorAmpY),
    ampMin, ampMax
  );

  const [nudgeMin, nudgeMax] = arrRange(
    coalesce(cfg.tremorNudge, DEFAULTS.tremorNudge),
    0.08, 0.22
  );

  // Drag (velocity damping) and easing (spring-to-center)
  // Lower drag => more fluid wobble, higher ease => quicker recenters.
  const drag = clamp(
    coalesce(cfg.tremorDrag, DEFAULTS.tremorDrag, 0.82),
    0.6, 0.98
  );
  const ease = clamp(
    coalesce(cfg.tremorEase, DEFAULTS.tremorEase, 0.10),
    0.02, 0.35
  );

  // Persistent directional drift (very small)
  const biasX = coalesce(cfg.tremorBiasX, DEFAULTS.tremorBiasX, 0);
  const biasY = coalesce(cfg.tremorBiasY, DEFAULTS.tremorBiasY, 0);

  // Early steps feel calmer (less visible tremor on takeoff)
  const warmupSteps = Math.max(0, coalesce(cfg.tremorWarmupSteps, DEFAULTS.tremorWarmupSteps, 4));

  // For very short swipes, reduce max amplitude slightly
  const shortMul = stepsN > 0 && stepsN < 10 ? 0.8 : 1.0;

  const ampXCap = rFloat(ampXMin, ampXMax) * shortMul;
  const ampYCap = rFloat(ampYMin, ampYMax) * shortMul;

  // State for the returned function
  let vx = 0, vy = 0; // velocity
  let px = 0, py = 0; // position

  return function tremorStep(i, opts = {}) {
    // Warmup: reduce amplitude for first few steps
    const warmupMul = i <= warmupSteps ? 0.4 : 1.0;

    // Random nudge
    const nudge = rFloat(nudgeMin, nudgeMax);
    const nudgeX = (Math.random() - 0.5) * nudge;
    const nudgeY = (Math.random() - 0.5) * nudge;

    // Update velocity (add nudge, apply drag)
    vx = vx * drag + nudgeX + biasX;
    vy = vy * drag + nudgeY + biasY;

    // Update position (add velocity, ease toward center)
    px += vx;
    py += vy;
    px *= (1 - ease);
    py *= (1 - ease);

    // Clamp to amplitude caps
    const tx = clamp(px * warmupMul, -ampXCap, ampXCap);
    const ty = clamp(py * warmupMul, -ampYCap, ampYCap);

    return { tx, ty };
  };
}

/**
 * Apply tremor to a path
 */
function applyTremor(opts) {
  const { path, sessionState, profileMultipliers } = opts;
  
  // Create tremor generator
  const tremorStep = createTremor({}, DEFAULTS, path.length);
  
  // Apply tremor to each point
  const trembledPath = path.map((point, index) => {
    const { tx, ty } = tremorStep(index + 1);
    
    // Apply profile multipliers
    const tremorMul = profileMultipliers.tremorMul || 1.0;
    
    return {
      x: point.x + (tx * tremorMul),
      y: point.y + (ty * tremorMul)
    };
  });
  
  return {
    path: trembledPath,
    applied: true
  };
}

module.exports = {
  createTremor,
  applyTremor
};
