// tremor.js
// Responsibility: produce tiny, smooth, human-like jitter (aka “tremor”)
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

  // Init state: pos (tx, ty) and vel (vx, vy)
  let tx = rFloat(-ampXCap * 0.1, ampXCap * 0.1);
  let ty = rFloat(-ampYCap * 0.1, ampYCap * 0.1);
  let vx = 0, vy = 0;

  // Random phase multipliers so x/y don't sync
  const phaseX = rFloat(0.75, 1.25);
  const phaseY = rFloat(0.75, 1.25);

  // The per-step function
  return function tremorStep(i = 1, opts = {}) {
    // Optional per-call overrides
    const ampScale = typeof opts.ampScale === 'number' ? opts.ampScale : 1;

    // Warmup scaling: ramp from 60% -> 100% over warmupSteps
    const warmupScale = warmupSteps > 0
      ? clamp(0.6 + 0.4 * Math.min(1, i / warmupSteps), 0.6, 1.0)
      : 1.0;

    const axCap = ampXCap * ampScale * warmupScale;
    const ayCap = ampYCap * ampScale * warmupScale;

    // Random nudges (acceleration), independently for x and y
    const nudgeX = rFloat(nudgeMin, nudgeMax) * (Math.random() < 0.5 ? -1 : 1);
    const nudgeY = rFloat(nudgeMin, nudgeMax) * (Math.random() < 0.5 ? -1 : 1);

    // Spring to center (ease) + random nudge + tiny bias
    vx = vx * drag + (-tx * ease) + nudgeX * phaseX + biasX * 0.02;
    vy = vy * drag + (-ty * ease) + nudgeY * phaseY + biasY * 0.02;

    // Integrate
    tx += vx;
    ty += vy;

    // Soft-limit to caps (squash as approach edge)
    const overX = Math.abs(tx) / (axCap || 1);
    const overY = Math.abs(ty) / (ayCap || 1);
    if (overX > 1) tx *= 0.8 + 0.2 / overX;
    if (overY > 1) ty *= 0.8 + 0.2 / overY;

    // Final clamp
    tx = clamp(tx, -axCap, axCap);
    ty = clamp(ty, -ayCap, ayCap);

    return { tx, ty };
  };
}

module.exports = { createTremor };
