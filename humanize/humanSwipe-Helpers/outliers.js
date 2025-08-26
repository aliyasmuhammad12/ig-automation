// outliers.js
// Responsibility: choose a rare "outlier" pattern for a swipe path and
// precompute any parameters path.js will need to apply it.
//
// Outlier types supported:
// - 'longPause': injects an extra pause (ms) either before step 1 (idx 0 sentinel) or at some step
// - 'lateralSpike': adds a single lateral x jump (px) at a chosen step
// - 'curvySurge': multiplies the curvature/arc intensity for the whole swipe
//
// Inputs:
//   cfg: runtime overrides (from session / profile)
//   DEFAULTS: fallback values (from params.js)
//   stepsN: number of steps in the path (for spike index selection)
//
// Output:
//   An object with a stable shape consumed by path.js:
//
//   {
//     type: 'longPause' | 'lateralSpike' | 'curvySurge' | null,
//     pauseIdx: number|null,   // 0 means "before first step" (apply to steps[0].delayMs)
//     pauseMs: number,         // milliseconds to add when longPause
//     spikeIdx: number|null,   // which step gets the lateral spike
//     spikePx: number,         // pixels to add to x at spikeIdx (signed)
//     curvyMul: number         // multiplicative curvature factor (1 means no change)
//   }

const { rInt, rFloat } = require('./utils');
const DEFAULTS = require('./params');

/**
 * Helper function to coalesce values
 */
function coalesce(...vals) {
  const fallback = vals.length ? vals[vals.length - 1] : undefined;
  for (let i = 0; i < vals.length - 1; i++) {
    const v = vals[i];
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

/**
 * Weighted random pick for objects like [{type:'a', w:2}, {type:'b', w:1}]
 * Returns the chosen type or null.
 */
function pickWeightedType(weights) {
  if (!Array.isArray(weights) || weights.length === 0) return null;
  const total = weights.reduce((s, it) => s + (it.w || 0), 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const it of weights) {
    roll -= (it.w || 0);
    if (roll <= 0) return it.type || null;
  }
  return weights[weights.length - 1].type || null; // fallback
}

/**
 * Select and parameterize an outlier mode.
 */
function selectOutlier(cfg = {}, DEFAULTS = {}, stepsN = 0) {
  const oChance = coalesce(cfg.outlierChance, DEFAULTS.outlierChance, 0);
  const weights = coalesce(cfg.outlierWeights, DEFAULTS.outlierWeights, null);

  // Decide if we even do an outlier this run
  let type = null;
  if (oChance > 0 && Math.random() < oChance) {
    // Expected shape: [{ type: 'longPause', w: 1 }, { type: 'lateralSpike', w: 1 }, ...]
    type = pickWeightedType(Array.isArray(weights) ? weights : []);
  }

  // Defaults
  let pauseIdx = null, pauseMs = 0;
  let spikeIdx = null, spikePx = 0;
  let curvyMul = 1;

  // Parameter sources (with sensible fallbacks)
  const [lpA, lpB] = coalesce(cfg.outlierLongPauseMs, DEFAULTS.outlierLongPauseMs, [650, 1600]);
  const [spA, spB] = coalesce(cfg.outlierLateralSpikePx, DEFAULTS.outlierLateralSpikePx, [12, 28]);
  const [cmA, cmB] = coalesce(cfg.outlierCurvyMul, DEFAULTS.outlierCurvyMul, [1.5, 2.1]);

  switch (type) {
    case 'longPause': {
      // Choose whether the pause happens "before step 1" (idx 0 sentinel) or mid‑path.
      // If stepsN is tiny, prefer the pre-step pause to avoid degenerate timing.
      const preFirstBias = stepsN < 6 ? 0.75 : 0.25; // tweakable
      const preFirst = Math.random() < preFirstBias;

      pauseMs = rInt(lpA, lpB);
      pauseIdx = preFirst ? 0 : rInt(Math.max(1, Math.floor(stepsN * 0.20)),
                                     Math.max(1, Math.floor(stepsN * 0.80)));
      break;
    }
    case 'lateralSpike': {
      // Insert a sideways blip somewhere in the later half (feels more human).
      const lo = Math.max(1, Math.floor(stepsN * 0.45));
      const hi = Math.max(lo, Math.floor(stepsN * 0.85));
      spikeIdx = rInt(lo, hi);
      const sign = Math.random() < 0.5 ? -1 : 1;
      spikePx = rInt(spA, spB) * sign;
      break;
    }
    case 'curvySurge': {
      // Brief globally "curvier" path
      curvyMul = rFloat(cmA, cmB);
      break;
    }
    default:
      // no outlier this run
      type = null;
  }

  return { type, pauseIdx, pauseMs, spikeIdx, spikePx, curvyMul };
}

/**
 * Check for outlier based on session state and profile multipliers
 */
function checkForOutlier(opts) {
  const { sessionState, forceOutlier, profileMultipliers } = opts;
  
  // If forced outlier, return it
  if (forceOutlier) {
    const outlierInfo = selectOutlier({}, DEFAULTS, 15); // Default 15 steps
    outlierInfo.type = forceOutlier;
    return outlierInfo;
  }
  
  // Check for natural outlier based on session state
  const outlierChance = DEFAULTS.outlierChance;
  const outlierWeights = DEFAULTS.outlierWeights;
  
  // Apply profile multipliers
  const profileOutlierChance = profileMultipliers.outlierChance || 1.0;
  const finalOutlierChance = outlierChance * profileOutlierChance;
  
  if (Math.random() < finalOutlierChance) {
    return selectOutlier({}, DEFAULTS, 15); // Default 15 steps
  }
  
  return {
    type: null,
    pauseIdx: null,
    pauseMs: 0,
    spikeIdx: null,
    spikePx: 0,
    curvyMul: 1
  };
}

module.exports = {
  selectOutlier,
  checkForOutlier
};
