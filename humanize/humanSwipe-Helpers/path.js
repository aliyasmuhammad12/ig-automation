// path.js
// Orchestrates swipe path generation by combining geometry, tremor, outliers, and timing.
// Now slimmed down to focus on sequencing, leaving math/details to helpers.
//
// Workflow:
//   1. Resolve configuration & defaults
//   2. Determine main vector (dx, dy) and number of steps (stepsN)
//   3. Select outlier mode & params (outliers.js)
//   4. Compute lateral/arc offset function (lateral.js)
//   5. Create tremor generator (tremor.js)
//   6. Loop through steps, applying arc/lateral + tremor + any spikes
//   7. Compute per-step delays (timing.js)
//   8. Return assembled step array
//
// Each step: { x: number, y: number, delayMs: number }

const { rInt, rFloat } = require('./utils');
const { selectOutlier } = require('./outliers');
const { createLateral } = require('./lateral');
const { createTremor } = require('./tremor');
const { buildTiming } = require('./timing');
const DEFAULTS = require('./params');

// ---- helpers --------------------------------------------------------------
function coalesce(...vals) {
  const fallback = vals.length ? vals[vals.length - 1] : undefined;
  for (let i = 0; i < vals.length - 1; i++) {
    const v = vals[i];
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

// ---- main entry -----------------------------------------------------------
function buildSwipePath(cfg = {}, meta = {}) {
  // 1) Direction vector
  const dx = cfg.dx ?? 0;
  const dy = cfg.dy ?? 0;

  // 2) Steps
  const [sA, sB] = Array.isArray(cfg.stepsN ?? DEFAULTS.stepsN)
    ? cfg.stepsN ?? DEFAULTS.stepsN
    : [cfg.stepsN ?? DEFAULTS.stepsN, cfg.stepsN ?? DEFAULTS.stepsN];
  const stepsN = rInt(sA, sB);

  // 3) Outlier selection
  const OUT = selectOutlier(cfg, DEFAULTS, stepsN);

  // --- context-linked micro behavior hook (non-invasive) ---
  // If caller provided a session in meta, remember outlier and optionally
  // schedule a short hesitation boost for the next 1–3 swipes.
  if (meta && meta.session) {
    const s = meta.session;
    s.lastOutlierType = OUT?.type || null;
    if (OUT?.type && Math.random() < 0.5) {
      s.hesitationBoostUntil = s.swipeCount + rInt(1, 3);
    }
  }

  // 4) Lateral geometry
  const lateral = createLateral(cfg, DEFAULTS, meta, dx, dy, stepsN, { curvyMul: OUT.curvyMul });

  // 5) Tremor generator
  const tremorStep = createTremor(cfg, DEFAULTS, stepsN);

  // 6) Timing prep: total duration (ms)
  const [durA, durB] = Array.isArray(cfg.swipeDurationMs ?? DEFAULTS.swipeDurationMs)
    ? cfg.swipeDurationMs ?? DEFAULTS.swipeDurationMs
    : [cfg.swipeDurationMs ?? DEFAULTS.swipeDurationMs, cfg.swipeDurationMs ?? DEFAULTS.swipeDurationMs];
  const totalMs = rInt(durA, durB);

  // optional jitter range (if given in cfg)
  const jitterRangeMs = Array.isArray(cfg.stepJitterMs) ? cfg.stepJitterMs : [0, 0];

  // 7) Loop to generate raw positions
  const steps = [];
  for (let i = 1; i <= stepsN; i++) {
    const t = i / stepsN;

    // base linear movement
    let x = dx * t;
    let y = dy * t;

    // arc + slant offset
    const { ox, oy } = lateral.offsetAt(t);
    x += ox;
    y += oy;

    // outlier: lateral spike
    if (OUT.type === 'lateralSpike' && i === OUT.spikeIdx) {
      x += OUT.spikePx;
    }

    // tremor
    const { tx, ty } = tremorStep(i);
    x += tx;
    y += ty;

    steps.push({ x, y, delayMs: 0 });
  }

  // 8) Timing array
  const delays = buildTiming(cfg, DEFAULTS, stepsN, totalMs, jitterRangeMs, OUT);
  for (let i = 0; i < stepsN; i++) {
    steps[i].delayMs = delays[i];
  }

  return steps;
}

module.exports = { buildSwipePath };
